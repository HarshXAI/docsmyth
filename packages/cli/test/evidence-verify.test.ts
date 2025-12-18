/**
 * Tests for evidence verify command
 */

import { describe, it, expect } from 'vitest';
import { verifyEvidence } from '../src/commands/evidence-verify.js';
import type { ContractIR } from '@docsmyth/ir-spec';
import type { EvidenceEvent } from '@docsmyth/evidence-sdk';

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
      required: ['customerId', 'items'],
    },
  },
  operations: [
    {
      operationId: 'createOrder',
      method: 'POST',
      path: '/orders',
      requestBody: {
        schema: { $ref: 'schema:CreateOrderRequest' },
      },
      responses: [
        {
          statusCode: 201,
          schema: { $ref: 'schema:Order' },
        },
      ],
    },
    {
      operationId: 'listOrders',
      method: 'GET',
      path: '/orders',
      responses: [
        {
          statusCode: 200,
          schema: {
            type: 'array',
            items: { $ref: 'schema:Order' },
          },
        },
      ],
    },
  ],
};

function createValidEvent(operationId: string, request: object, response: object): EvidenceEvent {
  return {
    evidenceVersion: '0.1',
    operationId,
    protocol: 'http',
    timestamp: '2025-12-17T10:00:00.000Z',
    request: {
      method: 'POST',
      path: '/orders',
      ...request,
    },
    response: {
      status: 201,
      ...response,
    },
  };
}

describe('verifyEvidence', () => {
  it('should validate correct evidence', () => {
    const events: EvidenceEvent[] = [
      createValidEvent(
        'createOrder',
        { body: { customerId: 'cust-1', items: ['item-1'] } },
        { body: { id: 'order-1', customerId: 'cust-1' } }
      ),
    ];

    const result = verifyEvidence(events, TEST_CONTRACT);

    expect(result.valid).toBe(true);
    expect(result.totalEvents).toBe(1);
    expect(result.validEvents).toBe(1);
    expect(result.invalidEvents).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid request body', () => {
    const events: EvidenceEvent[] = [
      createValidEvent(
        'createOrder',
        { body: { wrongField: 'value' } }, // Missing required fields
        { body: { id: 'order-1', customerId: 'cust-1' } }
      ),
    ];

    const result = verifyEvidence(events, TEST_CONTRACT);

    expect(result.valid).toBe(false);
    expect(result.invalidEvents).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].phase).toBe('request');
  });

  it('should detect invalid response body', () => {
    const events: EvidenceEvent[] = [
      createValidEvent(
        'createOrder',
        { body: { customerId: 'cust-1', items: ['item-1'] } },
        { body: { wrongField: 'missing id and customerId' } } // Missing required fields
      ),
    ];

    const result = verifyEvidence(events, TEST_CONTRACT);

    expect(result.valid).toBe(false);
    expect(result.invalidEvents).toBe(1);
    expect(result.errors.some((e) => e.phase === 'response')).toBe(true);
  });

  it('should handle unknown operations', () => {
    const events: EvidenceEvent[] = [createValidEvent('unknownOperation', {}, {})];

    const result = verifyEvidence(events, TEST_CONTRACT);

    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Unknown operation');
  });

  it('should validate multiple events', () => {
    const events: EvidenceEvent[] = [
      createValidEvent(
        'createOrder',
        { body: { customerId: 'cust-1', items: ['item-1'] } },
        { body: { id: 'order-1', customerId: 'cust-1' } }
      ),
      createValidEvent(
        'createOrder',
        { body: { customerId: 'cust-2', items: [] } },
        { body: { id: 'order-2', customerId: 'cust-2' } }
      ),
    ];

    const result = verifyEvidence(events, TEST_CONTRACT);

    expect(result.valid).toBe(true);
    expect(result.totalEvents).toBe(2);
    expect(result.validEvents).toBe(2);
  });

  it('should provide operation summaries', () => {
    const events: EvidenceEvent[] = [
      createValidEvent(
        'createOrder',
        { body: { customerId: 'cust-1', items: ['item-1'] } },
        { body: { id: 'order-1', customerId: 'cust-1' } }
      ),
      {
        evidenceVersion: '0.1',
        operationId: 'listOrders',
        protocol: 'http',
        timestamp: '2025-12-17T10:00:00.000Z',
        request: { method: 'GET', path: '/orders' },
        response: {
          status: 200,
          body: [{ id: 'order-1', customerId: 'cust-1' }],
        },
      },
    ];

    const result = verifyEvidence(events, TEST_CONTRACT);

    expect(result.operationSummaries).toHaveLength(2);
    expect(result.operationSummaries.find((s) => s.operationId === 'createOrder')).toBeDefined();
    expect(result.operationSummaries.find((s) => s.operationId === 'listOrders')).toBeDefined();
  });

  it('should skip validation when no schema defined', () => {
    const contractWithNoSchema: ContractIR = {
      irVersion: '0.1',
      service: { name: 'test', version: '1.0.0' },
      schemas: {},
      operations: [
        {
          operationId: 'noSchemaOp',
          method: 'GET',
          path: '/test',
          responses: [{ statusCode: 200 }], // No schema
        },
      ],
    };

    const events: EvidenceEvent[] = [
      {
        evidenceVersion: '0.1',
        operationId: 'noSchemaOp',
        protocol: 'http',
        timestamp: '2025-12-17T10:00:00.000Z',
        request: { method: 'GET', path: '/test' },
        response: { status: 200, body: { anything: 'goes' } },
      },
    ];

    const result = verifyEvidence(events, contractWithNoSchema);

    expect(result.valid).toBe(true);
  });
});
