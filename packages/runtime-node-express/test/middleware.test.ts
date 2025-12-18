/**
 * Integration tests for Express middleware
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ContractIR } from '@acp/ir-spec';
import type { EvidenceEvent } from '@acp/evidence-sdk';
import { evidenceCapture, createMemoryEmitter } from '../src/index.js';

const TEST_CONTRACT: ContractIR = {
  irVersion: '0.1',
  service: {
    name: 'test-api',
    version: '1.0.0',
  },
  schemas: {
    Order: {
      $id: 'Order',
      type: 'object',
      properties: {
        id: { type: 'string' },
        customerId: { type: 'string' },
        items: { type: 'array' },
      },
      required: ['id', 'customerId'],
    },
    CreateOrderRequest: {
      $id: 'CreateOrderRequest',
      type: 'object',
      properties: {
        customerId: { type: 'string' },
        items: { type: 'array' },
      },
      required: ['customerId'],
    },
  },
  operations: [
    {
      operationId: 'listOrders',
      method: 'GET',
      path: '/orders',
      responses: [{ statusCode: 200 }],
    },
    {
      operationId: 'createOrder',
      method: 'POST',
      path: '/orders',
      requestBody: {
        schema: { $ref: 'schema:CreateOrderRequest' },
      },
      responses: [{ statusCode: 201 }],
    },
    {
      operationId: 'getOrder',
      method: 'GET',
      path: '/orders/{id}',
      responses: [{ statusCode: 200 }, { statusCode: 404 }],
    },
  ],
};

describe('evidenceCapture middleware', () => {
  let app: Express;
  let memoryEmitter: ReturnType<typeof createMemoryEmitter>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    memoryEmitter = createMemoryEmitter();
  });

  describe('when disabled', () => {
    it('should not capture evidence', async () => {
      app.use(
        evidenceCapture({
          contract: TEST_CONTRACT,
          enabled: false,
          emitter: memoryEmitter.emitter,
        })
      );

      app.get('/orders', (req, res) => {
        res.json([]);
      });

      await request(app).get('/orders').expect(200);

      expect(memoryEmitter.events).toHaveLength(0);
    });
  });

  describe('when enabled', () => {
    beforeEach(() => {
      app.use(
        evidenceCapture({
          contract: TEST_CONTRACT,
          enabled: true,
          emitter: memoryEmitter.emitter,
        })
      );
    });

    it('should capture GET request evidence', async () => {
      app.get('/orders', (req, res) => {
        res.json([{ id: '1', customerId: 'cust-1' }]);
      });

      await request(app).get('/orders').expect(200);

      // Wait for async emit
      await new Promise((r) => setTimeout(r, 50));

      expect(memoryEmitter.events).toHaveLength(1);
      const event = memoryEmitter.events[0];

      expect(event.operationId).toBe('listOrders');
      expect(event.protocol).toBe('http');
      expect(event.request.method).toBe('GET');
      expect(event.request.path).toBe('/orders');
      expect(event.response.status).toBe(200);
      expect(event.response.body).toEqual([{ id: '1', customerId: 'cust-1' }]);
    });

    it('should capture POST request with body', async () => {
      app.post('/orders', (req, res) => {
        res.status(201).json({ id: 'new-1', customerId: req.body.customerId });
      });

      await request(app)
        .post('/orders')
        .send({ customerId: 'cust-123', items: ['item-1'] })
        .expect(201);

      await new Promise((r) => setTimeout(r, 50));

      expect(memoryEmitter.events).toHaveLength(1);
      const event = memoryEmitter.events[0];

      expect(event.operationId).toBe('createOrder');
      expect(event.request.method).toBe('POST');
      expect(event.request.body).toEqual({ customerId: 'cust-123', items: ['item-1'] });
      expect(event.response.status).toBe(201);
      expect(event.response.body).toEqual({ id: 'new-1', customerId: 'cust-123' });
    });

    it('should capture path parameters', async () => {
      app.get('/orders/:id', (req, res) => {
        res.json({ id: req.params.id, customerId: 'cust-1' });
      });

      await request(app).get('/orders/order-123').expect(200);

      await new Promise((r) => setTimeout(r, 50));

      expect(memoryEmitter.events).toHaveLength(1);
      const event = memoryEmitter.events[0];

      expect(event.operationId).toBe('getOrder');
      expect(event.request.params).toEqual({ id: 'order-123' });
    });

    it('should capture query parameters', async () => {
      app.get('/orders', (req, res) => {
        res.json([]);
      });

      await request(app).get('/orders?page=1&limit=10').expect(200);

      await new Promise((r) => setTimeout(r, 50));

      expect(memoryEmitter.events).toHaveLength(1);
      const event = memoryEmitter.events[0];

      expect(event.request.query).toEqual({ page: '1', limit: '10' });
    });

    it('should not capture unmatched operations', async () => {
      app.get('/unknown', (req, res) => {
        res.json({ status: 'ok' });
      });

      await request(app).get('/unknown').expect(200);

      await new Promise((r) => setTimeout(r, 50));

      expect(memoryEmitter.events).toHaveLength(0);
    });

    it('should sanitize Authorization header', async () => {
      app.get('/orders', (req, res) => {
        res.json([]);
      });

      await request(app).get('/orders').set('Authorization', 'Bearer secret-token').expect(200);

      await new Promise((r) => setTimeout(r, 50));

      expect(memoryEmitter.events).toHaveLength(1);
      const event = memoryEmitter.events[0];

      expect(event.request.headers?.['authorization']).toBeUndefined();
      expect(event.request.headers?.['Authorization']).toBeUndefined();
    });

    it('should sanitize sensitive fields in body', async () => {
      app.post('/orders', (req, res) => {
        res.status(201).json({
          id: 'new-1',
          accessToken: 'super-secret-token',
        });
      });

      await request(app)
        .post('/orders')
        .send({ customerId: 'cust-123', password: 'secret123' })
        .expect(201);

      await new Promise((r) => setTimeout(r, 50));

      expect(memoryEmitter.events).toHaveLength(1);
      const event = memoryEmitter.events[0];

      expect(event.request.body).toEqual({
        customerId: 'cust-123',
        password: '[REDACTED]',
      });
      expect(event.response.body).toEqual({
        id: 'new-1',
        accessToken: '[REDACTED]',
      });
    });

    it('should include evidence version and timestamp', async () => {
      app.get('/orders', (req, res) => {
        res.json([]);
      });

      await request(app).get('/orders').expect(200);

      await new Promise((r) => setTimeout(r, 50));

      const event = memoryEmitter.events[0];

      expect(event.evidenceVersion).toBe('0.1');
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('NDJSON file output', () => {
    const testOutputPath = join(process.cwd(), '.acp-test', 'test-evidence.ndjson');

    beforeEach(() => {
      // Clean up test file
      const dir = dirname(testOutputPath);
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    });

    afterEach(() => {
      // Clean up test file
      const dir = dirname(testOutputPath);
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    });

    it('should write evidence to NDJSON file', async () => {
      app.use(
        evidenceCapture({
          contract: TEST_CONTRACT,
          enabled: true,
          outputPath: testOutputPath,
        })
      );

      app.get('/orders', (req, res) => {
        res.json([{ id: '1' }]);
      });

      await request(app).get('/orders').expect(200);

      // Wait for async write
      await new Promise((r) => setTimeout(r, 100));

      expect(existsSync(testOutputPath)).toBe(true);

      const content = readFileSync(testOutputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const event: EvidenceEvent = JSON.parse(lines[0]);
      expect(event.operationId).toBe('listOrders');
      expect(event.response.body).toEqual([{ id: '1' }]);
    });

    it('should append multiple events', async () => {
      app.use(
        evidenceCapture({
          contract: TEST_CONTRACT,
          enabled: true,
          outputPath: testOutputPath,
        })
      );

      app.get('/orders', (req, res) => {
        res.json([]);
      });

      await request(app).get('/orders').expect(200);
      await request(app).get('/orders').expect(200);

      await new Promise((r) => setTimeout(r, 100));

      const content = readFileSync(testOutputPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should not crash the app on emitter error', async () => {
      const failingEmitter = () => {
        throw new Error('Emitter failed');
      };

      // Use a mock logger to capture warnings and avoid polluting CI logs
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: vi.fn(),
        error: () => { },
      };

      app.use(
        evidenceCapture({
          contract: TEST_CONTRACT,
          enabled: true,
          emitter: failingEmitter,
          logger: mockLogger,
        })
      );

      app.get('/orders', (req, res) => {
        res.json([]);
      });

      // Should still succeed
      await request(app).get('/orders').expect(200);

      // Wait for async capture to complete
      await new Promise((r) => setTimeout(r, 50));

      // Assert that the error was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to capture evidence:',
        expect.any(Error)
      );
    });
  });
});
