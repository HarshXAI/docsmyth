/**
 * Streaming Evidence Writer
 *
 * Provides streaming NDJSON writing with file size limits, rotation,
 * rate limiting, and deduplication support.
 */

import { createHash } from 'node:crypto';
import type { EvidenceEvent } from './types.js';

/**
 * Default limits for evidence writing
 */
export const DEFAULT_LIMITS = {
    /** Maximum file size in bytes before rotation (default: 100MB) */
    maxFileBytes: 100 * 1024 * 1024,
    /** Maximum events per run (0 = unlimited) */
    maxEventsPerRun: 0,
    /** Maximum events per operation (0 = unlimited) */
    maxEventsPerOperation: 1000,
    /** Maximum events per second (0 = unlimited) */
    maxEventsPerSecond: 100,
    /** Window size for deduplication in ms (0 = disabled) */
    dedupeWindowMs: 60000,
} as const;

/**
 * Options for the streaming evidence writer
 */
export interface StreamingWriterOptions {
    /** Maximum file size in bytes before rotation */
    maxFileBytes?: number;
    /** Maximum events per run (0 = unlimited) */
    maxEventsPerRun?: number;
    /** Maximum events per operation (0 = unlimited) */
    maxEventsPerOperation?: number;
    /** Maximum events per second (0 = unlimited) */
    maxEventsPerSecond?: number;
    /** Whether to deduplicate events by hash */
    enableDedupe?: boolean;
    /** Window size for deduplication in ms */
    dedupeWindowMs?: number;
    /** Callback when file is rotated */
    onRotate?: (oldPath: string, newPath: string) => void;
    /** Callback when limits are reached */
    onLimitReached?: (limitType: LimitType, details: LimitDetails) => void;
    /** Callback when event is deduplicated */
    onDedupe?: (event: EvidenceEvent) => void;
}

/**
 * Types of limits that can be reached
 */
export type LimitType =
    | 'file-size'
    | 'events-per-run'
    | 'events-per-operation'
    | 'rate-limit';

/**
 * Details about a reached limit
 */
export interface LimitDetails {
    type: LimitType;
    current: number;
    limit: number;
    operationId?: string;
}

/**
 * Write result from the streaming writer
 */
export interface WriteResult {
    success: boolean;
    written: boolean;
    reason?: 'deduplicated' | 'rate-limited' | 'file-limit' | 'run-limit' | 'operation-limit' | 'error';
    filePath?: string;
    fileIndex?: number;
}

/**
 * Statistics from the streaming writer
 */
export interface WriterStats {
    totalEvents: number;
    writtenEvents: number;
    deduplicatedEvents: number;
    rateLimitedEvents: number;
    fileLimitEvents: number;
    operationLimitEvents: number;
    currentFileBytes: number;
    currentFileIndex: number;
    eventsPerOperation: Record<string, number>;
}

/**
 * Internal state for rate limiting
 */
interface RateLimiterState {
    windowStart: number;
    eventCount: number;
}

/**
 * Internal state for deduplication
 */
interface DedupeEntry {
    hash: string;
    timestamp: number;
}

/**
 * Streaming evidence writer implementation
 */
export class StreamingEvidenceWriter {
    private readonly options: Required<Omit<StreamingWriterOptions, 'onRotate' | 'onLimitReached' | 'onDedupe'>>;
    private readonly onRotate?: (oldPath: string, newPath: string) => void;
    private readonly onLimitReached?: (limitType: LimitType, details: LimitDetails) => void;
    private readonly onDedupe?: (event: EvidenceEvent) => void;

    private currentFileBytes = 0;
    private currentFileIndex = 0;
    private totalEvents = 0;
    private writtenEvents = 0;
    private deduplicatedEvents = 0;
    private rateLimitedEvents = 0;
    private fileLimitEvents = 0;
    private operationLimitEvents = 0;
    private eventsPerOperation = new Map<string, number>();
    private rateLimiter: RateLimiterState = { windowStart: Date.now(), eventCount: 0 };
    private dedupeCache = new Map<string, DedupeEntry>();
    private stopped = false;

    private writeCallback: (line: string, fileIndex: number) => void;
    private basePath: string;

    constructor(
        basePath: string,
        writeCallback: (line: string, fileIndex: number) => void,
        options: StreamingWriterOptions = {}
    ) {
        this.basePath = basePath;
        this.writeCallback = writeCallback;
        this.options = {
            maxFileBytes: options.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes,
            maxEventsPerRun: options.maxEventsPerRun ?? DEFAULT_LIMITS.maxEventsPerRun,
            maxEventsPerOperation: options.maxEventsPerOperation ?? DEFAULT_LIMITS.maxEventsPerOperation,
            maxEventsPerSecond: options.maxEventsPerSecond ?? DEFAULT_LIMITS.maxEventsPerSecond,
            enableDedupe: options.enableDedupe ?? false,
            dedupeWindowMs: options.dedupeWindowMs ?? DEFAULT_LIMITS.dedupeWindowMs,
        };
        this.onRotate = options.onRotate;
        this.onLimitReached = options.onLimitReached;
        this.onDedupe = options.onDedupe;
    }

