/**
 * Inference Service for Studio
 *
 * Generates Contract IR from evidence events for evidence-only mode.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { EvidenceEvent } from '@docsmyth/evidence-sdk';
import type {
    ContractIR,
    HttpOperation,
    HttpResponse,
    JsonSchemaObject,
    HttpMethod,
    HttpParameter,
} from '@docsmyth/ir-spec';
import type { CacheEntry } from '../types.js';

/**
 * UUID patterns
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_NODASH_PATTERN = /^[0-9a-f]{32}$/i;
const NUMERIC_PATTERN = /^\d+$/;
const OBJECTID_PATTERN = /^[0-9a-f]{24}$/i;
const SHORT_ID_PATTERN = /^[a-zA-Z0-9_-]{6,22}$/;

/**
 * Cache for inferred contracts
 */
const inferredContractCache = new Map<string, CacheEntry<ContractIR>>();

/**
 * Check if segment is likely a parameter
 */
function isLikelyParameter(segment: string): boolean {
    if (!segment) return false;
    if (NUMERIC_PATTERN.test(segment)) return true;
    if (UUID_PATTERN.test(segment)) return true;
    if (UUID_NODASH_PATTERN.test(segment)) return true;
    if (OBJECTID_PATTERN.test(segment)) return true;
    if (SHORT_ID_PATTERN.test(segment) && /\d/.test(segment) && /[a-zA-Z]/.test(segment)) {
        return true;
    }
    return false;
}

/**
 * Normalize a path to template
 */
function normalizePath(path: string): { template: string; params: Record<string, string> } {
    const segments = path.split('/').filter(Boolean);
    const templateSegments: string[] = [];
    const params: Record<string, string> = {};
    let paramCounter = 0;

    for (const segment of segments) {
        if (isLikelyParameter(segment)) {
            paramCounter++;
            const paramName = `param${paramCounter}`;
            templateSegments.push(`{${paramName}}`);
            params[paramName] = segment;
        } else {
            templateSegments.push(segment);
        }
    }

    return {
        template: '/' + templateSegments.join('/'),
        params,
    };
}

/**
 * Infer semantic operation ID
 */
function inferSemanticOperationId(method: string, normalizedPath: string): string {
    const segments = normalizedPath.split('/').filter(Boolean);
    // Find last non-param segment (backward compatible)
    let lastNonParam: string | undefined;
    for (let i = segments.length - 1; i >= 0; i--) {
        if (!segments[i].startsWith('{')) {
            lastNonParam = segments[i];
            break;
        }
    }
    const hasParam = segments.some((s: string) => s.startsWith('{'));
    const resource = lastNonParam || 'resource';

    const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;
    const plural = resource.endsWith('s') ? resource : resource + 's';
    const upperMethod = method.toUpperCase();

    const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

    if (upperMethod === 'GET' && !hasParam) return `list${capitalize(plural)}`;
    if (upperMethod === 'GET' && hasParam) return `get${capitalize(singular)}`;
    if (upperMethod === 'POST' && !hasParam) return `create${capitalize(singular)}`;
    if (upperMethod === 'PUT' && hasParam) return `update${capitalize(singular)}`;
    if (upperMethod === 'PATCH' && hasParam) return `patch${capitalize(singular)}`;
    if (upperMethod === 'DELETE' && hasParam) return `delete${capitalize(singular)}`;

    return `${method.toLowerCase()}${capitalize(resource)}`;
}

/**
 * Group evidence for inference
 */
interface OperationEvidence {
    operationId: string;
    method: string;
    pathTemplate: string;
    requests: Array<{ body?: unknown; query?: Record<string, unknown>; params?: Record<string, string> }>;
    responses: Map<number, unknown[]>;
}

