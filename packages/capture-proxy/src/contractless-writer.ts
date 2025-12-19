/**
 * Contractless Evidence Writer
 *
 * Evidence writer that works without a Contract IR.
 * Used by the record command to capture evidence from any HTTP traffic.
 * Generates operationIds from method + normalized path.
 */

import { appendFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EvidenceEvent } from '@docsmyth/evidence-sdk';
import { sanitize, type SanitizeConfig } from '@docsmyth/evidence-sdk';
import type { Logger } from './logger.js';

/**
 * UUID-like pattern
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_NODASH_PATTERN = /^[0-9a-f]{32}$/i;
const NUMERIC_PATTERN = /^\d+$/;
const OBJECTID_PATTERN = /^[0-9a-f]{24}$/i;
const SHORT_ID_PATTERN = /^[a-zA-Z0-9_-]{6,22}$/;

/**
 * Check if a path segment is likely a dynamic parameter
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
 * Normalized path result
 */
interface NormalizedPath {
    template: string;
    params: Record<string, string>;
}

/**
 * Normalize a request path by replacing dynamic segments with parameters
 */
function normalizePath(path: string): NormalizedPath {
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
 * Generate operationId from method and normalized path
 */
function generateOperationId(method: string, normalizedPath: string): string {
    return `${method.toUpperCase()} ${normalizedPath}`;
}

/**
 * Options for the contractless evidence writer
 */
export interface ContractlessWriterOptions {
    /** Output file path for NDJSON */
    outputPath: string;
    /** Maximum body size in bytes before truncation */
    maxBodyBytes?: number;
    /** Maximum events per second (0 = unlimited) */
    eventRateLimit?: number;
    /** Custom sanitization config */
    sanitizeConfig?: SanitizeConfig;
    /** Logger instance */
    logger: Logger;
}

/**
 * Default max body bytes
 */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/**
 * Default event rate limit
 */
export const DEFAULT_EVENT_RATE_LIMIT = 100;

/**
 * Contractless evidence writer interface
 */
export interface ContractlessWriter {
    /** Write an evidence event */
    write(
        method: string,
        path: string,
        requestHeaders: Record<string, string>,
        requestBody: unknown,
        query: Record<string, unknown> | undefined,
        status: number,
        responseHeaders: Record<string, string>,
        responseBody: unknown,
        traceId?: string
    ): boolean;

    /** Get count of written events */
    getEventCount(): number;

    /** Get count of dropped events */
    getDroppedCount(): number;

    /** Flush any buffered writes */
    flush(): void;
}

/**
 * Truncation marker
 */
const TRUNCATION_MARKER = '[TRUNCATED]';

/**
 * Rate limiter state
 */
interface RateLimiterState {
    windowStart: number;
    eventCount: number;
}

/**
 * Create a contractless evidence writer
 */
export function createContractlessWriter(
    options: ContractlessWriterOptions
): ContractlessWriter {
    const {
        outputPath,
        maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
        eventRateLimit = DEFAULT_EVENT_RATE_LIMIT,
        sanitizeConfig,
        logger,
    } = options;

    // Ensure output directory exists
    const dir = dirname(outputPath);
    if (dir && !existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    // Clear existing file or create new one
    if (!existsSync(outputPath)) {
        writeFileSync(outputPath, '', 'utf-8');
    }

    let eventCount = 0;
    let droppedCount = 0;

    const rateLimiter: RateLimiterState = {
        windowStart: Date.now(),
        eventCount: 0,
    };

    function shouldRateLimit(): boolean {
        if (eventRateLimit <= 0) return false;

        const now = Date.now();
        const windowMs = 1000;

        if (now - rateLimiter.windowStart >= windowMs) {
            rateLimiter.windowStart = now;
            rateLimiter.eventCount = 0;
        }

        if (rateLimiter.eventCount >= eventRateLimit) {
            return true;
        }

        rateLimiter.eventCount++;
        return false;
    }

    function truncateBody(body: unknown): unknown {
        if (body === undefined || body === null) {
            return body;
        }

        const serialized = JSON.stringify(body);
        if (serialized.length <= maxBodyBytes) {
            return body;
        }

        return {
            _truncated: true,
            _originalSizeBytes: serialized.length,
            _maxSizeBytes: maxBodyBytes,
            _marker: TRUNCATION_MARKER,
        };
    }

    return {
        write(
            method: string,
            path: string,
            requestHeaders: Record<string, string>,
            requestBody: unknown,
            query: Record<string, unknown> | undefined,
            status: number,
            responseHeaders: Record<string, string>,
            responseBody: unknown,
            traceId?: string
        ): boolean {
            if (shouldRateLimit()) {
                droppedCount++;
                if (droppedCount % 100 === 0) {
                    logger.warn(`Rate limit exceeded, ${droppedCount} events dropped so far`);
                }
                return false;
            }

            try {
                // Normalize path and get operationId
                const normalized = normalizePath(path);
                const operationId = generateOperationId(method, normalized.template);

                // Build evidence event
                const event: EvidenceEvent = {
                    evidenceVersion: '0.1',
                    operationId,
                    protocol: 'http',
                    timestamp: new Date().toISOString(),
                    traceId: traceId ?? `rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`,
                    request: {
                        method: method.toUpperCase(),
                        path,
                        query,
                        params: Object.keys(normalized.params).length > 0 ? normalized.params : undefined,
                        headers: requestHeaders,
                        body: truncateBody(requestBody),
                    },
                    response: {
                        status,
                        headers: responseHeaders,
                        body: truncateBody(responseBody),
                    },
                };

                // Sanitize the event
                const sanitized = sanitize(event, sanitizeConfig);

                // Write to file
                const line = JSON.stringify(sanitized) + '\n';
                appendFileSync(outputPath, line, 'utf-8');
                eventCount++;
                return true;
            } catch (error) {
                logger.error('Failed to write evidence:', error);
                return false;
            }
        },

        getEventCount(): number {
            return eventCount;
        },

        getDroppedCount(): number {
            return droppedCount;
        },

        flush(): void {
            // Sync writes are already flushed
        },
    };
}
