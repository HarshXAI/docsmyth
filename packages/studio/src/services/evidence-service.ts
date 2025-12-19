/**
 * Evidence Service
 *
 * Handles evidence file operations: streaming read, pagination, verification.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { ContractIR, JsonSchemaObject } from '@docsmyth/ir-spec';
import type { EvidenceEvent, VerificationError } from '@docsmyth/evidence-sdk';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type {
    CacheEntry,
    EvidenceSummary,
    EventSummary,
    PaginatedEventsResponse,
    FullEventResponse,
    EvidenceVerificationResult,
} from '../types.js';

/**
 * Indexed evidence data
 */
interface EvidenceIndex {
    events: EventSummary[];
    eventOffsets: number[];
    byOperationId: Map<string, number[]>;
    byStatus: Map<number, number[]>;
    byValidity: { valid: number[]; invalid: number[] };
    validationErrors: Map<number, VerificationError[]>;
    summary: EvidenceSummary;
}

/**
 * Cache for evidence indexes
 */
const evidenceCache = new Map<string, CacheEntry<EvidenceIndex>>();

/**
 * Create AJV validator instance
 */
function createValidator(): Ajv.default {
    const ajv = new Ajv.default({
        strict: false,
        allErrors: true,
        verbose: true,
    });
    addFormats.default(ajv);
    return ajv;
}

/**
 * Convert IR schema ref to schema object
 */
function resolveSchema(
    schemaOrRef: { $ref: string } | JsonSchemaObject | undefined,
    schemas: Record<string, JsonSchemaObject>
): JsonSchemaObject | undefined {
    if (!schemaOrRef) return undefined;

    if ('$ref' in schemaOrRef && typeof schemaOrRef.$ref === 'string') {
        const ref = schemaOrRef.$ref;
        if (ref.startsWith('schema:')) {
            const id = ref.slice(7);
            return schemas[id];
        }
    }

    return schemaOrRef as JsonSchemaObject;
}

/**
 * Validate a single event against a contract
 */
function validateEvent(
    event: EvidenceEvent,
    eventIndex: number,
    contract: ContractIR,
    ajv: Ajv.default
): VerificationError[] {
    const errors: VerificationError[] = [];

    // Find operation
    const operation = contract.operations.find((op) => op.operationId === event.operationId);

    if (!operation) {
        errors.push({
            eventIndex,
            operationId: event.operationId,
            phase: 'request',
            schemaPath: '',
            message: `Unknown operation: ${event.operationId}`,
        });
        return errors;
    }

    // Validate request body
    if (event.request.body !== undefined && operation.requestBody?.schema) {
        const schema = resolveSchema(operation.requestBody.schema, contract.schemas);
        if (schema) {
            const validate = ajv.compile(schema);
            if (!validate(event.request.body)) {
                for (const err of validate.errors || []) {
                    errors.push({
                        eventIndex,
                        operationId: event.operationId,
                        phase: 'request',
                        schemaPath: err.schemaPath,
                        message: `Request body: ${err.message} at ${err.instancePath}`,
                    });
                }
            }
        }
    }

    // Validate response body
    const status = event.response.status;
    const responseSpec = operation.responses.find((r) => r.statusCode === status);

    if (!responseSpec) {
        // Unknown status code - might be drift
        errors.push({
            eventIndex,
            operationId: event.operationId,
            phase: 'response',
            schemaPath: '',
            message: `Unexpected status code: ${status}`,
        });
    } else if (event.response.body !== undefined && responseSpec.schema) {
        const schema = resolveSchema(responseSpec.schema, contract.schemas);
        if (schema) {
            const validate = ajv.compile(schema);
            if (!validate(event.response.body)) {
                for (const err of validate.errors || []) {
                    errors.push({
                        eventIndex,
                        operationId: event.operationId,
                        phase: 'response',
                        schemaPath: err.schemaPath,
                        message: `Response body: ${err.message} at ${err.instancePath}`,
                    });
                }
            }
        }
    }

    return errors;
}

/**
 * Build evidence index by streaming the file
 */
