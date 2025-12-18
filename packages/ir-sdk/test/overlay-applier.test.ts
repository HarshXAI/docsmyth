/**
 * Tests for Overlay Applier
 */

import { describe, it, expect } from 'vitest';
import { applyOverlay, getOverlaySummary } from '../src/overlay-applier.js';
import { makeContractIR, makeService, makeHttpOperation, makeResponse } from '../src/index.js';
import type { ContractIR, Overlay } from '@docsmyth/ir-spec';

// Helper to create a test contract
function createTestContract(): ContractIR {
    return makeContractIR({
        service: makeService({
            name: 'test-api',
            version: '1.0.0',
            baseUrls: ['https://internal.api.example.com', 'http://localhost:3000'],
        }),
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    passwordHash: { type: 'string' },
                    internalId: { type: 'string' },
                    metadata: {
                        type: 'object',
                        properties: {
                            createdBy: { type: 'string' },
                            lastModifiedBy: { type: 'string' },
                        },
                    },
                },
                required: ['id', 'email'],
            },
            Order: {
                type: 'object',
                properties: {
                    orderId: { type: 'string' },
                    status: { type: 'string' },
                    internalStatus: { type: 'string' },
                },
            },
        },
        operations: [
            makeHttpOperation({
                operationId: 'getUser',
                method: 'GET',
                path: '/users/{id}',
                responses: [
                    makeResponse(200, {
                        schema: {
                            type: 'object',
                            properties: {
                                user: { $ref: 'schema:User' as const },
                                metadata: {
                                    type: 'object',
                                    properties: {
                                        createdBy: { type: 'string' },
                                        requestId: { type: 'string' },
                                    },
                                },
                            },
                        },
                    }),
                ],
            }),
            makeHttpOperation({
                operationId: 'createUser',
                method: 'POST',
                path: '/users',
                requestBody: {
                    schema: {
                        type: 'object',
                        properties: {
                            email: { type: 'string' },
                            name: { type: 'string' },
                            internalPriority: { type: 'number' },
                        },
                        required: ['email', 'name'],
                    },
                },
                responses: [makeResponse(201)],
            }),
            makeHttpOperation({
                operationId: 'getInternalMetrics',
                method: 'GET',
                path: '/internal/metrics',
                responses: [makeResponse(200)],
            }),
            makeHttpOperation({
                operationId: 'adminDeleteUser',
                method: 'DELETE',
                path: '/admin/users/{id}',
                responses: [makeResponse(204)],
            }),
            makeHttpOperation({
                operationId: 'getInternalHealth',
                method: 'GET',
                path: '/internal/health',
                responses: [makeResponse(200)],
            }),
        ],
    });
}

