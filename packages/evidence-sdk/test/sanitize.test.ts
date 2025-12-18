/**
 * Tests for evidence sanitization
 */

import { describe, it, expect } from 'vitest';
import { sanitize, createSanitizer, type SanitizeConfig } from '../src/sanitize.js';
import type { EvidenceEvent } from '../src/types.js';

function createTestEvent(overrides?: Partial<EvidenceEvent>): EvidenceEvent {
  return {
    evidenceVersion: '0.1',
    operationId: 'createOrder',
    protocol: 'http',
    timestamp: '2025-12-17T10:00:00.000Z',
    request: {
      method: 'POST',
      path: '/orders',
      headers: {
        'Content-Type': 'application/json',
      },
      body: { item: 'widget' },
    },
    response: {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
      body: { id: '123' },
    },
    ...overrides,
  };
}

describe('sanitize', () => {
  describe('header sanitization', () => {
    it('should remove Authorization header by default', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users',
          headers: {
            Authorization: 'Bearer secret-token',
            'Content-Type': 'application/json',
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(sanitized.request.headers?.['Authorization']).toBeUndefined();
    });

    it('should remove Cookie and Set-Cookie headers by default', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users',
          headers: {
            Cookie: 'session=abc123',
          },
        },
        response: {
          status: 200,
          headers: {
            'Set-Cookie': 'session=def456; HttpOnly',
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.headers).toBeUndefined();
      expect(sanitized.response.headers).toBeUndefined();
    });

    it('should remove x-api-key header (case-insensitive)', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users',
          headers: {
            'X-API-Key': 'secret-key',
            Accept: 'application/json',
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.headers).toEqual({
        Accept: 'application/json',
      });
    });

    it('should support custom denylist headers', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users',
          headers: {
            'X-Custom-Secret': 'secret',
            'Content-Type': 'application/json',
          },
        },
      });

      const config: SanitizeConfig = {
        denylistHeaders: ['x-custom-secret'],
      };

      const sanitized = sanitize(event, config);

      expect(sanitized.request.headers).toEqual({
        'Content-Type': 'application/json',
      });
    });

    it('should support allowlist headers', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token',
            Accept: 'application/json',
          },
        },
      });

      const config: SanitizeConfig = {
        allowlistHeaders: ['content-type', 'accept'],
      };

      const sanitized = sanitize(event, config);

      expect(sanitized.request.headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
    });
  });

  describe('PII masking', () => {
    it('should mask email addresses in body', () => {
      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/users',
          body: {
            email: 'john.doe@example.com',
            name: 'John Doe',
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.body).toEqual({
        email: '[REDACTED]',
        name: 'John Doe',
      });
    });

    it('should mask phone numbers', () => {
      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/users',
          body: {
            phone: '555-123-4567',
            name: 'John',
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.body).toEqual({
        phone: '[REDACTED]',
        name: 'John',
      });
    });

    it('should mask SSN patterns', () => {
      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/users',
          body: {
            ssn: '123-45-6789',
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.body).toEqual({
        ssn: '[REDACTED]',
      });
    });

    it('should allow disabling PII masking', () => {
      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/users',
          body: {
            email: 'john@example.com',
          },
        },
      });

      const config: SanitizeConfig = {
        maskPii: false,
      };

      const sanitized = sanitize(event, config);

      expect(sanitized.request.body).toEqual({
        email: 'john@example.com',
      });
    });
  });

  describe('sensitive field masking', () => {
    it('should mask password fields', () => {
      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/login',
          body: {
            username: 'john',
            password: 'supersecret',
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.body).toEqual({
        username: 'john',
        password: '[REDACTED]',
      });
    });

    it('should mask token fields', () => {
      const event = createTestEvent({
        response: {
          status: 200,
          body: {
            accessToken: 'abc123xyz',
            refreshToken: 'refresh456',
            user: { id: '1' },
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.response.body).toEqual({
        accessToken: '[REDACTED]',
        refreshToken: '[REDACTED]',
        user: { id: '1' },
      });
    });

    it('should mask nested sensitive fields', () => {
      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/settings',
          body: {
            config: {
              apiKey: 'secret-key',
              endpoint: 'https://api.example.com',
            },
          },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.body).toEqual({
        config: {
          apiKey: '[REDACTED]',
          endpoint: 'https://api.example.com',
        },
      });
    });

    it('should support custom sensitive fields', () => {
      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/settings',
          body: {
            myCustomSecret: 'secret-value',
            normalField: 'normal',
          },
        },
      });

      const config: SanitizeConfig = {
        sensitiveFields: ['myCustomSecret'],
      };

      const sanitized = sanitize(event, config);

      expect(sanitized.request.body).toEqual({
        myCustomSecret: '[REDACTED]',
        normalField: 'normal',
      });
    });
  });

  describe('token masking', () => {
    it('should mask Bearer tokens in header values', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users',
          headers: {
            'X-Forwarded-Authorization':
              'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
          },
        },
      });

      // Note: X-Forwarded-Authorization is not in the denylist
      // but Bearer tokens should still be masked in the value
      const sanitized = sanitize(event);

      expect(sanitized.request.headers?.['X-Forwarded-Authorization']).toContain('[REDACTED]');
    });
  });

  describe('array handling', () => {
    it('should sanitize arrays of objects', () => {
      const event = createTestEvent({
        response: {
          status: 200,
          body: [
            { id: 1, email: 'user1@example.com' },
            { id: 2, email: 'user2@example.com' },
          ],
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.response.body).toEqual([
        { id: 1, email: '[REDACTED]' },
        { id: 2, email: '[REDACTED]' },
      ]);
    });
  });

  describe('createSanitizer', () => {
    it('should create a reusable sanitizer function', () => {
      const customSanitizer = createSanitizer({
        denylistHeaders: ['x-custom'],
        sensitiveFields: ['secret'],
      });

      const event = createTestEvent({
        request: {
          method: 'POST',
          path: '/test',
          headers: {
            'X-Custom': 'value',
            'Content-Type': 'application/json',
          },
          body: {
            secret: 'password123',
            public: 'data',
          },
        },
      });

      const sanitized = customSanitizer(event);

      expect(sanitized.request.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(sanitized.request.body).toEqual({
        secret: '[REDACTED]',
        public: 'data',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle undefined body', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users',
        },
        response: {
          status: 204,
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.body).toBeUndefined();
      expect(sanitized.response.body).toBeUndefined();
    });

    it('should handle null body', () => {
      const event = createTestEvent({
        response: {
          status: 200,
          body: null,
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.response.body).toBeNull();
    });

    it('should preserve traceId', () => {
      const event = createTestEvent({
        traceId: 'trace-123',
      });

      const sanitized = sanitize(event);

      expect(sanitized.traceId).toBe('trace-123');
    });

    it('should preserve query and params', () => {
      const event = createTestEvent({
        request: {
          method: 'GET',
          path: '/users/123',
          query: { page: 1, limit: 10 },
          params: { id: '123' },
        },
      });

      const sanitized = sanitize(event);

      expect(sanitized.request.params).toEqual({ id: '123' });
      expect(sanitized.request.query).toEqual({ page: 1, limit: 10 });
    });
  });
});
