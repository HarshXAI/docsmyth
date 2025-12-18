/**
 * Streaming Evidence Writer Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EvidenceEvent } from '../src/types.js';
import {
    StreamingEvidenceWriter,
    computeEventHash,
    DEFAULT_LIMITS,
} from '../src/streaming-writer.js';

function createTestEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
    return {
        evidenceVersion: '0.1',
        operationId: 'testOperation',
        protocol: 'http',
        timestamp: new Date().toISOString(),
        traceId: `trace-${Math.random().toString(36).slice(2)}`,
        request: {
            method: 'GET',
            path: '/test',
        },
        response: {
            status: 200,
            body: { success: true },
        },
        ...overrides,
    };
}

describe('StreamingEvidenceWriter', () => {
    let writtenLines: string[];
    let writeCallback: (line: string, fileIndex: number) => void;

    beforeEach(() => {
        writtenLines = [];
        writeCallback = (line) => {
            writtenLines.push(line);
        };
    });

    describe('basic writing', () => {
        it('should write events successfully', () => {
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback);
            const event = createTestEvent();

            const result = writer.write(event);

            expect(result.success).toBe(true);
            expect(result.written).toBe(true);
            expect(writtenLines).toHaveLength(1);
            expect(JSON.parse(writtenLines[0])).toEqual(event);
        });

        it('should track statistics correctly', () => {
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback);

            writer.write(createTestEvent({ operationId: 'op1' }));
            writer.write(createTestEvent({ operationId: 'op2' }));
            writer.write(createTestEvent({ operationId: 'op1' }));

            const stats = writer.getStats();
            expect(stats.totalEvents).toBe(3);
            expect(stats.writtenEvents).toBe(3);
            expect(stats.eventsPerOperation.op1).toBe(2);
            expect(stats.eventsPerOperation.op2).toBe(1);
        });
    });

    describe('maxEventsPerRun limit', () => {
        it('should stop writing after limit is reached', () => {
            const onLimitReached = vi.fn();
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback, {
                maxEventsPerRun: 3,
                onLimitReached,
            });

            const results = [
                writer.write(createTestEvent()),
                writer.write(createTestEvent()),
                writer.write(createTestEvent()),
                writer.write(createTestEvent()), // Should fail
                writer.write(createTestEvent()), // Should fail
            ];

            expect(results[0].written).toBe(true);
            expect(results[1].written).toBe(true);
            expect(results[2].written).toBe(true);
            expect(results[3].written).toBe(false);
            expect(results[3].reason).toBe('run-limit');
            expect(results[4].written).toBe(false);

            expect(writtenLines).toHaveLength(3);
            expect(onLimitReached).toHaveBeenCalledWith('events-per-run', expect.objectContaining({
                type: 'events-per-run',
                current: 3,
                limit: 3,
            }));
        });
    });

    describe('maxEventsPerOperation limit', () => {
        it('should limit events per operation', () => {
            const onLimitReached = vi.fn();
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback, {
                maxEventsPerOperation: 2,
                onLimitReached,
            });

            // Write 2 events for op1
            writer.write(createTestEvent({ operationId: 'op1' }));
            writer.write(createTestEvent({ operationId: 'op1' }));

            // Third op1 event should fail
            const result = writer.write(createTestEvent({ operationId: 'op1' }));
            expect(result.written).toBe(false);
            expect(result.reason).toBe('operation-limit');

            // But op2 should still work
            const op2Result = writer.write(createTestEvent({ operationId: 'op2' }));
            expect(op2Result.written).toBe(true);

            expect(onLimitReached).toHaveBeenCalledWith('events-per-operation', expect.objectContaining({
                type: 'events-per-operation',
                operationId: 'op1',
            }));
        });
    });

    describe('rate limiting', () => {
        it('should rate limit events', () => {
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback, {
                maxEventsPerSecond: 5,
            });

            const results: boolean[] = [];
            for (let i = 0; i < 10; i++) {
                results.push(writer.write(createTestEvent()).written);
            }

            // First 5 should succeed, rest should fail
            expect(results.filter(Boolean).length).toBe(5);
            expect(results.filter((r) => !r).length).toBe(5);

            const stats = writer.getStats();
            expect(stats.rateLimitedEvents).toBe(5);
        });
    });

    describe('deduplication', () => {
        it('should deduplicate identical events', () => {
            const onDedupe = vi.fn();
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback, {
                enableDedupe: true,
                dedupeWindowMs: 60000,
                onDedupe,
            });

            // Create two identical events (same request/response, different timestamps)
            const event1 = createTestEvent({
                operationId: 'op1',
                timestamp: '2025-01-01T00:00:00Z',
                request: { method: 'GET', path: '/test' },
                response: { status: 200, body: { id: 1 } },
            });

            const event2 = createTestEvent({
                operationId: 'op1',
                timestamp: '2025-01-01T00:00:01Z', // Different timestamp
                traceId: 'different-trace', // Different trace
                request: { method: 'GET', path: '/test' },
                response: { status: 200, body: { id: 1 } },
            });

            const result1 = writer.write(event1);
            const result2 = writer.write(event2);

            expect(result1.written).toBe(true);
            expect(result2.written).toBe(false);
            expect(result2.reason).toBe('deduplicated');
            expect(onDedupe).toHaveBeenCalledTimes(1);

            const stats = writer.getStats();
            expect(stats.deduplicatedEvents).toBe(1);
        });

        it('should not deduplicate different events', () => {
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback, {
                enableDedupe: true,
            });

            const event1 = createTestEvent({
                request: { method: 'GET', path: '/test1' },
            });
            const event2 = createTestEvent({
                request: { method: 'GET', path: '/test2' },
            });

            writer.write(event1);
            const result = writer.write(event2);

            expect(result.written).toBe(true);
            expect(writtenLines).toHaveLength(2);
        });
    });

    describe('file rotation', () => {
        it('should rotate files when size limit is reached', () => {
            const onRotate = vi.fn();
            // Small limit to trigger rotation
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback, {
                maxFileBytes: 200, // Small limit
                onRotate,
            });

            // Write events until rotation
            for (let i = 0; i < 10; i++) {
                writer.write(createTestEvent());
            }

            expect(onRotate).toHaveBeenCalled();
            const stats = writer.getStats();
            expect(stats.currentFileIndex).toBeGreaterThan(0);
        });

        it('should generate correct file paths for rotation', () => {
            const fileIndices: number[] = [];
            const writer = new StreamingEvidenceWriter(
                '/test/evidence.ndjson',
                (_line, fileIndex) => {
                    fileIndices.push(fileIndex);
                },
                { maxFileBytes: 100 }
            );

            for (let i = 0; i < 10; i++) {
                writer.write(createTestEvent());
            }

            // Should have written to multiple file indices
            const uniqueIndices = [...new Set(fileIndices)];
            expect(uniqueIndices.length).toBeGreaterThan(1);
        });
    });

    describe('reset', () => {
        it('should reset all state', () => {
            const writer = new StreamingEvidenceWriter('/test/evidence.ndjson', writeCallback, {
                maxEventsPerRun: 2,
            });

            writer.write(createTestEvent());
            writer.write(createTestEvent());
            writer.write(createTestEvent()); // Should fail

            writer.reset();

            // Should be able to write again
            const result = writer.write(createTestEvent());
            expect(result.written).toBe(true);

            const stats = writer.getStats();
            expect(stats.totalEvents).toBe(1);
            expect(stats.writtenEvents).toBe(1);
        });
    });
});

describe('computeEventHash', () => {
    it('should produce consistent hashes for identical events', () => {
        const event1 = createTestEvent({
            operationId: 'test',
            request: { method: 'GET', path: '/test' },
            response: { status: 200 },
        });
        const event2 = createTestEvent({
            operationId: 'test',
            timestamp: 'different', // Should be ignored
            traceId: 'different', // Should be ignored
            request: { method: 'GET', path: '/test' },
            response: { status: 200 },
        });

        expect(computeEventHash(event1)).toBe(computeEventHash(event2));
    });

    it('should produce different hashes for different events', () => {
        const event1 = createTestEvent({
            request: { method: 'GET', path: '/test1' },
        });
        const event2 = createTestEvent({
            request: { method: 'GET', path: '/test2' },
        });

        expect(computeEventHash(event1)).not.toBe(computeEventHash(event2));
    });
});

describe('DEFAULT_LIMITS', () => {
    it('should have sensible defaults', () => {
        expect(DEFAULT_LIMITS.maxFileBytes).toBe(100 * 1024 * 1024); // 100MB
        expect(DEFAULT_LIMITS.maxEventsPerOperation).toBe(1000);
        expect(DEFAULT_LIMITS.maxEventsPerSecond).toBe(100);
        expect(DEFAULT_LIMITS.dedupeWindowMs).toBe(60000);
    });
});