describe('applyOverlay', () => {
    describe('hideOperations', () => {
        it('should hide operations by operationId', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                hideOperations: [{ operationId: 'getInternalMetrics' }],
            };

            const result = applyOverlay(ir, overlay);

            expect(result.ir.operations.find((o) => o.operationId === 'getInternalMetrics')).toBeUndefined();
            expect(result.summary.hiddenOperationsCount).toBe(1);
            expect(result.summary.hiddenOperationIds).toContain('getInternalMetrics');
        });

        it('should hide operations by method+path pattern', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                hideOperations: [{ method: 'GET', path: '/internal/*' }],
            };

            const result = applyOverlay(ir, overlay);

            expect(result.ir.operations.find((o) => o.operationId === 'getInternalMetrics')).toBeUndefined();
            expect(result.ir.operations.find((o) => o.operationId === 'getInternalHealth')).toBeUndefined();
            expect(result.summary.hiddenOperationsCount).toBe(2);
        });

        it('should hide operations by exact path match', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                hideOperations: [{ method: 'DELETE', path: '/admin/users/{id}' }],
            };

            const result = applyOverlay(ir, overlay);

            expect(result.ir.operations.find((o) => o.operationId === 'adminDeleteUser')).toBeUndefined();
            expect(result.summary.hiddenOperationsCount).toBe(1);
        });

        it('should warn about unmatched operationIds', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                hideOperations: [{ operationId: 'nonExistent' }],
            };

            const result = applyOverlay(ir, overlay);

            expect(result.warnings.some((w) => w.includes('nonExistent'))).toBe(true);
        });
    });

    describe('serverOverrides', () => {
        it('should rewrite server URLs with exact match', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                serverOverrides: [
                    {
                        pattern: 'https://internal.api.example.com',
                        replacement: 'https://api.example.com',
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            expect(result.ir.service.baseUrls).toContain('https://api.example.com');
            expect(result.ir.service.baseUrls).not.toContain('https://internal.api.example.com');
        });

        it('should rewrite server URLs with regex', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                serverOverrides: [
                    {
                        pattern: 'http://localhost:\\d+',
                        replacement: 'https://api.example.com',
                        isRegex: true,
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            expect(result.ir.service.baseUrls).not.toContain('http://localhost:3000');
            expect(result.summary.hasServerOverrides).toBe(true);
        });
    });

    describe('schemaRedactions', () => {
        it('should remove fields from schemas', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                schemaRedactions: [
                    {
                        schemaId: 'User',
                        fields: ['passwordHash', 'internalId'],
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            const userSchema = result.ir.schemas['User'];
            expect(userSchema.properties?.['passwordHash']).toBeUndefined();
            expect(userSchema.properties?.['internalId']).toBeUndefined();
            expect(userSchema.properties?.['id']).toBeDefined();
            expect(userSchema.properties?.['email']).toBeDefined();
        });

        it('should remove nested fields using dot notation', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                schemaRedactions: [
                    {
                        schemaId: 'User',
                        fields: ['metadata.createdBy'],
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            const userSchema = result.ir.schemas['User'];
            const metadata = userSchema.properties?.['metadata'] as { properties?: Record<string, unknown> };
            expect(metadata.properties?.['createdBy']).toBeUndefined();
            expect(metadata.properties?.['lastModifiedBy']).toBeDefined();
        });

        it('should update required array when removing required fields', () => {
            const ir = createTestContract();
            // Modify schema to have internalId as required
            ir.schemas['User'].required = ['id', 'email', 'internalId'];

            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                schemaRedactions: [
                    {
                        schemaId: 'User',
                        fields: ['internalId'],
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            const userSchema = result.ir.schemas['User'];
            expect(userSchema.required).not.toContain('internalId');
            expect(userSchema.required).toContain('id');
        });

        it('should warn about missing schemas', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                schemaRedactions: [
                    {
                        schemaId: 'NonExistent',
                        fields: ['field'],
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            expect(result.warnings.some((w) => w.includes('NonExistent'))).toBe(true);
        });
    });

    describe('responseRedactions', () => {
        it('should remove fields from response schemas', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                responseRedactions: [
                    {
                        operationId: 'getUser',
                        fields: ['metadata.createdBy'],
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            const getUserOp = result.ir.operations.find((o) => o.operationId === 'getUser')!;
            const response = getUserOp.responses[0];
            const schema = response.schema as { properties?: Record<string, unknown> };
            const metadata = schema.properties?.['metadata'] as { properties?: Record<string, unknown> };
            expect(metadata.properties?.['createdBy']).toBeUndefined();
            expect(metadata.properties?.['requestId']).toBeDefined();
        });

        it('should filter by statusCode when specified', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                responseRedactions: [
                    {
                        operationId: 'getUser',
                        statusCode: 404,
                        fields: ['metadata.createdBy'],
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            // Should not affect 200 response since we specified 404
            const getUserOp = result.ir.operations.find((o) => o.operationId === 'getUser')!;
            const response = getUserOp.responses.find((r) => r.statusCode === 200);
            const schema = response?.schema as { properties?: Record<string, unknown> };
            const metadata = schema?.properties?.['metadata'] as { properties?: Record<string, unknown> };
            expect(metadata?.properties?.['createdBy']).toBeDefined();
        });
    });

    describe('requestRedactions', () => {
        it('should remove fields from request body schemas', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                requestRedactions: [
                    {
                        operationId: 'createUser',
                        fields: ['internalPriority'],
                    },
                ],
            };

            const result = applyOverlay(ir, overlay);

            const createUserOp = result.ir.operations.find((o) => o.operationId === 'createUser')!;
            const schema = createUserOp.requestBody?.schema as { properties?: Record<string, unknown> };
            expect(schema.properties?.['internalPriority']).toBeUndefined();
            expect(schema.properties?.['email']).toBeDefined();
        });
    });

    describe('immutability', () => {
        it('should not modify the original IR', () => {
            const ir = createTestContract();
            const originalOperationsCount = ir.operations.length;
            const originalSchemaFields = Object.keys(ir.schemas['User'].properties!);

            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                hideOperations: [{ operationId: 'getInternalMetrics' }],
                schemaRedactions: [{ schemaId: 'User', fields: ['passwordHash'] }],
            };

            applyOverlay(ir, overlay);

            expect(ir.operations.length).toBe(originalOperationsCount);
            expect(Object.keys(ir.schemas['User'].properties!)).toEqual(originalSchemaFields);
        });
    });

    describe('determinism', () => {
        it('should produce identical output for same inputs', () => {
            const ir = createTestContract();
            const overlay: Overlay = {
                irOverlayVersion: '0.1',
                name: 'public',
                hideOperations: [
                    { operationId: 'getInternalMetrics' },
                    { operationId: 'adminDeleteUser' },
                ],
                schemaRedactions: [
                    { schemaId: 'User', fields: ['passwordHash', 'internalId'] },
                ],
            };

            const result1 = applyOverlay(ir, overlay);
            const result2 = applyOverlay(ir, overlay);

            expect(JSON.stringify(result1.ir)).toBe(JSON.stringify(result2.ir));
            expect(JSON.stringify(result1.summary)).toBe(JSON.stringify(result2.summary));
        });
    });
});

describe('getOverlaySummary', () => {
    it('should return accurate counts without applying overlay', () => {
        const ir = createTestContract();
        const overlay: Overlay = {
            irOverlayVersion: '0.1',
            name: 'public',
            hideOperations: [
                { operationId: 'getInternalMetrics' },
                { method: 'GET', path: '/internal/*' },
            ],
            serverOverrides: [
                { pattern: 'https://internal.api.example.com', replacement: 'https://api.example.com' },
            ],
            schemaRedactions: [
                { schemaId: 'User', fields: ['passwordHash'] },
            ],
            responseRedactions: [
                { operationId: 'getUser', fields: ['metadata'] },
            ],
            requestRedactions: [
                { operationId: 'createUser', fields: ['internalPriority'] },
            ],
        };

        const summary = getOverlaySummary(ir, overlay);

        expect(summary.hiddenOperationsCount).toBe(2); // getInternalMetrics + getInternalHealth
        expect(summary.hasServerOverrides).toBe(true);
        expect(summary.schemaRedactionsCount).toBe(1);
        expect(summary.responseRedactionsCount).toBe(1);
        expect(summary.requestRedactionsCount).toBe(1);
        expect(summary.hiddenOperationIds).toContain('getInternalMetrics');
        expect(summary.hiddenOperationIds).toContain('getInternalHealth');
        expect(summary.redactedSchemaIds).toContain('User');
    });
});
