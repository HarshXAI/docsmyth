/**
 * Audit Logger Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileAuditLogger, InMemoryAuditLogger } from '../src/audit.js';
import { rmSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

describe('InMemoryAuditLogger', () => {
    let logger: InMemoryAuditLogger;

    beforeEach(() => {
        logger = new InMemoryAuditLogger();
    });

    it('should log entries in memory', () => {
        logger.log({
            action: 'publish',
            result: 'success',
            serviceName: 'test-service',
            version: '1.0.0',
        });

        expect(logger.entries.length).toBe(1);
        expect(logger.entries[0].action).toBe('publish');
        expect(logger.entries[0].result).toBe('success');
        expect(logger.entries[0].serviceName).toBe('test-service');
    });

    it('should generate unique request IDs', () => {
        logger.log({ action: 'publish', result: 'success', serviceName: 'a' });
        logger.log({ action: 'publish', result: 'success', serviceName: 'b' });

        expect(logger.entries[0].requestId).not.toBe(logger.entries[1].requestId);
    });

    it('should add timestamps', () => {
        const before = new Date().toISOString();
        logger.log({ action: 'pull', result: 'success', serviceName: 'test' });
        const after = new Date().toISOString();

        expect(logger.entries[0].timestamp >= before).toBe(true);
        expect(logger.entries[0].timestamp <= after).toBe(true);
    });

    it('should clear entries', () => {
        logger.log({ action: 'publish', result: 'success', serviceName: 'test' });
        logger.clear();

        expect(logger.entries.length).toBe(0);
    });
});

describe('FileAuditLogger', () => {
    let dataDir: string;
    let logPath: string;

    beforeEach(() => {
        dataDir = join(tmpdir(), `acp-audit-test-${randomUUID()}`);
        mkdirSync(dataDir, { recursive: true });
        logPath = join(dataDir, 'audit.ndjson');
    });

    afterEach(() => {
        if (existsSync(dataDir)) {
            rmSync(dataDir, { recursive: true, force: true });
        }
    });

    it('should create log file directory if needed', () => {
        const nestedLogPath = join(dataDir, 'nested', 'deep', 'audit.ndjson');
        new FileAuditLogger({ logPath: nestedLogPath });

        // The directory should be created (though file isn't created until first log)
        expect(existsSync(join(dataDir, 'nested', 'deep'))).toBe(true);
    });

    it('should write entries as NDJSON', () => {
        const logger = new FileAuditLogger({ logPath });

        logger.log({
            action: 'publish',
            result: 'success',
            serviceName: 'test-service',
            version: '1.0.0',
        });

        logger.log({
            action: 'pull',
            result: 'not_found',
            serviceName: 'other-service',
        });

        const content = readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n');

        expect(lines.length).toBe(2);

        const entry1 = JSON.parse(lines[0]);
        expect(entry1.action).toBe('publish');
        expect(entry1.result).toBe('success');

        const entry2 = JSON.parse(lines[1]);
        expect(entry2.action).toBe('pull');
        expect(entry2.result).toBe('not_found');
    });

    it('should include requestId and timestamp', () => {
        const logger = new FileAuditLogger({ logPath });

        logger.log({
            action: 'publish',
            result: 'success',
            serviceName: 'test',
        });

        const content = readFileSync(logPath, 'utf8');
        const entry = JSON.parse(content.trim());

        expect(entry.requestId).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        // requestId should be a UUID
        expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should append to existing log', () => {
        const logger = new FileAuditLogger({ logPath });

        logger.log({ action: 'publish', result: 'success', serviceName: 'a' });
        logger.log({ action: 'publish', result: 'success', serviceName: 'b' });
        logger.log({ action: 'publish', result: 'success', serviceName: 'c' });

        const content = readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n');

        expect(lines.length).toBe(3);
    });
});
