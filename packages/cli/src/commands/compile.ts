/**
 * Compile command - compiles Contract IR to OpenAPI
 *
 * Supports optional evidence injection for verified examples.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { validate, type ContractIR } from '@acp/ir-spec';
import { compileOpenApi, type ExamplesMap, type ExampleObject } from '@acp/compiler-openapi';
import type { EvidenceEvent } from '@acp/evidence-sdk';
import { verifyEvidence } from './evidence-verify.js';
import {
  parseNdjsonEvidence,
  summarizeCoverage,
  formatCoverage,
  type CoverageSummary,
} from '../utils/evidence.js';

export interface CompileOptions {
  out: string;
  format?: 'json' | 'yaml';
  pretty?: boolean;
  evidence?: string;
  verifyEvidence?: boolean;
  maxExamples?: number;
  coverage?: boolean;
  coverageJson?: string;
}

/**
 * Request examples map structure
 * { [operationId]: [request body examples] }
 */
type RequestExamplesMap = Record<string, ExampleObject[]>;

/**
 * Build examples maps from evidence events
 *
 * @param events - Evidence events (already verified/filtered as valid)
 * @param maxExamples - Maximum examples per operation/status
 * @returns Object with response examples map and request examples map
 */
function buildExamplesFromEvidence(
  events: EvidenceEvent[],
  maxExamples: number
): { responseExamples: ExamplesMap; requestExamples: RequestExamplesMap } {
  const responseExamples: ExamplesMap = {};
  const requestExamples: RequestExamplesMap = {};

  // Track seen bodies for deduplication using stable JSON stringify
  const seenResponses: Record<string, Record<string, Set<string>>> = {};
  const seenRequests: Record<string, Set<string>> = {};

  for (const event of events) {
    const { operationId } = event;
    const statusCode = String(event.response.status);

    // Initialize tracking structures
    if (!responseExamples[operationId]) {
      responseExamples[operationId] = {};
    }
    if (!responseExamples[operationId][statusCode]) {
      responseExamples[operationId][statusCode] = [];
    }
    if (!seenResponses[operationId]) {
      seenResponses[operationId] = {};
    }
    if (!seenResponses[operationId][statusCode]) {
      seenResponses[operationId][statusCode] = new Set();
    }
    if (!requestExamples[operationId]) {
      requestExamples[operationId] = [];
    }
    if (!seenRequests[operationId]) {
      seenRequests[operationId] = new Set();
    }

    // Add response example if we haven't hit the max and it's not a duplicate
    const responseExamplesForStatus = responseExamples[operationId][statusCode];
    if (event.response.body !== undefined && responseExamplesForStatus.length < maxExamples) {
      const bodyKey = stableStringify(event.response.body);
      if (!seenResponses[operationId][statusCode].has(bodyKey)) {
        seenResponses[operationId][statusCode].add(bodyKey);
        responseExamplesForStatus.push({
          value: event.response.body,
        });
      }
    }

    // Add request example if present and not a duplicate
    if (event.request.body !== undefined && requestExamples[operationId].length < maxExamples) {
      const bodyKey = stableStringify(event.request.body);
      if (!seenRequests[operationId].has(bodyKey)) {
        seenRequests[operationId].add(bodyKey);
        requestExamples[operationId].push({
          value: event.request.body,
        });
      }
    }
  }

  return { responseExamples, requestExamples };
}

/**
 * Stable JSON stringify for deduplication
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }

  const keys = Object.keys(value as object).sort();
  const pairs = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Compile command handler
 */
