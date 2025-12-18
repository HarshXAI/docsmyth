import { describe, expect, it } from 'vitest';
import { validate } from '@docsmyth/ir-spec';
import {
  ref,
  makeService,
  makeHttpOperation,
  makeResponse,
  makeParameter,
  makeRequestBody,
  makeContractIR,
} from '../src/index.js';

describe('@docsmyth/ir-sdk', () => {
  describe('ref()', () => {
    it('should create a schema reference string', () => {
      expect(ref('CreateOrderRequest')).toBe('schema:CreateOrderRequest');
      expect(ref('User')).toBe('schema:User');
    });
  });

  describe('makeService()', () => {
    it('should create a minimal service', () => {
      const service = makeService({
        name: 'orders-api',
        version: '1.0.0',
      });

      expect(service.name).toBe('orders-api');
      expect(service.version).toBe('1.0.0');
    });

    it('should include optional fields when provided', () => {
      const service = makeService({
        name: 'orders-api',
        version: '1.0.0',
        description: 'Order management API',
        baseUrls: ['https://api.example.com'],
        contact: { email: 'api@example.com' },
      });

      expect(service.description).toBe('Order management API');
      expect(service.baseUrls).toEqual(['https://api.example.com']);
      expect(service.contact?.email).toBe('api@example.com');
    });
  });

  describe('makeHttpOperation()', () => {
    it('should create a minimal operation', () => {
      const op = makeHttpOperation({
        operationId: 'getOrders',
        method: 'GET',
        path: '/orders',
        responses: [{ statusCode: 200 }],
      });

      expect(op.operationId).toBe('getOrders');
      expect(op.method).toBe('GET');
      expect(op.path).toBe('/orders');
      expect(op.responses).toHaveLength(1);
    });

    it('should include optional fields', () => {
      const op = makeHttpOperation({
        operationId: 'createOrder',
        method: 'POST',
        path: '/orders',
        summary: 'Create a new order',
        tags: ['orders'],
        requestBody: {
          schema: { $ref: ref('CreateOrderRequest') },
          required: true,
        },
        responses: [
          { statusCode: 201, schema: { $ref: ref('Order') } },
          { statusCode: 400, schema: { $ref: ref('ErrorResponse') } },
        ],
      });

      expect(op.summary).toBe('Create a new order');
      expect(op.tags).toContain('orders');
      expect(op.requestBody?.schema).toEqual({ $ref: 'schema:CreateOrderRequest' });
    });
  });

  describe('makeResponse()', () => {
    it('should create a response with just status code', () => {
      const res = makeResponse(200);
      expect(res.statusCode).toBe(200);
    });

    it('should create a response with schema', () => {
      const res = makeResponse(201, {
        description: 'Created',
        contentType: 'application/json',
        schema: { $ref: ref('Order') },
      });

      expect(res.statusCode).toBe(201);
      expect(res.description).toBe('Created');
      expect(res.schema).toEqual({ $ref: 'schema:Order' });
    });
  });

  describe('makeParameter()', () => {
    it('should create a path parameter', () => {
      const param = makeParameter('id', 'path', {
        required: true,
        schema: { type: 'string' },
      });

      expect(param.name).toBe('id');
      expect(param.in).toBe('path');
      expect(param.required).toBe(true);
    });
  });

  describe('makeRequestBody()', () => {
    it('should create a request body', () => {
      const body = makeRequestBody({
        schema: { $ref: ref('CreateOrderRequest') },
        required: true,
        contentType: 'application/json',
      });

      expect(body.schema).toEqual({ $ref: 'schema:CreateOrderRequest' });
      expect(body.required).toBe(true);
    });
  });

  describe('makeContractIR()', () => {
    it('should create a valid Contract IR document', () => {
      const ir = makeContractIR({
        service: makeService({
          name: 'test-api',
          version: '1.0.0',
        }),
        schemas: {
          Order: {
            $id: 'Order',
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        operations: [
          makeHttpOperation({
            operationId: 'getOrder',
            method: 'GET',
            path: '/orders/{id}',
            responses: [makeResponse(200, { schema: { $ref: ref('Order') } })],
          }),
        ],
      });

      expect(ir.irVersion).toBe('0.1');
      expect(ir.service.name).toBe('test-api');
      expect(ir.schemas.Order).toBeDefined();
      expect(ir.operations).toHaveLength(1);

      // Validate the generated IR
      const result = validate(ir);
      expect(result.valid).toBe(true);
    });
  });
});
