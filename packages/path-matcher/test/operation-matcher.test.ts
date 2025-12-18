import { describe, it, expect } from 'vitest';
import { createOperationMatcher, findOperation } from '../src/operation-matcher.js';
import type { ContractIR } from '@docsmyth/ir-spec';

const testContract: ContractIR = {
  irVersion: '0.1',
  service: {
    name: 'test-api',
    version: '1.0.0',
  },
  schemas: {},
  operations: [
    {
      operationId: 'getHealth',
      method: 'GET',
      path: '/health',
      summary: 'Health check',
      responses: {
        200: { description: 'OK' },
      },
    },
    {
      operationId: 'listUsers',
      method: 'GET',
      path: '/users',
      summary: 'List users',
      responses: {
        200: { description: 'OK' },
      },
    },
    {
      operationId: 'createUser',
      method: 'POST',
      path: '/users',
      summary: 'Create user',
      responses: {
        201: { description: 'Created' },
      },
    },
    {
      operationId: 'getUser',
      method: 'GET',
      path: '/users/{userId}',
      summary: 'Get user by ID',
      responses: {
        200: { description: 'OK' },
      },
    },
    {
      operationId: 'getUserPosts',
      method: 'GET',
      path: '/users/{userId}/posts/{postId}',
      summary: 'Get user post',
      responses: {
        200: { description: 'OK' },
      },
    },
  ],
};

describe('operation-matcher', () => {
  describe('createOperationMatcher', () => {
    it('creates matcher with correct operation count', () => {
      const matcher = createOperationMatcher(testContract);
      expect(matcher.operationCount).toBe(5);
    });

    it('extracts service info', () => {
      const matcher = createOperationMatcher(testContract);
      expect(matcher.serviceName).toBe('test-api');
      expect(matcher.serviceVersion).toBe('1.0.0');
    });

    it('groups operations by method', () => {
      const matcher = createOperationMatcher(testContract);
      expect(matcher.byMethod.get('GET')?.length).toBe(4);
      expect(matcher.byMethod.get('POST')?.length).toBe(1);
      expect(matcher.byMethod.get('DELETE')).toBeUndefined();
    });
  });

  describe('findOperation', () => {
    const matcher = createOperationMatcher(testContract);

    it('matches static GET path', () => {
      const result = findOperation(matcher, 'GET', '/health');
      expect(result).not.toBeNull();
      expect(result!.operation.operationId).toBe('getHealth');
      expect(result!.params).toEqual({});
      expect(result!.pathTemplate).toBe('/health');
    });

    it('matches GET with path parameter', () => {
      const result = findOperation(matcher, 'GET', '/users/123');
      expect(result).not.toBeNull();
      expect(result!.operation.operationId).toBe('getUser');
      expect(result!.params).toEqual({ userId: '123' });
      expect(result!.pathTemplate).toBe('/users/{userId}');
    });

    it('matches POST to same path as GET', () => {
      const result = findOperation(matcher, 'POST', '/users');
      expect(result).not.toBeNull();
      expect(result!.operation.operationId).toBe('createUser');
    });

    it('matches path with multiple parameters', () => {
      const result = findOperation(matcher, 'GET', '/users/abc/posts/xyz');
      expect(result).not.toBeNull();
      expect(result!.operation.operationId).toBe('getUserPosts');
      expect(result!.params).toEqual({ userId: 'abc', postId: 'xyz' });
    });

    it('returns null for non-matching method', () => {
      const result = findOperation(matcher, 'DELETE', '/health');
      expect(result).toBeNull();
    });

    it('returns null for non-matching path', () => {
      const result = findOperation(matcher, 'GET', '/orders');
      expect(result).toBeNull();
    });

    it('handles case-insensitive method matching', () => {
      const result = findOperation(matcher, 'get', '/health');
      expect(result).not.toBeNull();
      expect(result!.operation.operationId).toBe('getHealth');
    });

    it('prefers exact match over parameterized path', () => {
      // /users should match listUsers, not getUser with empty param
      const result = findOperation(matcher, 'GET', '/users');
      expect(result).not.toBeNull();
      expect(result!.operation.operationId).toBe('listUsers');
    });
  });

  describe('edge cases', () => {
    it('handles empty contract', () => {
      const emptyContract: ContractIR = {
        irVersion: '0.1',
        service: { name: 'empty', version: '0.0.0' },
        schemas: {},
        operations: [],
      };
      const emptyMatcher = createOperationMatcher(emptyContract);
      expect(emptyMatcher.operationCount).toBe(0);
      expect(findOperation(emptyMatcher, 'GET', '/anything')).toBeNull();
    });

    it('handles trailing slashes', () => {
      const testMatcher = createOperationMatcher(testContract);
      const result = findOperation(testMatcher, 'GET', '/users/');
      expect(result).not.toBeNull();
      expect(result!.operation.operationId).toBe('listUsers');
    });
  });
});
