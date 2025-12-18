/**
 * Evidence writer with sanitization and rate limiting
 */

import { appendFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EvidenceEvent } from '@acp/evidence-sdk';
import { sanitize, type SanitizeConfig } from '@acp/evidence-sdk';
import type { Logger } from './logger.js';

/**
 * Default maximum body size in bytes (64KB)
 */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/**
 * Default maximum events per second (rate limit)
 */
export const DEFAULT_EVENT_RATE_LIMIT = 100;

/**
 * Truncation marker for large bodies
 */
export const TRUNCATION_MARKER = '[TRUNCATED]';

/**
 * Options for the evidence writer
 */
export interface EvidenceWriterOptions {
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
 * Evidence writer interface
 */
export interface EvidenceWriter {
    /** Write an evidence event (sanitized and rate-limited) */
    write(event: EvidenceEvent): boolean;
    /** Get count of written events */
    getEventCount(): number;
    /** Get count of dropped events (due to rate limiting) */
    getDroppedCount(): number;
    /** Flush any buffered writes */
    flush(): void;
}

/**
 * Rate limiter state
 */
interface RateLimiterState {
    windowStart: number;
    eventCount: number;
}

/**
 * Create an evidence writer with sanitization and rate limiting
 */
export function createEvidenceWriter(options: EvidenceWriterOptions): EvidenceWriter {
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

    // Clear existing file
    writeFileSync(outputPath, '', 'utf-8');

    let eventCount = 0;
    let droppedCount = 0;

    // Rate limiter state (sliding window per second)
    const rateLimiter: RateLimiterState = {
        windowStart: Date.now(),
        eventCount: 0,
    };

    /**
     * Check if event should be rate limited
     */
    function shouldRateLimit(): boolean {
        if (eventRateLimit <= 0) return false;

        const now = Date.now();
        const windowMs = 1000; // 1 second window

        // Reset window if expired
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

    /**
     * Truncate body if too large
     */
    function truncateBody(body: unknown): unknown {
        if (body === undefined || body === null) {
            return body;
        }

        const serialized = JSON.stringify(body);
        if (serialized.length <= maxBodyBytes) {
            return body;
        }

        // Return a truncation indicator
        return {
            _truncated: true,
            _originalSizeBytes: serialized.length,
            _maxSizeBytes: maxBodyBytes,
            _marker: TRUNCATION_MARKER,
        };
    }

    /**
     * Prepare event for writing (truncate bodies)
     */
    function prepareEvent(event: EvidenceEvent): EvidenceEvent {
        return {
            ...event,
            request: {
                ...event.request,
                body: truncateBody(event.request.body),
            },
            response: {
                ...event.response,
                body: truncateBody(event.response.body),
            },
        };
    }

    return {
        write(event: EvidenceEvent): boolean {
            // Check rate limit
            if (shouldRateLimit()) {
                droppedCount++;
                if (droppedCount % 100 === 0) {
                    logger.warn(`Rate limit exceeded, ${droppedCount} events dropped so far`);
                }
                return false;
            }

            try {
                // Truncate large bodies
                const prepared = prepareEvent(event);

                // Sanitize the event
                const sanitized = sanitize(prepared, sanitizeConfig);

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
            // Sync writes are already flushed, nothing to do
        },
    };
}
