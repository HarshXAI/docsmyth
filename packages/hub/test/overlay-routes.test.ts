/**
 * Tests for Overlay Hub Routes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRouter, type RouterOptions } from '../src/routes.js';
import { FileSystemStorage } from '../src/storage/index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContractIR, Overlay } from '@acp/ir-spec';

describe('Overlay Routes', () => {
    let app: express.Express;
    let storage: FileSystemStorage;
    let tempDir: string;

    const testContract: ContractIR = {
        irVersion: '0.1',
        service: {
            name: 'test-service',
            version: '1.0.0',
            baseUrls: ['https://api.example.com'],
        },
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                },
            },
        },
        operations: [
            {
                operationId: 'getUser',
                method: 'GET',
                path: '/users/{id}',
                responses: [{ statusCode: 200 }],
            },
            {
                operationId: 'getInternalMetrics',
                method: 'GET',
                path: '/internal/metrics',
                responses: [{ statusCode: 200 }],
            },
        ],
    };

    const publicOverlay: Overlay = {
        irOverlayVersion: '0.1',
        name: 'public',
        description: 'Public API overlay',
        hideOperations: [{ operationId: 'getInternalMetrics' }],
        serverOverrides: [
            {
                pattern: 'https://internal.api.example.com',
                replacement: 'https://api.example.com',
            },
        ],
    };

    const internalOverlay: Overlay = {
        irOverlayVersion: '0.1',
        name: 'internal',
        description: 'Internal API overlay',
    };

    beforeEach(async () => {
        // Create temp directory for storage
        tempDir = mkdtempSync(join(tmpdir(), 'hub-overlay-test-'));
        storage = new FileSystemStorage({ dataDir: tempDir });

        // Create router with test config
        const routerOptions: RouterOptions = {
            storage,
            auditLogger: {
                log: () => { }, // No-op for tests
            },
            authConfig: {
                mode: 'none',
            },
        };

        app = express();
        app.use(createRouter(routerOptions));

        // Publish test contract
        await storage.publish('test-service', '1.0.0', testContract);
    });

    afterEach(() => {
        // Clean up temp directory
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe('GET /v1/services/:service/contracts/:version/overlays', () => {
        it('should return empty list when no overlays exist', async () => {
            const res = await request(app)
                .get('/v1/services/test-service/contracts/1.0.0/overlays')
                .expect(200);

            expect(res.body.serviceName).toBe('test-service');
            expect(res.body.version).toBe('1.0.0');
            expect(res.body.overlays).toEqual([]);
        });

        it('should list published overlays', async () => {
            // Publish overlays
            await storage.saveArtifact('test-service', '1.0.0', 'overlay.public.json', publicOverlay);
            await storage.saveArtifact('test-service', '1.0.0', 'overlay.internal.json', internalOverlay);

            const res = await request(app)
                .get('/v1/services/test-service/contracts/1.0.0/overlays')
                .expect(200);

            expect(res.body.overlays).toHaveLength(2);
            expect(res.body.overlays).toContainEqual({
                artifactName: 'overlay.public.json',
                name: 'public',
            });
            expect(res.body.overlays).toContainEqual({
                artifactName: 'overlay.internal.json',
                name: 'internal',
            });
        });

        it('should not include non-overlay artifacts', async () => {
            // Publish overlay and non-overlay artifact
            await storage.saveArtifact('test-service', '1.0.0', 'overlay.public.json', publicOverlay);
            await storage.saveArtifact('test-service', '1.0.0', 'coverage.json', { coverage: 100 });

            const res = await request(app)
                .get('/v1/services/test-service/contracts/1.0.0/overlays')
                .expect(200);

            expect(res.body.overlays).toHaveLength(1);
            expect(res.body.overlays[0].name).toBe('public');
        });
    });

    describe('GET /v1/services/:service/contracts/:version/overlays/:name', () => {
        it('should return overlay by name', async () => {
            await storage.saveArtifact('test-service', '1.0.0', 'overlay.public.json', publicOverlay);

            const res = await request(app)
                .get('/v1/services/test-service/contracts/1.0.0/overlays/public')
                .expect(200);

            expect(res.body.irOverlayVersion).toBe('0.1');
            expect(res.body.name).toBe('public');
            expect(res.body.hideOperations).toHaveLength(1);
        });

        it('should return 404 for non-existent overlay', async () => {
            const res = await request(app)
                .get('/v1/services/test-service/contracts/1.0.0/overlays/nonexistent')
                .expect(404);

            expect(res.body.error).toBe('Not Found');
            expect(res.body.message).toContain('nonexistent');
        });
    });

    describe('POST /v1/services/:service/contracts/:version/artifacts/:name (overlay)', () => {
        it('should publish an overlay as artifact', async () => {
            const res = await request(app)
                .post('/v1/services/test-service/contracts/1.0.0/artifacts/overlay.public.json')
                .send(publicOverlay)
                .expect(201);

            expect(res.body.success).toBe(true);

            // Verify it can be retrieved
            const getRes = await request(app)
                .get('/v1/services/test-service/contracts/1.0.0/overlays/public')
                .expect(200);

            expect(getRes.body.name).toBe('public');
        });

        it('should return 404 when contract does not exist', async () => {
            const res = await request(app)
                .post('/v1/services/test-service/contracts/99.0.0/artifacts/overlay.public.json')
                .send(publicOverlay)
                .expect(404);

            expect(res.body.error).toBe('Not Found');
        });
    });
});
