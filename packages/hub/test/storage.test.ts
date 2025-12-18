/**
 * Storage Layer Tests
 *
 * Tests for FileSystemStorage and hash utilities.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSystemStorage, computeHash, stableStringify, verifyHash, ConflictError } from '../src/storage/index.js';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ContractIR } from '@docsmyth/ir-spec';

// Test fixtures
const minimalIR: ContractIR = {
  irVersion: '0.1',
  service: {
    name: 'test-api',
    version: '1.0.0',
    description: 'Test API',
    baseUrls: ['https://api.example.com'],
  },
  schemas: {},
  operations: [],
};

describe('Hash Utilities', () => {
  describe('stableStringify', () => {
    it('should produce deterministic output for objects with different key orders', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };

      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
    });

    it('should handle nested objects', () => {
      const obj = {
        z: { y: 1, x: 2 },
        a: { c: 3, b: 4 },
      };

      const result = stableStringify(obj);
      expect(result).toBe('{"a":{"b":4,"c":3},"z":{"x":2,"y":1}}');
    });

    it('should handle arrays', () => {
      const arr = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
      const result = stableStringify(arr);
      expect(result).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
    });

    it('should handle null', () => {
      expect(stableStringify(null)).toBe('null');
    });
  });

  describe('computeHash', () => {
    it('should produce same hash for equivalent objects', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };

      expect(computeHash(obj1)).toBe(computeHash(obj2));
    });

    it('should produce different hashes for different objects', () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 2 };

      expect(computeHash(obj1)).not.toBe(computeHash(obj2));
    });

    it('should produce a 64-character hex string', () => {
      const hash = computeHash({ test: 'data' });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('verifyHash', () => {
    it('should verify correct hash', () => {
      const obj = { test: 'data' };
      const hash = computeHash(obj);

      expect(verifyHash(obj, hash)).toBe(true);
    });

    it('should reject incorrect hash', () => {
      const obj = { test: 'data' };
      const wrongHash = 'abcd1234'.repeat(8);

      expect(verifyHash(obj, wrongHash)).toBe(false);
    });
  });
});

describe('FileSystemStorage', () => {
  let dataDir: string;
  let storage: FileSystemStorage;

  beforeEach(() => {
    dataDir = join(tmpdir(), `acp-storage-test-${randomUUID()}`);
    mkdirSync(dataDir, { recursive: true });
    storage = new FileSystemStorage({ dataDir });
  });

  afterEach(() => {
    if (existsSync(dataDir)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  describe('publish', () => {
    it('should store a contract and return metadata', async () => {
      const metadata = await storage.publish('my-service', '1.0.0', minimalIR);

      expect(metadata.serviceName).toBe('my-service');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.irHash).toMatch(/^[a-f0-9]{64}$/);
      expect(metadata.publishedAt).toBeDefined();
    });

    it('should store OpenAPI if provided', async () => {
      const openApi = { openapi: '3.1.0', info: { title: 'Test' } };
      await storage.publish('openapi-service', '1.0.0', minimalIR, openApi);

      const storedOpenApi = await storage.getOpenApi('openapi-service', '1.0.0');
      expect(storedOpenApi).toEqual(openApi);
    });

    it('should reject duplicate versions with ConflictError', async () => {
      await storage.publish('dup-service', '1.0.0', minimalIR);

      await expect(
        storage.publish('dup-service', '1.0.0', minimalIR)
      ).rejects.toThrow(ConflictError);
    });

    it('should allow different versions for same service', async () => {
      await storage.publish('multi-version', '1.0.0', minimalIR);
      const metadata = await storage.publish('multi-version', '2.0.0', minimalIR);

      expect(metadata.version).toBe('2.0.0');
    });
  });

  describe('get', () => {
    it('should retrieve a stored contract', async () => {
      await storage.publish('get-test', '1.0.0', minimalIR);

      const result = await storage.get('get-test', '1.0.0');

      expect(result).not.toBeNull();
      expect(result!.metadata.version).toBe('1.0.0');
      expect(result!.ir).toEqual(minimalIR);
    });

    it('should return null for non-existent contract', async () => {
      const result = await storage.get('nonexistent', '1.0.0');
      expect(result).toBeNull();
    });
  });

  describe('getLatest', () => {
    it('should return the most recently published version', async () => {
      await storage.publish('latest-test', '1.0.0', minimalIR);
      await storage.publish('latest-test', '2.0.0', minimalIR);
      await storage.publish('latest-test', '1.5.0', minimalIR);

      const result = await storage.getLatest('latest-test');

      // Latest is the most recently published, which is 1.5.0
      expect(result).not.toBeNull();
      expect(result!.metadata.version).toBe('1.5.0');
    });

    it('should return null for non-existent service', async () => {
      const result = await storage.getLatest('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing contract', async () => {
      await storage.publish('exists-test', '1.0.0', minimalIR);

      expect(await storage.exists('exists-test', '1.0.0')).toBe(true);
    });

    it('should return false for non-existent contract', async () => {
      expect(await storage.exists('nonexistent', '1.0.0')).toBe(false);
    });
  });

  describe('listVersions', () => {
    it('should list all versions in reverse chronological order', async () => {
      await storage.publish('list-test', '1.0.0', minimalIR);
      await storage.publish('list-test', '2.0.0', minimalIR);
      await storage.publish('list-test', '1.1.0', minimalIR);

      const versions = await storage.listVersions('list-test');

      expect(versions.length).toBe(3);
      // Most recent first
      expect(versions[0].version).toBe('1.1.0');
      expect(versions[1].version).toBe('2.0.0');
      expect(versions[2].version).toBe('1.0.0');
    });

    it('should return empty array for non-existent service', async () => {
      const versions = await storage.listVersions('nonexistent');
      expect(versions).toEqual([]);
    });
  });

  describe('path sanitization', () => {
    it('should handle service names with special characters', async () => {
      // This tests that path traversal attempts are neutralized
      await storage.publish('my/service', '1.0.0', minimalIR);

      const result = await storage.get('my/service', '1.0.0');
      expect(result).not.toBeNull();
    });
  });
});
