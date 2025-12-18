import { describe, expect, it } from 'vitest';
import {
  CreateOrderRequestSchema,
  CreateOrderResponseSchema,
  ErrorResponseSchema,
} from '../src/index.js';

describe('express-zod example schemas', () => {
  describe('CreateOrderRequestSchema', () => {
    it('should validate a valid request', () => {
      const validRequest = {
        customerId: 'cust-123',
        items: [{ productId: 'prod-1', quantity: 2 }],
      };

      const result = CreateOrderRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject request without customerId', () => {
      const invalidRequest = {
        items: [{ productId: 'prod-1', quantity: 2 }],
      };

      const result = CreateOrderRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject request with empty items', () => {
      const invalidRequest = {
        customerId: 'cust-123',
        items: [],
      };

      const result = CreateOrderRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateOrderResponseSchema', () => {
    it('should validate a valid response', () => {
      const validResponse = {
        orderId: 'order-123',
        status: 'pending',
        createdAt: '2025-12-17T10:00:00.000Z',
      };

      const result = CreateOrderResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('ErrorResponseSchema', () => {
    it('should validate a valid error response', () => {
      const validError = {
        code: 'VALIDATION_ERROR',
        message: 'Something went wrong',
      };

      const result = ErrorResponseSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });
  });
});
