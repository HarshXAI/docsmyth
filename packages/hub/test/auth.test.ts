/**
 * Authentication Tests
 */

import { describe, it, expect } from 'vitest';
import { extractBearerToken, createAuthMiddleware } from '../src/auth.js';
import type { Request, Response } from 'express';

describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
        expect(extractBearerToken('Bearer my-token-123')).toBe('my-token-123');
    });

    it('should return null for missing header', () => {
        expect(extractBearerToken(undefined)).toBeNull();
    });

    it('should return null for non-Bearer scheme', () => {
        expect(extractBearerToken('Basic abc123')).toBeNull();
    });

    it('should return null for malformed header', () => {
        expect(extractBearerToken('Bearer')).toBeNull();
        expect(extractBearerToken('Bearer token extra')).toBeNull();
    });

    it('should be case-insensitive for Bearer', () => {
        expect(extractBearerToken('bearer my-token')).toBe('my-token');
        expect(extractBearerToken('BEARER my-token')).toBe('my-token');
    });
});

describe('createAuthMiddleware', () => {
    const createMockReq = (authHeader?: string): Partial<Request> => ({
        headers: authHeader ? { authorization: authHeader } : {},
    });

    const createMockRes = (): Partial<Response> & { statusCode?: number; body?: unknown } => {
        const res: Partial<Response> & { statusCode?: number; body?: unknown } = {
            statusCode: undefined,
            body: undefined,
        };
        res.status = ((code: number) => {
            res.statusCode = code;
            return res as Response;
        }) as Response['status'];
        res.json = ((body: unknown) => {
            res.body = body;
            return res as Response;
        }) as Response['json'];
        return res;
    };

    describe('requirePublishAuth', () => {
        it('should allow request when no token is configured', () => {
            const { requirePublishAuth } = createAuthMiddleware({
                publishToken: null,
                requireAuthForReads: false,
            });

            const req = createMockReq();
            const res = createMockRes();
            let nextCalled = false;

            requirePublishAuth(req as Request, res as Response, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        it('should reject request without token when token is configured', () => {
            const { requirePublishAuth } = createAuthMiddleware({
                publishToken: 'secret-token',
                requireAuthForReads: false,
            });

            const req = createMockReq();
            const res = createMockRes();
            let nextCalled = false;

            requirePublishAuth(req as Request, res as Response, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        });

        it('should allow request with correct token', () => {
            const { requirePublishAuth } = createAuthMiddleware({
                publishToken: 'secret-token',
                requireAuthForReads: false,
            });

            const req = createMockReq('Bearer secret-token');
            const res = createMockRes();
            let nextCalled = false;

            requirePublishAuth(req as Request, res as Response, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        it('should reject request with wrong token', () => {
            const { requirePublishAuth } = createAuthMiddleware({
                publishToken: 'secret-token',
                requireAuthForReads: false,
            });

            const req = createMockReq('Bearer wrong-token');
            const res = createMockRes();
            let nextCalled = false;

            requirePublishAuth(req as Request, res as Response, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        });
    });

    describe('optionalReadAuth', () => {
        it('should allow request when reads do not require auth', () => {
            const { optionalReadAuth } = createAuthMiddleware({
                publishToken: 'secret-token',
                requireAuthForReads: false,
            });

            const req = createMockReq();
            const res = createMockRes();
            let nextCalled = false;

            optionalReadAuth(req as Request, res as Response, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });

        it('should require token when reads require auth', () => {
            const { optionalReadAuth } = createAuthMiddleware({
                publishToken: 'secret-token',
                requireAuthForReads: true,
            });

            const req = createMockReq();
            const res = createMockRes();
            let nextCalled = false;

            optionalReadAuth(req as Request, res as Response, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(401);
        });

        it('should allow authenticated request when reads require auth', () => {
            const { optionalReadAuth } = createAuthMiddleware({
                publishToken: 'secret-token',
                requireAuthForReads: true,
            });

            const req = createMockReq('Bearer secret-token');
            const res = createMockRes();
            let nextCalled = false;

            optionalReadAuth(req as Request, res as Response, () => {
                nextCalled = true;
            });

            expect(nextCalled).toBe(true);
        });
    });
});
