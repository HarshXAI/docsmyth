/**
 * Tests for path-normalizer service
 */

import { describe, it, expect } from 'vitest';
import {
    isLikelyParameter,
    normalizePath,
    generateOperationId,
    inferSemanticOperationId,
} from '../src/services/path-normalizer.js';

describe('isLikelyParameter', () => {
    it('detects numeric IDs', () => {
        expect(isLikelyParameter('123')).toBe(true);
        expect(isLikelyParameter('45678')).toBe(true);
        expect(isLikelyParameter('0')).toBe(true);
    });

    it('detects UUIDs', () => {
        expect(isLikelyParameter('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isLikelyParameter('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('detects UUIDs without dashes', () => {
        expect(isLikelyParameter('550e8400e29b41d4a716446655440000')).toBe(true);
    });

    it('detects MongoDB ObjectIds', () => {
        expect(isLikelyParameter('507f1f77bcf86cd799439011')).toBe(true);
        expect(isLikelyParameter('5f50c31b8f8b9a1b3c4d5e6f')).toBe(true);
    });

    it('detects short IDs with mixed alphanumeric', () => {
        expect(isLikelyParameter('abc123')).toBe(true);
        expect(isLikelyParameter('user-x9y2z3')).toBe(true);
    });

    it('does not detect regular words', () => {
        expect(isLikelyParameter('users')).toBe(false);
        expect(isLikelyParameter('posts')).toBe(false);
        expect(isLikelyParameter('api')).toBe(false);
        expect(isLikelyParameter('v1')).toBe(false); // too short
    });

    it('does not detect empty strings', () => {
        expect(isLikelyParameter('')).toBe(false);
    });
});

describe('normalizePath', () => {
    it('normalizes paths with numeric IDs', () => {
        const result = normalizePath('/users/123');
        expect(result.template).toBe('/users/{param1}');
        expect(result.params).toEqual({ param1: '123' });
    });

    it('normalizes paths with multiple parameters', () => {
        const result = normalizePath('/users/123/posts/456');
        expect(result.template).toBe('/users/{param1}/posts/{param2}');
        expect(result.params).toEqual({ param1: '123', param2: '456' });
    });

    it('normalizes paths with UUIDs', () => {
        const result = normalizePath('/orders/550e8400-e29b-41d4-a716-446655440000');
        expect(result.template).toBe('/orders/{param1}');
    });

    it('preserves static segments', () => {
        const result = normalizePath('/api/v1/users');
        expect(result.template).toBe('/api/v1/users');
        expect(result.params).toEqual({});
    });

    it('handles root path', () => {
        const result = normalizePath('/');
        expect(result.template).toBe('/');
    });

    it('handles nested resources', () => {
        const result = normalizePath('/users/42/comments/abc123/replies');
        expect(result.template).toBe('/users/{param1}/comments/{param2}/replies');
    });
});

describe('generateOperationId', () => {
    it('generates operationId from method and path', () => {
        expect(generateOperationId('GET', '/users')).toBe('GET /users');
        expect(generateOperationId('post', '/users')).toBe('POST /users');
        expect(generateOperationId('DELETE', '/users/{param1}')).toBe('DELETE /users/{param1}');
    });
});

describe('inferSemanticOperationId', () => {
    it('infers list operation', () => {
        expect(inferSemanticOperationId('GET', '/users')).toBe('listUsers');
        expect(inferSemanticOperationId('GET', '/posts')).toBe('listPosts');
    });

    it('infers get single operation', () => {
        expect(inferSemanticOperationId('GET', '/users/{param1}')).toBe('getUser');
        expect(inferSemanticOperationId('GET', '/posts/{param1}')).toBe('getPost');
    });

    it('infers create operation', () => {
        expect(inferSemanticOperationId('POST', '/users')).toBe('createUser');
        expect(inferSemanticOperationId('POST', '/orders')).toBe('createOrder');
    });

    it('infers update operation', () => {
        expect(inferSemanticOperationId('PUT', '/users/{param1}')).toBe('updateUser');
    });

    it('infers patch operation', () => {
        expect(inferSemanticOperationId('PATCH', '/users/{param1}')).toBe('patchUser');
    });

    it('infers delete operation', () => {
        expect(inferSemanticOperationId('DELETE', '/users/{param1}')).toBe('deleteUser');
    });

    it('handles nested resources', () => {
        expect(inferSemanticOperationId('GET', '/users/{param1}/posts')).toBe('listPosts');
        expect(inferSemanticOperationId('GET', '/users/{param1}/posts/{param2}')).toBe('getPost');
    });
});
