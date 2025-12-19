/**
 * Watcher Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EvidenceWatcher, getWatcher, stopWatcher, stopAllWatchers } from '../src/services/watcher-service.js';

describe('EvidenceWatcher', () => {
    let testDir: string;
    let evidencePath: string;

    beforeEach(() => {
        // Create temp directory for tests
        testDir = join(tmpdir(), `docsmyth-test-${Date.now()}`);
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
        evidencePath = join(testDir, 'evidence.ndjson');
    });

    afterEach(() => {
        stopAllWatchers();
        // Cleanup
        if (existsSync(evidencePath)) {
            unlinkSync(evidencePath);
        }
        if (existsSync(testDir)) {
            try {
                unlinkSync(testDir);
            } catch {
                // Directory may not be empty, ignore
            }
        }
    });

    it('should emit waiting status when evidence file does not exist', async () => {
        const watcher = new EvidenceWatcher({
            evidencePath,
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
        });

        const updates: unknown[] = [];
        watcher.on('update', (event) => updates.push(event));

        await watcher.start();

        // Should emit waiting status
        expect(updates.length).toBeGreaterThanOrEqual(1);
        const firstUpdate = updates[0] as { type: string; status?: string };
        expect(firstUpdate.type).toBe('status');
        expect(firstUpdate.status).toBe('waiting');

        watcher.stop();
    });

    it('should emit waiting status when evidence file is empty', async () => {
        // Create empty file
        writeFileSync(evidencePath, '', 'utf-8');

        const watcher = new EvidenceWatcher({
            evidencePath,
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
        });

        const updates: unknown[] = [];
        watcher.on('update', (event) => updates.push(event));

        await watcher.start();

        // Should emit waiting status
        expect(updates.length).toBeGreaterThanOrEqual(1);
        const firstUpdate = updates[0] as { type: string; status?: string };
        expect(firstUpdate.type).toBe('status');
        expect(firstUpdate.status).toBe('waiting');

        watcher.stop();
    });

    it('should emit state-update when evidence has content', async () => {
        // Create evidence file with content
        const evidence = {
            evidenceVersion: '0.1',
            operationId: 'getUsers',
            protocol: 'http/1.1',
            timestamp: new Date().toISOString(),
            request: {
                method: 'GET',
                path: '/users',
            },
            response: {
                status: 200,
                body: [{ id: 1, name: 'Test' }],
            },
        };
        writeFileSync(evidencePath, JSON.stringify(evidence) + '\n', 'utf-8');

        const watcher = new EvidenceWatcher({
            evidencePath,
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
        });

        const updates: unknown[] = [];
        watcher.on('update', (event) => updates.push(event));

        await watcher.start();

        // Wait a bit for async processing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should emit state-update
        expect(updates.length).toBeGreaterThanOrEqual(1);
        const hasStateUpdate = updates.some((u: unknown) => (u as { type: string }).type === 'state-update');
        expect(hasStateUpdate).toBe(true);

        watcher.stop();
    });

    it('should infer contract from evidence', async () => {
        // Create evidence file with multiple events
        const events = [
            {
                evidenceVersion: '0.1',
                operationId: 'listUsers',
                protocol: 'http/1.1',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users' },
                response: { status: 200, body: [] },
            },
            {
                evidenceVersion: '0.1',
                operationId: 'getUser',
                protocol: 'http/1.1',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users/123' },
                response: { status: 200, body: { id: 123 } },
            },
        ];
        writeFileSync(evidencePath, events.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

        const watcher = new EvidenceWatcher({
            evidencePath,
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
        });

        let contract: unknown = null;
        watcher.on('update', (event) => {
            if ((event as { type: string }).type === 'state-update') {
                contract = (event as { data: { contract: unknown } }).data.contract;
            }
        });

        await watcher.start();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(contract).not.toBeNull();
        expect((contract as { operations: unknown[] }).operations.length).toBeGreaterThan(0);

        watcher.stop();
    });
});

describe('Watcher Singleton Management', () => {
    const testPath = join(tmpdir(), 'singleton-test.ndjson');

    afterEach(() => {
        stopAllWatchers();
        if (existsSync(testPath)) {
            unlinkSync(testPath);
        }
    });

    it('should return same watcher instance for same path', () => {
        const watcher1 = getWatcher({ evidencePath: testPath });
        const watcher2 = getWatcher({ evidencePath: testPath });

        expect(watcher1).toBe(watcher2);
    });

    it('should stop watcher by path', () => {
        const watcher = getWatcher({ evidencePath: testPath });
        stopWatcher(testPath);

        // Getting again should create new instance
        const watcher2 = getWatcher({ evidencePath: testPath });
        expect(watcher2).not.toBe(watcher);
    });

    it('should stop all watchers', () => {
        const path1 = join(tmpdir(), 'test1.ndjson');
        const path2 = join(tmpdir(), 'test2.ndjson');

        getWatcher({ evidencePath: path1 });
        getWatcher({ evidencePath: path2 });

        stopAllWatchers();

        // All should be new instances
        const newWatcher1 = getWatcher({ evidencePath: path1 });
        const newWatcher2 = getWatcher({ evidencePath: path2 });

        expect(newWatcher1).toBeDefined();
        expect(newWatcher2).toBeDefined();
    });
});
