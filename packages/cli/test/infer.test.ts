/**
 * Tests for infer service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferContract, inferContractFromEvents } from '../src/services/infer.js';
import type { EvidenceEvent } from '@docsmyth/evidence-sdk';

describe('inferContractFromEvents', () => {
    it('returns empty contract for no events', () => {
        const contract = inferContractFromEvents([]);
        expect(contract.irVersion).toBe('0.1');
        expect(contract.operations).toEqual([]);
        expect(contract.schemas).toEqual({});
    });

    it('infers single GET operation', () => {
        const events: EvidenceEvent[] = [
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: {
                    method: 'GET',
                    path: '/users',
                },
                response: {
                    status: 200,
                    body: [{ id: '1', name: 'Alice' }],
                },
            },
        ];

        const contract = inferContractFromEvents(events);
        expect(contract.operations).toHaveLength(1);
        expect(contract.operations[0].method).toBe('GET');
        expect(contract.operations[0].path).toBe('/users');
        expect(contract.operations[0].operationId).toBe('listUsers');
    });

    it('infers GET with path parameter', () => {
        const events: EvidenceEvent[] = [
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: {
                    method: 'GET',
                    path: '/users/123',
                },
                response: {
                    status: 200,
                    body: { id: '123', name: 'Bob' },
                },
            },
        ];

        const contract = inferContractFromEvents(events);
        expect(contract.operations).toHaveLength(1);
        expect(contract.operations[0].path).toBe('/users/{param1}');
        expect(contract.operations[0].operationId).toBe('getUser');
        expect(contract.operations[0].parameters).toHaveLength(1);
        expect(contract.operations[0].parameters![0].name).toBe('param1');
        expect(contract.operations[0].parameters![0].in).toBe('path');
    });

    it('infers POST with request body', () => {
        const events: EvidenceEvent[] = [
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: {
                    method: 'POST',
                    path: '/users',
                    body: { name: 'Charlie', email: 'charlie@example.com' },
                },
                response: {
                    status: 201,
                    body: { id: '3', name: 'Charlie', email: 'charlie@example.com' },
                },
            },
        ];

        const contract = inferContractFromEvents(events);
        expect(contract.operations).toHaveLength(1);
        expect(contract.operations[0].operationId).toBe('createUser');
        expect(contract.operations[0].requestBody).toBeDefined();
        expect(contract.operations[0].requestBody!.required).toBe(true);

        // Check request schema was created
        expect(contract.schemas['createUserRequest']).toBeDefined();
    });

    it('groups multiple requests to same endpoint', () => {
        const events: EvidenceEvent[] = [
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users/1' },
                response: { status: 200, body: { id: '1', name: 'Alice' } },
            },
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users/2' },
                response: { status: 200, body: { id: '2', name: 'Bob' } },
            },
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users/3' },
                response: { status: 404, body: { error: 'Not found' } },
            },
        ];

        const contract = inferContractFromEvents(events);
        expect(contract.operations).toHaveLength(1);
        expect(contract.operations[0].responses).toHaveLength(2); // 200 and 404
    });

    it('infers multiple operations', () => {
        const events: EvidenceEvent[] = [
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users' },
                response: { status: 200, body: [] },
            },
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'POST', path: '/users', body: { name: 'Test' } },
                response: { status: 201, body: { id: '1', name: 'Test' } },
            },
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/posts' },
                response: { status: 200, body: [] },
            },
        ];

        const contract = inferContractFromEvents(events);
        expect(contract.operations).toHaveLength(3);

        const operationIds = contract.operations.map((op) => op.operationId);
        expect(operationIds).toContain('listUsers');
        expect(operationIds).toContain('createUser');
        expect(operationIds).toContain('listPosts');
    });

    it('merges schemas from multiple samples', () => {
        const events: EvidenceEvent[] = [
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users/1' },
                response: { status: 200, body: { id: '1', name: 'Alice' } },
            },
            {
                evidenceVersion: '0.1',
                operationId: '_unmatched',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users/2' },
                response: { status: 200, body: { id: '2', name: 'Bob', email: 'bob@test.com' } },
            },
        ];

        const contract = inferContractFromEvents(events);
        const responseSchema = contract.schemas['getUserResponse200'];

        expect(responseSchema).toBeDefined();
        expect(responseSchema.properties).toBeDefined();
        expect(responseSchema.properties!['id']).toBeDefined();
        expect(responseSchema.properties!['name']).toBeDefined();
        expect(responseSchema.properties!['email']).toBeDefined();

        // Only id and name should be required (present in both)
        expect(responseSchema.required).toContain('id');
        expect(responseSchema.required).toContain('name');
        expect(responseSchema.required).not.toContain('email');
    });
});

describe('inferContract from file', () => {
    const tempDir = join(tmpdir(), 'docsmyth-infer-test');
    const evidencePath = join(tempDir, 'test-evidence.ndjson');

    beforeEach(() => {
        if (!existsSync(tempDir)) {
            mkdirSync(tempDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (existsSync(evidencePath)) {
            unlinkSync(evidencePath);
        }
    });

    it('infers contract from NDJSON file', async () => {
        const events = [
            {
                evidenceVersion: '0.1',
                operationId: 'GET /users',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'GET', path: '/users' },
                response: { status: 200, body: [{ id: '1' }] },
            },
            {
                evidenceVersion: '0.1',
                operationId: 'POST /users',
                protocol: 'http',
                timestamp: new Date().toISOString(),
                request: { method: 'POST', path: '/users', body: { name: 'Test' } },
                response: { status: 201, body: { id: '2' } },
            },
        ];

        const ndjson = events.map((e) => JSON.stringify(e)).join('\n');
        writeFileSync(evidencePath, ndjson, 'utf-8');

        const contract = await inferContract({
            evidencePath,
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
        });

        expect(contract.irVersion).toBe('0.1');
        expect(contract.service.name).toBe('test-service');
        expect(contract.service.version).toBe('1.0.0');
        expect(contract.operations.length).toBeGreaterThanOrEqual(2);
    });

    it('throws error for non-existent file', async () => {
        await expect(
            inferContract({
                evidencePath: '/non/existent/path.ndjson',
                serviceName: 'test',
                serviceVersion: '1.0.0',
            })
        ).rejects.toThrow('Evidence file not found');
    });

    it('returns minimal contract for empty evidence file', async () => {
        // Create empty file
        writeFileSync(evidencePath, '', 'utf-8');

        const contract = await inferContract({
            evidencePath,
            serviceName: 'empty-service',
            serviceVersion: '0.0.1',
        });

        expect(contract.irVersion).toBe('0.1');
        expect(contract.service.name).toBe('empty-service');
        expect(contract.service.version).toBe('0.0.1');
        expect(contract.operations).toEqual([]);
        expect(contract.schemas).toEqual({});
    });
});