function groupByOperation(events: EvidenceEvent[]): Map<string, OperationEvidence> {
    const groups = new Map<string, OperationEvidence>();

    for (const event of events) {
        const method = event.request.method.toUpperCase();
        const path = event.request.path;
        const normalized = normalizePath(path);
        const pathTemplate = normalized.template;

        let operationId: string;
        if (event.operationId && !event.operationId.startsWith('_') && !event.operationId.includes(' ')) {
            operationId = event.operationId;
        } else {
            operationId = inferSemanticOperationId(method, pathTemplate);
        }

        const key = `${method} ${pathTemplate}`;

        if (!groups.has(key)) {
            groups.set(key, {
                operationId,
                method,
                pathTemplate,
                requests: [],
                responses: new Map(),
            });
        }

        const group = groups.get(key)!;

        group.requests.push({
            body: event.request.body,
            query: event.request.query,
            params: normalized.params,
        });

        const status = event.response.status;
        if (!group.responses.has(status)) {
            group.responses.set(status, []);
        }
        if (event.response.body !== undefined) {
            group.responses.get(status)!.push(event.response.body);
        }
    }

    return groups;
}

/**
 * Infer schema from value
 */
function inferSchemaFromValue(value: unknown): JsonSchemaObject {
    if (value === null) return { type: 'null' };

    if (Array.isArray(value)) {
        if (value.length === 0) return { type: 'array', items: {} };
        const itemSchemas = value.slice(0, 5).map(inferSchemaFromValue);
        return { type: 'array', items: mergeSchemas(itemSchemas) };
    }

    if (typeof value === 'object') {
        const properties: Record<string, JsonSchemaObject> = {};
        const required: string[] = [];

        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            properties[key] = inferSchemaFromValue(val);
            required.push(key);
        }

        return {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
            additionalProperties: true,
        };
    }

    if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
            return { type: 'string', format: 'date-time' };
        }
        if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
            return { type: 'string', format: 'email' };
        }
        if (/^https?:\/\//.test(value)) {
            return { type: 'string', format: 'uri' };
        }
        if (UUID_PATTERN.test(value)) {
            return { type: 'string', format: 'uuid' };
        }
        return { type: 'string' };
    }

    if (typeof value === 'number') {
        return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    }

    if (typeof value === 'boolean') return { type: 'boolean' };

    return {};
}

/**
 * Merge schemas
 */
function mergeSchemas(schemas: JsonSchemaObject[]): JsonSchemaObject {
    if (schemas.length === 0) return {};
    if (schemas.length === 1) return schemas[0];

    const types = new Set(schemas.map((s) => s.type));

    if (types.size === 1) {
        const type = schemas[0].type;

        if (type === 'object') {
            const allProperties = new Map<string, JsonSchemaObject[]>();
            const propertyPresence = new Map<string, number>();

            for (const schema of schemas) {
                if (schema.properties) {
                    for (const [key, prop] of Object.entries(schema.properties)) {
                        if (!allProperties.has(key)) {
                            allProperties.set(key, []);
                            propertyPresence.set(key, 0);
                        }
                        allProperties.get(key)!.push(prop as JsonSchemaObject);
                        propertyPresence.set(key, (propertyPresence.get(key) || 0) + 1);
                    }
                }
            }

            const mergedProperties: Record<string, JsonSchemaObject> = {};
            const required: string[] = [];

            for (const [key, props] of allProperties) {
                mergedProperties[key] = mergeSchemas(props);
                if (propertyPresence.get(key) === schemas.length) {
                    required.push(key);
                }
            }

            return {
                type: 'object',
                properties: mergedProperties,
                required: required.length > 0 ? required : undefined,
                additionalProperties: true,
            };
        }

        if (type === 'array') {
            const itemSchemas = schemas
                .filter((s) => s.items && typeof s.items === 'object')
                .map((s) => s.items as JsonSchemaObject);

            return {
                type: 'array',
                items: itemSchemas.length > 0 ? mergeSchemas(itemSchemas) : {},
            };
        }
    }

    return { additionalProperties: true };
}

/**
 * Extract path params from template
 */
function extractPathParams(pathTemplate: string): HttpParameter[] {
    const params: HttpParameter[] = [];
    const regex = /\{([^}]+)\}/g;
    let match;

    while ((match = regex.exec(pathTemplate)) !== null) {
        params.push({
            name: match[1],
            in: 'path',
            required: true,
            schema: { type: 'string' },
        });
    }

    return params;
}

/**
 * Read evidence events from file
 */
async function readEvidenceEvents(evidencePath: string): Promise<EvidenceEvent[]> {
    if (!existsSync(evidencePath)) {
        return [];
    }

    const events: EvidenceEvent[] = [];
    const fileStream = createReadStream(evidencePath, 'utf-8');
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const event = JSON.parse(trimmed) as EvidenceEvent;
            events.push(event);
        } catch {
            // Skip invalid lines
        }
    }

    return events;
}