async function buildEvidenceIndex(
    evidencePath: string,
    contract: ContractIR
): Promise<EvidenceIndex> {
    const events: EventSummary[] = [];
    const eventOffsets: number[] = [];
    const byOperationId = new Map<string, number[]>();
    const byStatus = new Map<number, number[]>();
    const byValidity = { valid: [] as number[], invalid: [] as number[] };
    const validationErrors = new Map<number, VerificationError[]>();

    const ajv = createValidator();
    let totalEvents = 0;
    let validEvents = 0;
    let invalidEvents = 0;
    let firstTimestamp: string | undefined;
    let lastTimestamp: string | undefined;
    const statusCounts: Record<number, number> = {};
    const opCounts: Record<string, { total: number; valid: number; invalid: number }> = {};

    const fileStream = createReadStream(evidencePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

    let lineIndex = 0;
    let byteOffset = 0;

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
            byteOffset += Buffer.byteLength(line, 'utf-8') + 1;
            continue;
        }

        eventOffsets.push(byteOffset);
        byteOffset += Buffer.byteLength(line, 'utf-8') + 1;

        let event: EvidenceEvent;
        try {
            event = JSON.parse(trimmed) as EvidenceEvent;
        } catch {
            // Parse error - mark as invalid
            events.push({
                index: lineIndex,
                operationId: 'unknown',
                method: 'UNKNOWN',
                path: '',
                status: 0,
                timestamp: '',
                valid: false,
                errorCount: 1,
            });
            validationErrors.set(lineIndex, [
                {
                    eventIndex: lineIndex,
                    operationId: 'unknown',
                    phase: 'request',
                    schemaPath: '',
                    message: 'Failed to parse JSON',
                },
            ]);
            byValidity.invalid.push(lineIndex);
            invalidEvents++;
            lineIndex++;
            continue;
        }

        // Validate event
        const errors = validateEvent(event, lineIndex, contract, ajv);
        const isValid = errors.length === 0;

        // Build summary
        const summary: EventSummary = {
            index: lineIndex,
            operationId: event.operationId,
            method: event.request.method,
            path: event.request.path,
            status: event.response.status,
            timestamp: event.timestamp,
            valid: isValid,
            errorCount: errors.length > 0 ? errors.length : undefined,
        };
        events.push(summary);

        // Index by operation
        if (!byOperationId.has(event.operationId)) {
            byOperationId.set(event.operationId, []);
        }
        byOperationId.get(event.operationId)!.push(lineIndex);

        // Index by status
        if (!byStatus.has(event.response.status)) {
            byStatus.set(event.response.status, []);
        }
        byStatus.get(event.response.status)!.push(lineIndex);

        // Index by validity
        if (isValid) {
            byValidity.valid.push(lineIndex);
            validEvents++;
        } else {
            byValidity.invalid.push(lineIndex);
            invalidEvents++;
            validationErrors.set(lineIndex, errors);
        }

        // Update stats
        totalEvents++;
        statusCounts[event.response.status] = (statusCounts[event.response.status] || 0) + 1;

        if (!opCounts[event.operationId]) {
            opCounts[event.operationId] = { total: 0, valid: 0, invalid: 0 };
        }
        opCounts[event.operationId].total++;
        if (isValid) {
            opCounts[event.operationId].valid++;
        } else {
            opCounts[event.operationId].invalid++;
        }

        // Track timestamps
        if (!firstTimestamp || event.timestamp < firstTimestamp) {
            firstTimestamp = event.timestamp;
        }
        if (!lastTimestamp || event.timestamp > lastTimestamp) {
            lastTimestamp = event.timestamp;
        }

        lineIndex++;
    }

    const result: EvidenceIndex = {
        events,
        eventOffsets,
        byOperationId,
        byStatus,
        byValidity,
        validationErrors,
        summary: {
            totalEvents,
            validEvents,
            invalidEvents,
            byOperationId: opCounts,
            byStatus: statusCounts,
            firstTimestamp,
            lastTimestamp,
        },
    };

    return result;
}

/**
 * Get or build evidence index with caching
 */
async function getEvidenceIndex(
    evidencePath: string,
    contract: ContractIR,
    useCache: boolean = true
): Promise<EvidenceIndex> {
    if (!existsSync(evidencePath)) {
        throw new Error(`Evidence file not found: ${evidencePath}`);
    }

    const stats = await stat(evidencePath);
    const mtime = stats.mtimeMs;
    const size = stats.size;

    // Check cache
    if (useCache) {
        const cached = evidenceCache.get(evidencePath);
        if (cached && cached.mtime === mtime && cached.size === size) {
            return cached.data;
        }
    }

    // Build index
    const index = await buildEvidenceIndex(evidencePath, contract);

    // Cache the result
    evidenceCache.set(evidencePath, { data: index, mtime, size });

    return index;
}

