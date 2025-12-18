/**
 * Tests for compile command with evidence support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { compileCommand } from '../src/commands/compile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '../../../fixtures');
const evidenceDir = join(fixturesDir, 'evidence');
const testOutputDir = join(__dirname, '../../../.test-output');

describe('compile command with evidence', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    // Clean up test output
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
    mkdirSync(testOutputDir, { recursive: true });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    processExitSpy.mockRestore();

    // Clean up test output
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true });
    }
  });

  it('should compile without evidence', () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
      })
    ).not.toThrow();

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Compiled to:'));
  });

  it('should inject examples when evidence is valid', () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');
    const evidencePath = join(evidenceDir, 'orders-evidence.ndjson');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
        evidence: evidencePath,
      })
    ).not.toThrow();

    // Check the output file has examples
    const outputPath = join(testOutputDir, 'orders-contract.openapi.json');
    expect(existsSync(outputPath)).toBe(true);

    const openapi = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Check response examples for listOrders
    const listOrdersResponse = openapi.paths['/orders'].get.responses['200'];
    expect(listOrdersResponse.content['application/json'].examples).toBeDefined();
    expect(listOrdersResponse.content['application/json'].examples['example-1']).toBeDefined();

    // Check request body examples for createOrder
    const createOrderReqBody = openapi.paths['/orders'].post.requestBody;
    expect(createOrderReqBody.content['application/json'].examples).toBeDefined();
    expect(createOrderReqBody.content['application/json'].examples['example-1']).toBeDefined();
  });

  it('should fail when --verify-evidence and evidence is invalid', () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');
    const invalidEvidencePath = join(evidenceDir, 'invalid-evidence.ndjson');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
        evidence: invalidEvidencePath,
        verifyEvidence: true,
      })
    ).toThrow('process.exit(1)');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Evidence verification failed')
    );
  });

  it('should warn but continue when evidence is invalid without --verify-evidence', () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');
    const invalidEvidencePath = join(evidenceDir, 'invalid-evidence.ndjson');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
        evidence: invalidEvidencePath,
        verifyEvidence: false,
      })
    ).not.toThrow();

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid evidence events'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Compiled to:'));
  });

  it('should print coverage report with --coverage', () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');
    const evidencePath = join(evidenceDir, 'orders-evidence.ndjson');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
        evidence: evidencePath,
        coverage: true,
      })
    ).not.toThrow();

    // Check coverage report was printed
    const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(logCalls).toContain('Evidence Coverage Report');
    expect(logCalls).toContain('Operations covered:');
    expect(logCalls).toContain('listOrders');
    expect(logCalls).toContain('createOrder');
    expect(logCalls).toContain('getOrder');
  });

  it('should write coverage JSON when --coverage-json provided', () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');
    const evidencePath = join(evidenceDir, 'orders-evidence.ndjson');
    const coverageJsonPath = join(testOutputDir, 'coverage.json');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
        evidence: evidencePath,
        coverageJson: coverageJsonPath,
      })
    ).not.toThrow();

    expect(existsSync(coverageJsonPath)).toBe(true);

    const coverage = JSON.parse(readFileSync(coverageJsonPath, 'utf-8'));
    expect(coverage.totalOps).toBe(3);
    expect(coverage.opsWithEvidence).toBe(3);
    expect(coverage.opsMissingEvidence).toBe(0);
    expect(coverage.totalEvents).toBe(5);
    expect(coverage.perOp.listOrders).toBeDefined();
    expect(coverage.perOp.createOrder).toBeDefined();
    expect(coverage.perOp.getOrder).toBeDefined();
  });

  it('should respect --max-examples flag', () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');
    const evidencePath = join(evidenceDir, 'orders-evidence.ndjson');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
        evidence: evidencePath,
        maxExamples: 1,
      })
    ).not.toThrow();

    const outputPath = join(testOutputDir, 'orders-contract.openapi.json');
    const openapi = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // createOrder has 2 events but maxExamples=1 so only 1 example
    const createOrderReqBody = openapi.paths['/orders'].post.requestBody;
    const examples = createOrderReqBody.content['application/json'].examples;
    expect(Object.keys(examples)).toHaveLength(1);
  });

  it('should deduplicate identical examples', async () => {
    const contractPath = join(evidenceDir, 'orders-contract.json');
    // Create a test evidence file with duplicates
    const duplicateEvidencePath = join(testOutputDir, 'duplicate-evidence.ndjson');
    const duplicateContent = [
      '{"evidenceVersion":"0.1","operationId":"listOrders","protocol":"http","timestamp":"2024-01-15T10:00:00.000Z","request":{"method":"GET","path":"/orders","headers":{}},"response":{"status":200,"headers":{},"body":[{"id":"1","customerId":"c1"}]}}',
      '{"evidenceVersion":"0.1","operationId":"listOrders","protocol":"http","timestamp":"2024-01-15T10:01:00.000Z","request":{"method":"GET","path":"/orders","headers":{}},"response":{"status":200,"headers":{},"body":[{"id":"1","customerId":"c1"}]}}',
    ].join('\n');

    const { writeFileSync: writeSync } = await import('node:fs');
    writeSync(duplicateEvidencePath, duplicateContent, 'utf-8');

    expect(() =>
      compileCommand(contractPath, {
        out: testOutputDir,
        evidence: duplicateEvidencePath,
        maxExamples: 10,
      })
    ).not.toThrow();

    const outputPath = join(testOutputDir, 'orders-contract.openapi.json');
    const openapi = JSON.parse(readFileSync(outputPath, 'utf-8'));

    // Should only have 1 example despite 2 events with same body
    const listOrdersResponse = openapi.paths['/orders'].get.responses['200'];
    const examples = listOrdersResponse.content['application/json'].examples;
    expect(Object.keys(examples)).toHaveLength(1);
  });
});