export function compileCommand(path: string, options: CompileOptions): void {
  const filePath = resolve(path);
  const outDir = resolve(options.out);
  const maxExamples = options.maxExamples ?? 3;

  // Check input file exists
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Read and parse file
  let ir: ContractIR;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    ir = JSON.parse(raw) as ContractIR;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: Failed to parse JSON: ${message}`);
    process.exit(1);
  }

  // Validate IR first
  const validationResult = validate(ir);
  if (!validationResult.valid) {
    console.error('Error: Contract IR validation failed:');
    for (const error of validationResult.errors) {
      console.error(`  • ${error.path}: ${error.message}`);
    }
    process.exit(1);
  }

  // Handle evidence if provided
  let examples: ExamplesMap | undefined;
  let requestExamples: RequestExamplesMap | undefined;
  let coverageSummary: CoverageSummary | undefined;

  if (options.evidence) {
    const evidencePath = resolve(options.evidence);

    if (!existsSync(evidencePath)) {
      console.error(`Error: Evidence file not found: ${evidencePath}`);
      process.exit(1);
    }

    // Load evidence
    let events: EvidenceEvent[];
    try {
      events = parseNdjsonEvidence(evidencePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error: Failed to load evidence: ${message}`);
      process.exit(1);
    }

    if (events.length === 0) {
      console.warn('Warning: Evidence file is empty');
    } else {
      // Verify evidence against contract
      const verificationResult = verifyEvidence(events, ir);

      if (!verificationResult.valid) {
        if (options.verifyEvidence) {
          // Fail compilation - but show coverage summary first for debugging
          console.error('Error: Evidence verification failed');
          console.error(
            `  ${verificationResult.invalidEvents} of ${verificationResult.totalEvents} events invalid`
          );
          console.error('');
          console.error('Errors:');
          for (const err of verificationResult.errors) {
            const statusInfo = err.statusCode ? ` (status ${err.statusCode})` : '';
            console.error(
              `  • [${err.phase}${statusInfo}] ${err.operationId} event #${err.eventIndex + 1}: ${err.message}`
            );
          }

          // Show coverage summary even on failure for CI debugging
          if (options.coverage) {
            const failureCoverage = summarizeCoverage(
              events,
              ir,
              verificationResult.validEvents,
              verificationResult.invalidEvents
            );
            console.error('');
            console.error(formatCoverage(failureCoverage));
          }

          process.exit(1);
        } else {
          // Warn but continue with valid events only
          console.warn(
            `Warning: ${verificationResult.invalidEvents} invalid evidence events (will use ${verificationResult.validEvents} valid events)`
          );
        }
      }

      // Filter to only valid events by marking invalid event indices
      const invalidIndices = new Set(verificationResult.errors.map((e) => e.eventIndex));
      const validEvents = events.filter((_, index) => !invalidIndices.has(index));

      // Build examples from valid events
      const examplesResult = buildExamplesFromEvidence(validEvents, maxExamples);
      examples = examplesResult.responseExamples;
      requestExamples = examplesResult.requestExamples;

      // Compute coverage
      coverageSummary = summarizeCoverage(
        events,
        ir,
        verificationResult.validEvents,
        verificationResult.invalidEvents
      );
    }
  }

  // Compile to OpenAPI
  let openapi;
  try {
    openapi = compileOpenApi(ir, { examples });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: Compilation failed: ${message}`);
    process.exit(1);
  }

  // Inject request body examples
  if (requestExamples && openapi.paths) {
    injectRequestExamples(openapi, requestExamples, ir);
  }

  // Ensure output directory exists
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // Determine output filename
  const inputName = basename(filePath, '.json');
  const format = options.format ?? 'json';
  const outputFile = join(outDir, `${inputName}.openapi.${format}`);

  // Write output
  try {
    if (format === 'yaml') {
      // TODO: Week 2 - Add YAML support
      console.error('Error: YAML output not yet implemented. Use --format json');
      process.exit(1);
    }

    const output =
      options.pretty !== false ? JSON.stringify(openapi, null, 2) : JSON.stringify(openapi);

    writeFileSync(outputFile, output, 'utf-8');
    console.log(`✓ Compiled to: ${outputFile}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: Failed to write output: ${message}`);
    process.exit(1);
  }

  // Output coverage report if requested
  if (options.coverage && coverageSummary) {
    console.log('');
    console.log(formatCoverage(coverageSummary));
  }

  // Write coverage JSON if requested
  if (options.coverageJson && coverageSummary) {
    const coverageJsonPath = resolve(options.coverageJson);
    const coverageDir = join(coverageJsonPath, '..');
    if (!existsSync(coverageDir)) {
      mkdirSync(coverageDir, { recursive: true });
    }
    try {
      writeFileSync(coverageJsonPath, JSON.stringify(coverageSummary, null, 2), 'utf-8');
      console.log(`✓ Coverage JSON written to: ${coverageJsonPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Warning: Failed to write coverage JSON: ${message}`);
    }
  }
}

/**
 * Inject request body examples into OpenAPI document
 */
function injectRequestExamples(
  openapi: ReturnType<typeof compileOpenApi>,
  requestExamples: RequestExamplesMap,
  ir: ContractIR
): void {
  if (!openapi.paths) return;

  // Build operation to path/method map
  const opMap = new Map<string, { path: string; method: string }>();
  for (const op of ir.operations) {
    opMap.set(op.operationId, { path: op.path, method: op.method.toLowerCase() });
  }

  for (const [operationId, examples] of Object.entries(requestExamples)) {
    if (examples.length === 0) continue;

    const opInfo = opMap.get(operationId);
    if (!opInfo) continue;

    const pathItem = openapi.paths[opInfo.path];
    if (!pathItem) continue;

    const operation = pathItem[opInfo.method as keyof typeof pathItem] as
      | {
          requestBody?: {
            content?: Record<
              string,
              { schema?: unknown; examples?: Record<string, { value: unknown }> }
            >;
          };
        }
      | undefined;

    if (!operation?.requestBody?.content) continue;

    // Find the content type (usually application/json)
    for (const mediaType of Object.values(operation.requestBody.content)) {
      if (!mediaType.schema) continue; // Only add examples if schema exists

      const examplesObj: Record<string, { value: unknown }> = {};
      examples.forEach((example, index) => {
        examplesObj[`example-${index + 1}`] = { value: example.value };
      });
      mediaType.examples = examplesObj;
    }
  }
}
