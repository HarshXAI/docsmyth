import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validate, isContractIR } from '../src/index.js';
import type { ContractIR, ValidationResult } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../../fixtures/contract-ir/v0.1');

describe('@acp/ir-spec', () => {
  describe('validate()', () => {
    it('should return valid for a minimal valid IR document', () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: {
          name: 'test-service',
          version: '1.0.0',
        },
        schemas: {},
        operations: [],
      };

      const result = validate(ir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing required fields', () => {
      const result = validate({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      const errorCodes = result.errors.map((e) => e.code);
      expect(errorCodes).toContain('REQUIRED_FIELD');
    });

    it('should validate irVersion', () => {
      const result = validate({
        irVersion: '999.0',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNSUPPORTED_VERSION')).toBe(true);
    });

    it('should validate operation required fields', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [{}],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('operationId'))).toBe(true);
      expect(result.errors.some((e) => e.path.includes('method'))).toBe(true);
      expect(result.errors.some((e) => e.path.includes('path'))).toBe(true);
    });

    it('should return error for non-object input', () => {
      const result = validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_TYPE');

      const result2 = validate('not an object');
      expect(result2.valid).toBe(false);
    });

    it('should load and validate fixture: minimal-http.json', () => {
      const fixturePath = join(fixturesDir, 'minimal-http.json');
      const content = readFileSync(fixturePath, 'utf-8');
      const ir = JSON.parse(content);

      const result: ValidationResult = validate(ir);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify fixture structure
      expect(ir.irVersion).toBe('0.1');
      expect(ir.service.name).toBeDefined();
      expect(ir.operations.length).toBeGreaterThan(0);
    });
  });

  describe('isContractIR()', () => {
    it('should return true for valid IR', () => {
      const ir = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [],
      };

      expect(isContractIR(ir)).toBe(true);
    });

    it('should return false for invalid IR', () => {
      expect(isContractIR({})).toBe(false);
      expect(isContractIR(null)).toBe(false);
      expect(isContractIR('string')).toBe(false);
    });
  });

  describe('validation hardening', () => {
    it('should enforce irVersion == "0.1"', () => {
      const result = validate({
        irVersion: '1.0',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNSUPPORTED_VERSION')).toBe(true);
      expect(result.errors[0].message).toContain('"0.1"');
    });

    it('should validate schemas are objects', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {
          ValidSchema: { type: 'object' },
          InvalidSchema: 'not an object',
        },
        operations: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'schemas.InvalidSchema')).toBe(true);
      expect(result.errors.some((e) => e.code === 'INVALID_SCHEMA')).toBe(true);
    });

    it('should validate HTTP operations require method and path', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'testOp',
            responses: [{ statusCode: 200 }],
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'operations[0].method')).toBe(true);
      expect(result.errors.some((e) => e.path === 'operations[0].path')).toBe(true);
    });

    it('should validate path starts with /', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'testOp',
            method: 'GET',
            path: 'invalid-path',
            responses: [{ statusCode: 200 }],
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_PATH')).toBe(true);
    });

    it('should validate HTTP method is valid', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'testOp',
            method: 'INVALID',
            path: '/test',
            responses: [{ statusCode: 200 }],
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_METHOD')).toBe(true);
    });

    it('should detect duplicate operationIds', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'duplicateId',
            method: 'GET',
            path: '/test1',
            responses: [{ statusCode: 200 }],
          },
          {
            operationId: 'duplicateId',
            method: 'POST',
            path: '/test2',
            responses: [{ statusCode: 201 }],
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_OPERATION_ID')).toBe(true);
    });

    it('should validate response statusCode', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'testOp',
            method: 'GET',
            path: '/test',
            responses: [{ description: 'missing statusCode' }],
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('statusCode'))).toBe(true);
    });

    it('should validate securitySchemes types', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [],
        securitySchemes: {
          invalid: { type: 'notValid' },
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_SECURITY_TYPE')).toBe(true);
    });

    it('should return meaningful error paths', () => {
      const result = validate({
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'op1',
            method: 'GET',
            path: '/test',
            responses: [{ statusCode: 200 }],
            parameters: [{ invalid: true }],
          },
        ],
      });

      expect(result.valid).toBe(false);
      // Check paths are meaningful
      const pathErrors = result.errors.filter((e) => e.path.includes('parameters'));
      expect(pathErrors.length).toBeGreaterThan(0);
      expect(pathErrors[0].path).toBe('operations[0].parameters[0].name');
    });
  });
});