/**
 * Infer contract from evidence file
 */
export async function inferContractFromEvidence(
    evidencePath: string,
    serviceName: string = 'inferred-service',
    serviceVersion: string = '0.0.1',
    useCache: boolean = true
): Promise<ContractIR> {
    // Check cache
    if (useCache && existsSync(evidencePath)) {
        const stats = statSync(evidencePath);
        const cached = inferredContractCache.get(evidencePath);
        if (cached && cached.mtime === stats.mtimeMs && cached.size === stats.size) {
            return cached.data;
        }
    }

    const events = await readEvidenceEvents(evidencePath);

    if (events.length === 0) {
        return {
            irVersion: '0.1',
            service: { name: serviceName, version: serviceVersion },
            schemas: {},
            operations: [],
        };
    }

    const groups = groupByOperation(events);

    const operations: HttpOperation[] = [];
    const schemas: Record<string, JsonSchemaObject> = {};
    const usedOperationIds = new Set<string>();

    for (const [, group] of groups) {
        let { operationId } = group;

        let uniqueId = operationId;
        let counter = 1;
        while (usedOperationIds.has(uniqueId)) {
            uniqueId = `${operationId}${counter}`;
            counter++;
        }
        operationId = uniqueId;
        usedOperationIds.add(operationId);

        let requestBodySchema: JsonSchemaObject | undefined;
        const requestBodies = group.requests
            .map((r) => r.body)
            .filter((b) => b !== undefined && b !== null);

        if (requestBodies.length > 0) {
            const bodySchemas = requestBodies.map(inferSchemaFromValue);
            requestBodySchema = mergeSchemas(bodySchemas);
            if (requestBodySchema.type === 'object') {
                const schemaName = `${operationId}Request`;
                schemas[schemaName] = { $id: schemaName, ...requestBodySchema };
            }
        }

        const responses: HttpResponse[] = [];
        for (const [status, bodies] of group.responses) {
            const bodySchemas = bodies.map(inferSchemaFromValue);
            const mergedSchema = mergeSchemas(bodySchemas);

            let responseSchema: { $ref: `schema:${string}` } | JsonSchemaObject;
            if (mergedSchema.type === 'object' || mergedSchema.type === 'array') {
                const schemaName = `${operationId}Response${status}`;
                schemas[schemaName] = { $id: schemaName, ...mergedSchema };
                responseSchema = { $ref: `schema:${schemaName}` };
            } else {
                responseSchema = mergedSchema;
            }

            responses.push({
                statusCode: status,
                contentType: 'application/json',
                schema: responseSchema,
            });
        }

        responses.sort((a, b) => a.statusCode - b.statusCode);

        const pathParams = extractPathParams(group.pathTemplate);

        const operation: HttpOperation = {
            operationId,
            method: group.method as HttpMethod,
            path: group.pathTemplate,
            parameters: pathParams.length > 0 ? pathParams : undefined,
            responses: responses.length > 0 ? responses : [{ statusCode: 200 }],
        };

        if (requestBodySchema) {
            const schemaName = `${operationId}Request`;
            operation.requestBody = {
                required: true,
                contentType: 'application/json',
                schema: schemas[schemaName] ? { $ref: `schema:${schemaName}` } : requestBodySchema,
            };
        }

        operations.push(operation);
    }

    operations.sort((a, b) => {
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        return a.method.localeCompare(b.method);
    });

    const contract: ContractIR = {
        irVersion: '0.1',
        service: { name: serviceName, version: serviceVersion },
        schemas,
        operations,
    };

    // Cache the result
    if (useCache && existsSync(evidencePath)) {
        const stats = statSync(evidencePath);
        inferredContractCache.set(evidencePath, {
            data: contract,
            mtime: stats.mtimeMs,
            size: stats.size,
        });
    }

    return contract;
}

/**
 * Clear inference cache
 */
export function clearInferenceCache(evidencePath?: string): void {
    if (evidencePath) {
        inferredContractCache.delete(evidencePath);
    } else {
        inferredContractCache.clear();
    }
}