    /**
     * Write an evidence event
     */
    write(event: EvidenceEvent): WriteResult {
        this.totalEvents++;

        if (this.stopped) {
            return { success: false, written: false, reason: 'run-limit' };
        }

        // Check run limit
        if (this.options.maxEventsPerRun > 0 && this.writtenEvents >= this.options.maxEventsPerRun) {
            this.stopped = true;
            this.onLimitReached?.('events-per-run', {
                type: 'events-per-run',
                current: this.writtenEvents,
                limit: this.options.maxEventsPerRun,
            });
            return { success: false, written: false, reason: 'run-limit' };
        }

        // Check operation limit
        const opCount = this.eventsPerOperation.get(event.operationId) ?? 0;
        if (this.options.maxEventsPerOperation > 0 && opCount >= this.options.maxEventsPerOperation) {
            this.operationLimitEvents++;
            this.onLimitReached?.('events-per-operation', {
                type: 'events-per-operation',
                current: opCount,
                limit: this.options.maxEventsPerOperation,
                operationId: event.operationId,
            });
            return { success: false, written: false, reason: 'operation-limit' };
        }

        // Check rate limit
        if (this.shouldRateLimit()) {
            this.rateLimitedEvents++;
            return { success: false, written: false, reason: 'rate-limited' };
        }

        // Check deduplication
        if (this.options.enableDedupe && this.isDuplicate(event)) {
            this.deduplicatedEvents++;
            this.onDedupe?.(event);
            return { success: true, written: false, reason: 'deduplicated' };
        }

        // Serialize event
        const line = JSON.stringify(event) + '\n';
        const lineBytes = Buffer.byteLength(line, 'utf-8');

        // Check file size limit
        if (this.options.maxFileBytes > 0 && this.currentFileBytes + lineBytes > this.options.maxFileBytes) {
            // Rotate file
            this.rotateFile();
        }

        // Write the line
        try {
            this.writeCallback(line, this.currentFileIndex);
            this.currentFileBytes += lineBytes;
            this.writtenEvents++;
            this.eventsPerOperation.set(event.operationId, opCount + 1);

            // Add to dedupe cache
            if (this.options.enableDedupe) {
                this.addToDedupeCache(event);
            }

            return {
                success: true,
                written: true,
                filePath: this.getFilePath(this.currentFileIndex),
                fileIndex: this.currentFileIndex,
            };
        } catch {
            return { success: false, written: false, reason: 'error' };
        }
    }

    /**
     * Get current statistics
     */
    getStats(): WriterStats {
        return {
            totalEvents: this.totalEvents,
            writtenEvents: this.writtenEvents,
            deduplicatedEvents: this.deduplicatedEvents,
            rateLimitedEvents: this.rateLimitedEvents,
            fileLimitEvents: this.fileLimitEvents,
            operationLimitEvents: this.operationLimitEvents,
            currentFileBytes: this.currentFileBytes,
            currentFileIndex: this.currentFileIndex,
            eventsPerOperation: Object.fromEntries(this.eventsPerOperation),
        };
    }

    /**
     * Reset the writer state (for testing)
     */
    reset(): void {
        this.currentFileBytes = 0;
        this.currentFileIndex = 0;
        this.totalEvents = 0;
        this.writtenEvents = 0;
        this.deduplicatedEvents = 0;
        this.rateLimitedEvents = 0;
        this.fileLimitEvents = 0;
        this.operationLimitEvents = 0;
        this.eventsPerOperation.clear();
        this.rateLimiter = { windowStart: Date.now(), eventCount: 0 };
        this.dedupeCache.clear();
        this.stopped = false;
    }

    private shouldRateLimit(): boolean {
        if (this.options.maxEventsPerSecond <= 0) return false;

        const now = Date.now();
        const windowMs = 1000;

        if (now - this.rateLimiter.windowStart >= windowMs) {
            this.rateLimiter.windowStart = now;
            this.rateLimiter.eventCount = 0;
        }

        if (this.rateLimiter.eventCount >= this.options.maxEventsPerSecond) {
            return true;
        }

        this.rateLimiter.eventCount++;
        return false;
    }

    private isDuplicate(event: EvidenceEvent): boolean {
        const hash = this.hashEvent(event);
        const now = Date.now();

        // Clean old entries
        this.cleanDedupeCache(now);

        return this.dedupeCache.has(hash);
    }

    private addToDedupeCache(event: EvidenceEvent): void {
        const hash = this.hashEvent(event);
        this.dedupeCache.set(hash, { hash, timestamp: Date.now() });
    }

    private cleanDedupeCache(now: number): void {
        const expiry = now - this.options.dedupeWindowMs;
        for (const [hash, entry] of this.dedupeCache) {
            if (entry.timestamp < expiry) {
                this.dedupeCache.delete(hash);
            }
        }
    }

    private hashEvent(event: EvidenceEvent): string {
        // Hash based on operationId, request, and response (excluding timestamp and traceId)
        const content = JSON.stringify({
            operationId: event.operationId,
            request: event.request,
            response: event.response,
        });
        return createHash('sha256').update(content).digest('hex').slice(0, 16);
    }

    private rotateFile(): void {
        const oldPath = this.getFilePath(this.currentFileIndex);
        this.currentFileIndex++;
        this.currentFileBytes = 0;
        const newPath = this.getFilePath(this.currentFileIndex);
        this.onRotate?.(oldPath, newPath);
    }

    private getFilePath(index: number): string {
        if (index === 0) {
            return this.basePath;
        }
        // Insert index before extension: evidence.ndjson -> evidence.1.ndjson
        const lastDot = this.basePath.lastIndexOf('.');
        if (lastDot === -1) {
            return `${this.basePath}.${index}`;
        }
        return `${this.basePath.slice(0, lastDot)}.${index}${this.basePath.slice(lastDot)}`;
    }
}

/**
 * Compute a hash for an evidence event for deduplication
 */
export function computeEventHash(event: EvidenceEvent): string {
    const content = JSON.stringify({
        operationId: event.operationId,
        request: event.request,
        response: event.response,
    });
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
