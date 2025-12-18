import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
    createEvidenceWriter,
    DEFAULT_MAX_BODY_BYTES,
    TRUNCATION_MARKER,
} from '../src/evidence-writer.js';
import { createLogger } from '../src/logger.js';
import type { EvidenceEvent } from '@docsmyth/evidence-sdk';

const testOutputDir = '/tmp/acp-evidence-writer-test';

function createTestEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
    return {
        evidenceVersion: '0.1',
        operationId: 'testOperation',
        protocol: 'http',
        timestamp: new Date().toISOString(),
        traceId: 'test-trace-123',
        request: {
            method: 'GET',
            path: '/test',
            headers: {},
        },
        response: {
            status: 200,
            headers: {},
        },
        ...overrides,
    };
}

describe('evidence-writer', () => {
    const logger = createLogger('silent');
    let outputPath: string;

    beforeEach(() => {
        outputPath = `${testOutputDir}/evidence-${Date.now()}.ndjson`;
        // Ensure test directory exists
        if (!existsSync(testOutputDir)) {
            mkdirSync(testOutputDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean up test files
        if (existsSync(outputPath)) {
            rmSync(outputPath);
        }
    });

    it('creates output file on initialization', () => {
        createEvidenceWriter({ outputPath, logger });
        expect(existsSync(outputPath)).toBe(true);
    });

    it('writes events as NDJSON', () => {
        const writer = createEvidenceWriter({ outputPath, logger });

        const event = createTestEvent();
        writer.write(event);

        const content = readFileSync(outputPath, 'utf-8').trim();
        const parsed = JSON.parse(content);

        expect(parsed.operationId).toBe('testOperation');
        expect(parsed.protocol).toBe('http');
    });

    it('writes multiple events on separate lines', () => {
        const writer = createEvidenceWriter({ outputPath, logger });

        writer.write(createTestEvent({ operationId: 'op1' }));
        writer.write(createTestEvent({ operationId: 'op2' }));
        writer.write(createTestEvent({ operationId: 'op3' }));

        const lines = readFileSync(outputPath, 'utf-8').trim().split('\n');
        expect(lines.length).toBe(3);

        expect(JSON.parse(lines[0]).operationId).toBe('op1');
        expect(JSON.parse(lines[1]).operationId).toBe('op2');
        expect(JSON.parse(lines[2]).operationId).toBe('op3');
    });

    it('tracks event count', () => {
        const writer = createEvidenceWriter({ outputPath, logger });

        expect(writer.getEventCount()).toBe(0);

        writer.write(createTestEvent());
        expect(writer.getEventCount()).toBe(1);

        writer.write(createTestEvent());
        writer.write(createTestEvent());
        expect(writer.getEventCount()).toBe(3);
    });

    it('sanitizes sensitive headers', () => {
        const writer = createEvidenceWriter({ outputPath, logger });

        const event = createTestEvent({
            request: {
                method: 'GET',
                path: '/test',
                headers: {
                    authorization: 'Bearer secret-token',
                    'content-type': 'application/json',
                    cookie: 'session=abc123',
                },
            },
        });

        writer.write(event);

        const content = readFileSync(outputPath, 'utf-8').trim();
        const parsed = JSON.parse(content);

        // Sensitive headers should be removed
        expect(parsed.request.headers.authorization).toBeUndefined();
        expect(parsed.request.headers.cookie).toBeUndefined();

        // Non-sensitive headers should be preserved
        expect(parsed.request.headers['content-type']).toBe('application/json');
    });

    it('truncates large request bodies', () => {
        const maxBodyBytes = 100;
        const writer = createEvidenceWriter({ outputPath, maxBodyBytes, logger });

        const largeBody = { data: 'x'.repeat(200) };
        const event = createTestEvent({
            request: {
                method: 'POST',
                path: '/test',
                body: largeBody,
            },
        });

        writer.write(event);

        const content = readFileSync(outputPath, 'utf-8').trim();
        const parsed = JSON.parse(content);

        expect(parsed.request.body._truncated).toBe(true);
        expect(parsed.request.body._marker).toBe(TRUNCATION_MARKER);
        expect(parsed.request.body._originalSizeBytes).toBeGreaterThan(maxBodyBytes);
    });

    it('truncates large response bodies', () => {
        const maxBodyBytes = 100;
        const writer = createEvidenceWriter({ outputPath, maxBodyBytes, logger });

        const largeBody = { data: 'y'.repeat(200) };
        const event = createTestEvent({
            response: {
                status: 200,
                body: largeBody,
            },
        });

        writer.write(event);

        const content = readFileSync(outputPath, 'utf-8').trim();
        const parsed = JSON.parse(content);

        expect(parsed.response.body._truncated).toBe(true);
        expect(parsed.response.body._marker).toBe(TRUNCATION_MARKER);
    });

    it('applies rate limiting', () => {
        const eventRateLimit = 5;
        const writer = createEvidenceWriter({ outputPath, eventRateLimit, logger });

        // Write more than the limit
        for (let i = 0; i < 10; i++) {
            writer.write(createTestEvent({ operationId: `op${i}` }));
        }

        // Should have written only the first 5
        expect(writer.getEventCount()).toBe(5);
        expect(writer.getDroppedCount()).toBe(5);

        const lines = readFileSync(outputPath, 'utf-8').trim().split('\n');
        expect(lines.length).toBe(5);
    });

    it('resets rate limit window after 1 second', () => {
        vi.useFakeTimers();

        try {
            const eventRateLimit = 3;
            const writer = createEvidenceWriter({ outputPath, eventRateLimit, logger });

            // Use up the rate limit
            for (let i = 0; i < 5; i++) {
                writer.write(createTestEvent());
            }
            expect(writer.getEventCount()).toBe(3);
            expect(writer.getDroppedCount()).toBe(2);

            // Advance time by 1 second to reset the rate limit window
            vi.advanceTimersByTime(1000);

            // Should be able to write again
            for (let i = 0; i < 3; i++) {
                writer.write(createTestEvent());
            }
            expect(writer.getEventCount()).toBe(6);
        } finally {
            vi.useRealTimers();
        }
    });

    it('allows unlimited events when rate limit is 0', () => {
        const writer = createEvidenceWriter({ outputPath, eventRateLimit: 0, logger });

        for (let i = 0; i < 100; i++) {
            writer.write(createTestEvent());
        }

        expect(writer.getEventCount()).toBe(100);
        expect(writer.getDroppedCount()).toBe(0);
    });

    it('creates parent directories if needed', () => {
        const nestedPath = `${testOutputDir}/nested/deep/evidence.ndjson`;
        const writer = createEvidenceWriter({ outputPath: nestedPath, logger });

        writer.write(createTestEvent());

        expect(existsSync(nestedPath)).toBe(true);

        // Clean up
        rmSync(dirname(nestedPath), { recursive: true });
    });
});
