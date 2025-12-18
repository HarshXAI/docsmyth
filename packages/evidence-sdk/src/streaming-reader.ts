/**
 * Streaming Evidence Reader
 *
 * Provides streaming NDJSON reading with line-by-line processing
 * to avoid loading entire files into memory.
 */

import { createReadStream } from 'node:fs';
import { createInterface, type Interface } from 'node:readline';
import type { EvidenceEvent, VerificationResult, VerificationError, OperationVerificationSummary } from './types.js';

/**
 * Options for streaming verification
 */
export interface StreamingVerifyOptions {
    /** Maximum errors to collect before stopping (0 = unlimited) */
    maxErrors?: number;
    /** Callback for each event processed */
    onEvent?: (event: EvidenceEvent, eventIndex: number, valid: boolean, errors: VerificationError[]) => void;
    /** Callback for progress updates */
    onProgress?: (processed: number, valid: number, invalid: number) => void;
    /** Progress update interval in events */
    progressInterval?: number;
}

/**
 * Event validator function type
 */
export type EventValidator = (event: EvidenceEvent, eventIndex: number) => VerificationError[];

/**
 * Parse a single NDJSON line
 */
export function parseNdjsonLine(line: string, lineIndex: number): { event: EvidenceEvent | null; error: string | null } {
    const trimmed = line.trim();
    if (!trimmed) {
        return { event: null, error: null }; // Empty line, skip
    }

    try {
        const event = JSON.parse(trimmed) as EvidenceEvent;
        return { event, error: null };
    } catch (e) {
        return {
            event: null,
            error: `Failed to parse JSON at line ${lineIndex + 1}: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}

/**
 * Create a readline interface for streaming NDJSON
 */
export function createNdjsonReader(filePath: string): Interface {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    return createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });
}

/**
 * Stream and verify evidence events from an NDJSON file
 *
 * @param filePath - Path to the NDJSON file
 * @param validator - Function to validate each event
 * @param options - Streaming options
 * @returns Verification result
 */
export async function streamVerifyEvidence(
    filePath: string,
    validator: EventValidator,
    options: StreamingVerifyOptions = {}
): Promise<VerificationResult> {
    const {
        maxErrors = 0,
        onEvent,
        onProgress,
        progressInterval = 1000,
    } = options;

    const errors: VerificationError[] = [];
    const operationStats = new Map<string, { valid: number; invalid: number; errors: VerificationError[] }>();
    let totalEvents = 0;
    let validEvents = 0;
    let invalidEvents = 0;
    let stopped = false;

    const rl = createNdjsonReader(filePath);

    return new Promise((resolve, reject) => {
        let lineIndex = 0;

        rl.on('line', (line) => {
            if (stopped) return;

            const { event, error } = parseNdjsonLine(line, lineIndex);
            lineIndex++;

            if (error) {
                // Parse error
                const parseError: VerificationError = {
                    eventIndex: lineIndex - 1,
                    operationId: 'unknown',
                    phase: 'request',
                    schemaPath: '',
                    message: error,
                };
                errors.push(parseError);
                invalidEvents++;

                if (maxErrors > 0 && errors.length >= maxErrors) {
                    stopped = true;
                    rl.close();
                }
                return;
            }

            if (!event) {
                return; // Empty line, skip
            }

            totalEvents++;
            const { operationId } = event;

            // Initialize stats for this operation
            if (!operationStats.has(operationId)) {
                operationStats.set(operationId, { valid: 0, invalid: 0, errors: [] });
            }
            const stats = operationStats.get(operationId)!;

            // Validate the event
            const eventErrors = validator(event, totalEvents - 1);

            if (eventErrors.length === 0) {
                validEvents++;
                stats.valid++;
                onEvent?.(event, totalEvents - 1, true, []);
            } else {
                invalidEvents++;
                stats.invalid++;
                stats.errors.push(...eventErrors);
                errors.push(...eventErrors);
                onEvent?.(event, totalEvents - 1, false, eventErrors);

                if (maxErrors > 0 && errors.length >= maxErrors) {
                    stopped = true;
                    rl.close();
                }
            }

            // Progress callback
            if (onProgress && totalEvents % progressInterval === 0) {
                onProgress(totalEvents, validEvents, invalidEvents);
            }
        });

        rl.on('close', () => {
            // Final progress update
            if (onProgress && totalEvents % progressInterval !== 0) {
                onProgress(totalEvents, validEvents, invalidEvents);
            }

            // Build operation summaries
            const operationSummaries: OperationVerificationSummary[] = [];
            for (const [operationId, stats] of operationStats) {
                operationSummaries.push({
                    operationId,
                    totalEvents: stats.valid + stats.invalid,
                    validEvents: stats.valid,
                    invalidEvents: stats.invalid,
                    errors: stats.errors,
                });
            }

            // Sort summaries by operationId for deterministic output
            operationSummaries.sort((a, b) => a.operationId.localeCompare(b.operationId));

            resolve({
                valid: invalidEvents === 0,
                totalEvents,
                validEvents,
                invalidEvents,
                operationSummaries,
                errors,
            });
        });

        rl.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Count lines in an NDJSON file (for progress estimation)
 */
export async function countNdjsonLines(filePath: string): Promise<number> {
    const rl = createNdjsonReader(filePath);
    let count = 0;

    return new Promise((resolve, reject) => {
        rl.on('line', (line) => {
            if (line.trim()) count++;
        });
        rl.on('close', () => resolve(count));
        rl.on('error', reject);
    });
}

/**
 * Iterate over evidence events in an NDJSON file
 */
export async function* iterateEvidence(filePath: string): AsyncGenerator<{ event: EvidenceEvent; index: number; error?: string }> {
    const rl = createNdjsonReader(filePath);
    let index = 0;

    for await (const line of rl) {
        const { event, error } = parseNdjsonLine(line, index);
        if (event) {
            yield { event, index };
        } else if (error) {
            yield { event: null as unknown as EvidenceEvent, index, error };
        }
        index++;
    }
}