/**
 * Get evidence summary
 */
export async function getEvidenceSummary(
    evidencePath: string,
    contract: ContractIR,
    useCache: boolean = true
): Promise<EvidenceSummary> {
    const index = await getEvidenceIndex(evidencePath, contract, useCache);
    return index.summary;
}

/**
 * Get paginated events
 */
export async function getEvents(
    evidencePath: string,
    contract: ContractIR,
    options: {
        page?: number;
        pageSize?: number;
        operationId?: string;
        status?: number;
        valid?: boolean;
        q?: string;
    } = {},
    useCache: boolean = true
): Promise<PaginatedEventsResponse> {
    const { page = 1, pageSize = 50, operationId, status, valid, q } = options;

    const index = await getEvidenceIndex(evidencePath, contract, useCache);
    let filtered = index.events;

    // Filter by operationId
    if (operationId) {
        const indices = index.byOperationId.get(operationId) || [];
        filtered = filtered.filter((e) => indices.includes(e.index));
    }

    // Filter by status
    if (status !== undefined) {
        const indices = index.byStatus.get(status) || [];
        filtered = filtered.filter((e) => indices.includes(e.index));
    }

    // Filter by validity
    if (valid !== undefined) {
        const indices = valid ? index.byValidity.valid : index.byValidity.invalid;
        filtered = filtered.filter((e) => indices.includes(e.index));
    }

    // Filter by search query
    if (q) {
        const query = q.toLowerCase();
        filtered = filtered.filter(
            (e) =>
                e.operationId.toLowerCase().includes(query) ||
                e.path.toLowerCase().includes(query) ||
                e.method.toLowerCase().includes(query)
        );
    }

    // Paginate
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const events = filtered.slice(start, end);

    return {
        events,
        total,
        page,
        pageSize,
        hasMore: end < total,
    };
}

/**
 * Get a single event by index
 */
export async function getEvent(
    evidencePath: string,
    contract: ContractIR,
    eventIndex: number,
    useCache: boolean = true
): Promise<FullEventResponse> {
    const index = await getEvidenceIndex(evidencePath, contract, useCache);

    if (eventIndex < 0 || eventIndex >= index.events.length) {
        throw new Error(`Event index out of range: ${eventIndex}`);
    }

    // Read the event from file at the offset
    const offset = index.eventOffsets[eventIndex];
    const fileStream = createReadStream(evidencePath, {
        encoding: 'utf-8',
        start: offset,
    });
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

    let event: EvidenceEvent | null = null;
    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed) {
            event = JSON.parse(trimmed) as EvidenceEvent;
            break;
        }
    }

    rl.close();
    fileStream.destroy();

    if (!event) {
        throw new Error(`Failed to read event at index ${eventIndex}`);
    }

    const errors = index.validationErrors.get(eventIndex) || [];

    return {
        event,
        index: eventIndex,
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Verify all evidence
 */
export async function verifyEvidence(
    evidencePath: string,
    contract: ContractIR,
    useCache: boolean = true
): Promise<EvidenceVerificationResult> {
    const index = await getEvidenceIndex(evidencePath, contract, useCache);

    const allErrors: VerificationError[] = [];
    for (const errors of index.validationErrors.values()) {
        allErrors.push(...errors);
    }

    return {
        ok: index.summary.invalidEvents === 0,
        totalEvents: index.summary.totalEvents,
        validEvents: index.summary.validEvents,
        invalidEvents: index.summary.invalidEvents,
        errors: allErrors,
    };
}

/**
 * Check if evidence file exists
 */
export function evidenceExists(evidencePath: string): boolean {
    return existsSync(evidencePath);
}

/**
 * Get evidence file stats
 */
export function getEvidenceStats(evidencePath: string): { mtime: number; size: number } | null {
    if (!existsSync(evidencePath)) {
        return null;
    }
    const stats = statSync(evidencePath);
    return { mtime: stats.mtimeMs, size: stats.size };
}

/**
 * Clear evidence cache
 */
export function clearEvidenceCache(): void {
    evidenceCache.clear();
}
