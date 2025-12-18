/**
 * Tests for @docsmyth/hub-client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    HubClient,
    createHubClient,
    HubConnectionError,
    HubNotFoundError,
    HubValidationError,
    HubAuthError,
    HubServerError,
    HubConflictError,
} from '../src/index.js';

// Mock fetch
const createMockFetch = (response: unknown, options: { status?: number; ok?: boolean } = {}) => {
    const { status = 200, ok = true } = options;
    return vi.fn().mockResolvedValue({
        ok,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue(response),
    });
};

describe('HubClient', () => {
    describe('health', () => {
        it('should return health status', async () => {
            const mockFetch = createMockFetch({ status: 'ok', timestamp: '2025-01-01T00:00:00Z' });
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const health = await client.health();

            expect(health.status).toBe('ok');
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:3000/healthz',
                expect.objectContaining({ method: 'GET' })
            );
        });

        it('should handle trailing slash in baseUrl', async () => {
            const mockFetch = createMockFetch({ status: 'ok', timestamp: '2025-01-01T00:00:00Z' });
            const client = new HubClient({
                baseUrl: 'http://localhost:3000/',
                fetch: mockFetch,
            });

            await client.health();

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:3000/healthz',
                expect.any(Object)
            );
        });
    });

    describe('isHealthy', () => {
        it('should return true when hub is healthy', async () => {
            const mockFetch = createMockFetch({ status: 'ok', timestamp: '2025-01-01T00:00:00Z' });
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const isHealthy = await client.isHealthy();

            expect(isHealthy).toBe(true);
        });

        it('should return false when hub returns error status', async () => {
            const mockFetch = createMockFetch({ status: 'error', timestamp: '2025-01-01T00:00:00Z' });
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const isHealthy = await client.isHealthy();

            expect(isHealthy).toBe(false);
        });

        it('should return false when fetch fails', async () => {
            const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const isHealthy = await client.isHealthy();

            expect(isHealthy).toBe(false);
        });
    });

    describe('listServices', () => {
        it('should return list of services', async () => {
            const mockResponse = {
                services: [
                    {
                        serviceName: 'orders-api',
                        latestVersion: '1.0.0',
                        versionCount: 3,
                        lastUpdated: '2025-01-01T00:00:00Z',
                    },
                ],
            };
            const mockFetch = createMockFetch(mockResponse);
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const result = await client.listServices();

            expect(result.services).toHaveLength(1);
            expect(result.services[0].serviceName).toBe('orders-api');
        });
    });

    describe('listVersions', () => {
        it('should return list of versions for a service', async () => {
            const mockResponse = {
                serviceName: 'orders-api',
                versions: [
                    { serviceName: 'orders-api', version: '1.0.0', irHash: 'abc123', publishedAt: '2025-01-01T00:00:00Z' },
                ],
            };
            const mockFetch = createMockFetch(mockResponse);
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const result = await client.listVersions('orders-api');

            expect(result.serviceName).toBe('orders-api');
            expect(result.versions).toHaveLength(1);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:3000/v1/services/orders-api/contracts',
                expect.any(Object)
            );
        });

        it('should encode service name in URL', async () => {
            const mockFetch = createMockFetch({ serviceName: 'orders api', versions: [] });
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            await client.listVersions('orders api');

            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:3000/v1/services/orders%20api/contracts',
                expect.any(Object)
            );
        });
    });

    describe('getContract', () => {
        it('should return a specific contract version', async () => {
            const mockResponse = {
                metadata: { serviceName: 'orders-api', version: '1.0.0', irHash: 'abc123', publishedAt: '2025-01-01T00:00:00Z' },
                ir: { version: '0.1', service: { name: 'orders-api' }, operations: [] },
                openApiUrl: '/v1/services/orders-api/contracts/1.0.0/openapi',
            };
            const mockFetch = createMockFetch(mockResponse);
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const result = await client.getContract('orders-api', '1.0.0');

            expect(result.metadata.version).toBe('1.0.0');
            expect(result.ir).toBeDefined();
        });
    });

    describe('getOpenApi', () => {
        it('should return OpenAPI document', async () => {
            const mockResponse = {
                openapi: '3.1.0',
                info: { title: 'Orders API', version: '1.0.0' },
                paths: {},
            };
            const mockFetch = createMockFetch(mockResponse);
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const result = await client.getOpenApi('orders-api', '1.0.0');

            expect(result.openapi).toBe('3.1.0');
            expect(result.info.title).toBe('Orders API');
        });
    });

    describe('publish', () => {
        it('should publish a new contract version', async () => {
            const mockResponse = {
                success: true,
                metadata: { serviceName: 'orders-api', version: '1.0.0', irHash: 'abc123', publishedAt: '2025-01-01T00:00:00Z' },
            };
            const mockFetch = createMockFetch(mockResponse, { status: 201 });
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                token: 'secret-token',
                fetch: mockFetch,
            });

            const ir = { version: '0.1' as const, service: { name: 'orders-api' }, operations: [] };
            const result = await client.publish({
                serviceName: 'orders-api',
                version: '1.0.0',
                ir,
            });

            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:3000/v1/services/orders-api/contracts',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        Authorization: 'Bearer secret-token',
                    }),
                })
            );
        });
    });

    describe('getArtifact', () => {
        it('should get a named artifact', async () => {
            const mockCoverage = {
                version: '1.0',
                generatedAt: '2025-01-01T00:00:00Z',
                summary: { totalOperations: 5, coveredOperations: 3, coveragePercent: 60 },
                operations: [],
            };
            const mockFetch = createMockFetch(mockCoverage);
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            const result = await client.getCoverage('orders-api', '1.0.0');

            expect(result.summary.coveragePercent).toBe(60);
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:3000/v1/services/orders-api/contracts/1.0.0/artifacts/coverage.json',
                expect.any(Object)
            );
        });
    });

    describe('error handling', () => {
        it('should throw HubNotFoundError for 404', async () => {
            const mockFetch = createMockFetch(
                { error: 'Not Found', message: 'Service not found' },
                { status: 404, ok: false }
            );
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            await expect(client.getContract('unknown', '1.0.0')).rejects.toThrow(HubNotFoundError);
        });

        it('should throw HubValidationError for 400', async () => {
            const mockFetch = createMockFetch(
                { error: 'Bad Request', message: 'Invalid IR', validationErrors: [{ message: 'Missing field' }] },
                { status: 400, ok: false }
            );
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            await expect(
                client.publish({
                    serviceName: 'test',
                    version: '1.0.0',
                    ir: {} as any,
                })
            ).rejects.toThrow(HubValidationError);
        });

        it('should throw HubAuthError for 401', async () => {
            const mockFetch = createMockFetch(
                { error: 'Unauthorized', message: 'Invalid token' },
                { status: 401, ok: false }
            );
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            await expect(
                client.publish({
                    serviceName: 'test',
                    version: '1.0.0',
                    ir: { version: '0.1' as const, service: { name: 'test' }, operations: [] },
                })
            ).rejects.toThrow(HubAuthError);
        });

        it('should throw HubConflictError for 409', async () => {
            const mockFetch = createMockFetch(
                { error: 'Conflict', message: 'Version already exists', existingHash: 'abc123' },
                { status: 409, ok: false }
            );
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            try {
                await client.publish({
                    serviceName: 'test',
                    version: '1.0.0',
                    ir: { version: '0.1' as const, service: { name: 'test' }, operations: [] },
                });
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(HubConflictError);
                expect((error as HubConflictError).existingHash).toBe('abc123');
            }
        });

        it('should throw HubServerError for 5xx', async () => {
            const mockFetch = createMockFetch(
                { error: 'Internal Server Error', message: 'Database error' },
                { status: 500, ok: false }
            );
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            await expect(client.listServices()).rejects.toThrow(HubServerError);
        });

        it('should throw HubConnectionError on network failure', async () => {
            const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            await expect(client.health()).rejects.toThrow(HubConnectionError);
        });

        it('should throw HubConnectionError on timeout', async () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            const mockFetch = vi.fn().mockRejectedValue(abortError);
            const client = new HubClient({
                baseUrl: 'http://localhost:3000',
                timeout: 1000,
                fetch: mockFetch,
            });

            try {
                await client.health();
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(HubConnectionError);
                expect((error as HubConnectionError).message).toContain('timeout');
            }
        });
    });

    describe('createHubClient', () => {
        it('should create a new client instance', () => {
            const mockFetch = createMockFetch({});
            const client = createHubClient({
                baseUrl: 'http://localhost:3000',
                fetch: mockFetch,
            });

            expect(client).toBeInstanceOf(HubClient);
        });
    });
});
