/**
 * Contract Hub Integration Tests
 *
 * Tests the full HTTP API including publish, pull, and immutability.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createApp, type HubConfig } from '../src/server.js';
import request from 'supertest';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';

// Test fixtures
const minimalIR = {
    irVersion: '0.1',
    service: {
        name: 'test-api',
        version: '1.0.0',
        description: 'Test API',
        baseUrls: ['https://api.example.com'],
    },
    schemas: {},
    operations: [],
};

const minimalIRv2 = {
    ...minimalIR,
    service: {
        ...minimalIR.service,
        version: '2.0.0',
    },
};

describe('Contract Hub API', () => {
    let app: Express;
    let dataDir: string;
    const testToken = 'test-secret-token-12345';

    beforeAll(() => {
        // Create a unique temp directory for test data
        dataDir = join(tmpdir(), `acp-hub-test-${randomUUID()}`);
        mkdirSync(dataDir, { recursive: true });

        const config: HubConfig = {
            port: 0,
            dataDir,
            publishToken: testToken,
            requireAuthForReads: false,
        };

        app = createApp(config);
    });

    afterAll(() => {
        // Clean up test data
        if (existsSync(dataDir)) {
            rmSync(dataDir, { recursive: true, force: true });
        }
    });

    describe('GET /healthz', () => {
        it('should return health status', async () => {
            const res = await request(app).get('/healthz');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
            expect(res.body).toHaveProperty('timestamp');
        });
    });

    describe('POST /v1/services/:service/contracts', () => {
        it('should publish a new contract version', async () => {
            const res = await request(app)
                .post('/v1/services/orders-api/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body).toHaveProperty('metadata');
            expect(res.body.metadata).toHaveProperty('serviceName', 'orders-api');
            expect(res.body.metadata).toHaveProperty('version', '1.0.0');
            expect(res.body.metadata).toHaveProperty('irHash');
            expect(res.body.metadata).toHaveProperty('publishedAt');
        });

        it('should reject duplicate version (immutability)', async () => {
            // First publish
            await request(app)
                .post('/v1/services/immutable-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            // Attempt to publish same version again
            const res = await request(app)
                .post('/v1/services/immutable-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            expect(res.status).toBe(409);
            expect(res.body).toHaveProperty('error', 'Conflict');
            expect(res.body).toHaveProperty('existingHash');
        });

        it('should require authentication', async () => {
            const res = await request(app)
                .post('/v1/services/auth-test/contracts')
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error', 'Unauthorized');
        });

        it('should reject invalid token', async () => {
            const res = await request(app)
                .post('/v1/services/auth-test/contracts')
                .set('Authorization', 'Bearer wrong-token')
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('error', 'Unauthorized');
        });

        it('should validate IR before publishing', async () => {
            const res = await request(app)
                .post('/v1/services/validation-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: { invalid: 'ir' },
                });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('error', 'Bad Request');
            expect(res.body).toHaveProperty('validationErrors');
        });

        it('should require version in request body', async () => {
            const res = await request(app)
                .post('/v1/services/missing-version/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    ir: minimalIR,
                });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty('error', 'Bad Request');
        });

        it('should compile OpenAPI if not provided', async () => {
            const res = await request(app)
                .post('/v1/services/compile-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            expect(res.status).toBe(201);

            // Verify OpenAPI was created
            const openApiRes = await request(app)
                .get('/v1/services/compile-test/contracts/1.0.0/openapi');

            expect(openApiRes.status).toBe(200);
            expect(openApiRes.body).toHaveProperty('openapi', '3.1.0');
        });
    });

    describe('GET /v1/services/:service/contracts/latest', () => {
        beforeEach(async () => {
            // Publish multiple versions
            await request(app)
                .post('/v1/services/latest-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            await request(app)
                .post('/v1/services/latest-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '2.0.0',
                    ir: minimalIRv2,
                });
        });

        it('should return the latest version', async () => {
            const res = await request(app)
                .get('/v1/services/latest-test/contracts/latest');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('metadata');
            expect(res.body.metadata).toHaveProperty('version', '2.0.0');
            expect(res.body).toHaveProperty('ir');
            expect(res.body).toHaveProperty('openApiUrl');
        });

        it('should return 404 for unknown service', async () => {
            const res = await request(app)
                .get('/v1/services/unknown-service/contracts/latest');

            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error', 'Not Found');
        });
    });

    describe('GET /v1/services/:service/contracts/:version', () => {
        beforeEach(async () => {
            await request(app)
                .post('/v1/services/version-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });
        });

        it('should return a specific version', async () => {
            const res = await request(app)
                .get('/v1/services/version-test/contracts/1.0.0');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('metadata');
            expect(res.body.metadata).toHaveProperty('version', '1.0.0');
            expect(res.body).toHaveProperty('ir');
        });

        it('should return 404 for unknown version', async () => {
            const res = await request(app)
                .get('/v1/services/version-test/contracts/9.9.9');

            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error', 'Not Found');
        });
    });

    describe('GET /v1/services/:service/contracts/:version/openapi', () => {
        beforeEach(async () => {
            await request(app)
                .post('/v1/services/openapi-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });
        });

        it('should return OpenAPI document', async () => {
            const res = await request(app)
                .get('/v1/services/openapi-test/contracts/1.0.0/openapi');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('openapi', '3.1.0');
            expect(res.body).toHaveProperty('info');
            expect(res.body.info).toHaveProperty('title', 'test-api');
        });

        it('should return 404 for unknown version', async () => {
            const res = await request(app)
                .get('/v1/services/openapi-test/contracts/9.9.9/openapi');

            expect(res.status).toBe(404);
        });
    });

    describe('GET /v1/services/:service/contracts', () => {
        beforeEach(async () => {
            await request(app)
                .post('/v1/services/list-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.0.0',
                    ir: minimalIR,
                });

            await request(app)
                .post('/v1/services/list-test/contracts')
                .set('Authorization', `Bearer ${testToken}`)
                .send({
                    version: '1.1.0',
                    ir: minimalIR,
                });
        });

        it('should list all versions', async () => {
            const res = await request(app)
                .get('/v1/services/list-test/contracts');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('serviceName', 'list-test');
            expect(res.body).toHaveProperty('versions');
            expect(res.body.versions.length).toBeGreaterThanOrEqual(2);
        });

        it('should return empty list for unknown service', async () => {
            const res = await request(app)
                .get('/v1/services/unknown-list-service/contracts');

            expect(res.status).toBe(200);
            expect(res.body.versions).toEqual([]);
        });
    });
});

describe('Contract Hub with Auth Required for Reads', () => {
    let app: Express;
    let dataDir: string;
    const testToken = 'read-auth-token-12345';

    beforeAll(async () => {
        dataDir = join(tmpdir(), `acp-hub-test-auth-${randomUUID()}`);
        mkdirSync(dataDir, { recursive: true });

        const config: HubConfig = {
            port: 0,
            dataDir,
            publishToken: testToken,
            requireAuthForReads: true,
        };

        app = createApp(config);

        // Publish a test contract
        await request(app)
            .post('/v1/services/auth-reads/contracts')
            .set('Authorization', `Bearer ${testToken}`)
            .send({
                version: '1.0.0',
                ir: minimalIR,
            });
    });

    afterAll(() => {
        if (existsSync(dataDir)) {
            rmSync(dataDir, { recursive: true, force: true });
        }
    });

    it('should require auth for reading contracts', async () => {
        const res = await request(app)
            .get('/v1/services/auth-reads/contracts/1.0.0');

        expect(res.status).toBe(401);
    });

    it('should allow reading with valid token', async () => {
        const res = await request(app)
            .get('/v1/services/auth-reads/contracts/1.0.0')
            .set('Authorization', `Bearer ${testToken}`);

        expect(res.status).toBe(200);
    });

    it('should not require auth for health check', async () => {
        const res = await request(app).get('/healthz');
        expect(res.status).toBe(200);
    });
});
