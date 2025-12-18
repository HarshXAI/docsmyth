/**
 * Evidence verification command
 *
 * Reads NDJSON evidence events and validates them against Contract IR schemas.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { ContractIR, HttpOperation, JsonSchemaObject } from '@acp/ir-spec';
import type {
  EvidenceEvent,
  VerificationResult,
  OperationVerificationSummary,
  VerificationError,
} from '@acp/evidence-sdk';

// Handle ESM default export differences
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = (AjvModule as any).default ?? AjvModule;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = (addFormatsModule as any).default ?? addFormatsModule;

export interface EvidenceVerifyOptions {
  contract: string;
  verbose?: boolean;
}

/**
 * Load and parse NDJSON evidence file
 */
function loadEvidence(path: string): EvidenceEvent[] {
  const content = readFileSync(path, 'utf-8');
  const lines = content
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as EvidenceEvent;
    } catch {
      throw new Error(`Failed to parse evidence at line ${index + 1}`);
    }
  });
}

/**
 * Load Contract IR from file
 */
function loadContract(path: string): ContractIR {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as ContractIR;
}

/**
 * Build a lookup map of operations by ID
 */
function buildOperationMap(contract: ContractIR): Map<string, HttpOperation> {
  const map = new Map<string, HttpOperation>();
  for (const op of contract.operations) {
    map.set(op.operationId, op);
  }
  return map;
}

/**
 * Resolve schema references in the contract
 */
function resolveSchema(
  schemaOrRef: { $ref: string } | JsonSchemaObject | undefined,
  schemas: Record<string, JsonSchemaObject>
): JsonSchemaObject | undefined {
  if (!schemaOrRef) return undefined;

  if ('$ref' in schemaOrRef && typeof schemaOrRef.$ref === 'string') {
    // Handle "schema:SchemaName" format
    const ref = schemaOrRef.$ref;
    if (ref.startsWith('schema:')) {
      const schemaId = ref.slice(7);
      return schemas[schemaId];
    }
    return undefined;
  }

  return schemaOrRef as JsonSchemaObject;
}

/**
 * Convert IR JsonSchemaObject to standard JSON Schema for Ajv
 * This removes IR-specific properties, resolves refs, and handles combiners
 * 
 * @param schema - The IR schema to convert
 * @param allSchemas - Map of all schemas for ref resolution
 * @param visited - Set of visited schema $ids to prevent infinite recursion
 * @param depth - Current recursion depth
 */
function toJsonSchema(
  schema: JsonSchemaObject,
  allSchemas: Record<string, JsonSchemaObject>,
  visited: Set<string> = new Set(),
  depth: number = 0
): object {
  // Prevent infinite recursion
  const MAX_DEPTH = 100;
  if (depth > MAX_DEPTH) {
    return { type: 'object', description: '[Max depth exceeded]' };
  }

  // Check for cycles using $id
  if (schema.$id && visited.has(schema.$id)) {
    return { type: 'object', description: '[Circular reference]' };
  }

  const newVisited = schema.$id ? new Set([...visited, schema.$id]) : visited;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === '$id') continue; // Skip IR-specific $id
    if (key === 'discriminator') continue; // Skip discriminator (Ajv doesn't need it)

    if (key === 'properties' && typeof value === 'object' && value !== null) {
      const props: Record<string, unknown> = {};
      for (const [propName, propValue] of Object.entries(value)) {
        if (typeof propValue === 'object' && propValue !== null) {
          if ('$ref' in propValue && typeof propValue.$ref === 'string') {
            const resolved = resolveSchema(propValue as { $ref: string }, allSchemas);
            if (resolved) {
              props[propName] = toJsonSchema(resolved, allSchemas, newVisited, depth + 1);
            }
          } else {
            props[propName] = toJsonSchema(propValue as JsonSchemaObject, allSchemas, newVisited, depth + 1);
          }
        } else {
          props[propName] = propValue;
        }
      }
      result.properties = props;
    } else if (key === 'items' && typeof value === 'object' && value !== null) {
      if ('$ref' in value && typeof value.$ref === 'string') {
        const resolved = resolveSchema(value as { $ref: string }, allSchemas);
        if (resolved) {
          result.items = toJsonSchema(resolved, allSchemas, newVisited, depth + 1);
        }
      } else {
        result.items = toJsonSchema(value as JsonSchemaObject, allSchemas, newVisited, depth + 1);
      }
    } else if (key === 'additionalProperties' && typeof value === 'object' && value !== null) {
      if ('$ref' in value && typeof value.$ref === 'string') {
        const resolved = resolveSchema(value as { $ref: string }, allSchemas);
        if (resolved) {
          result.additionalProperties = toJsonSchema(resolved, allSchemas, newVisited, depth + 1);
        }
      } else {
        result.additionalProperties = toJsonSchema(value as JsonSchemaObject, allSchemas, newVisited, depth + 1);
      }
    } else if ((key === 'oneOf' || key === 'anyOf' || key === 'allOf') && Array.isArray(value)) {
      // Handle oneOf/anyOf/allOf combiners
      result[key] = value.map((subSchema) => {
        if (typeof subSchema === 'object' && subSchema !== null) {
          if ('$ref' in subSchema && typeof subSchema.$ref === 'string') {
            const resolved = resolveSchema(subSchema as { $ref: string }, allSchemas);
            if (resolved) {
              return toJsonSchema(resolved, allSchemas, newVisited, depth + 1);
            }
            return {};
          } else {
            return toJsonSchema(subSchema as JsonSchemaObject, allSchemas, newVisited, depth + 1);
          }
        }
        return subSchema;
      });
    } else if (key === 'nullable' && value === true) {
      // Handle nullable by adding null to type array (JSON Schema draft 2020-12 style)
      // Ajv handles this differently, so we need to use oneOf with null
      // This will be handled after the loop
      result._nullable = true;
    } else {
      result[key] = value;
    }
  }

  // Handle nullable by wrapping in oneOf with null type
  if (result._nullable) {
    delete result._nullable;
    const baseType = { ...result };
    return {
      oneOf: [
        baseType,
        { type: 'null' }
      ]
    };
  }

  return result;
}

/**
 * Verify evidence events against Contract IR schemas
 */
export function verifyEvidence(events: EvidenceEvent[], contract: ContractIR): VerificationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new Ajv({ allErrors: true, strict: false }) as any;
  addFormats(ajv);

  const operationMap = buildOperationMap(contract);
  const errors: VerificationError[] = [];
  const operationStats = new Map<
    string,
    { valid: number; invalid: number; errors: VerificationError[] }
  >();

  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const event = events[eventIndex];
    const { operationId } = event;

    // Initialize stats for this operation
    if (!operationStats.has(operationId)) {
      operationStats.set(operationId, { valid: 0, invalid: 0, errors: [] });
    }
    const stats = operationStats.get(operationId)!;

    // Find the operation
    const operation = operationMap.get(operationId);
    if (!operation) {
      const error: VerificationError = {
        eventIndex,
        operationId,
        phase: 'request',
        schemaPath: '',
        message: `Unknown operation: ${operationId}`,
      };
      errors.push(error);
      stats.errors.push(error);
      stats.invalid++;
      continue;
    }

    let eventValid = true;

    // Validate request body if operation has requestBody schema
    if (operation.requestBody?.schema && event.request.body !== undefined) {
      const schema = resolveSchema(
        operation.requestBody.schema as { $ref: string } | JsonSchemaObject,
        contract.schemas
      );

      if (schema) {
        const jsonSchema = toJsonSchema(schema, contract.schemas);
        const validate = ajv.compile(jsonSchema);
        const valid = validate(event.request.body);

        if (!valid && validate.errors) {
          eventValid = false;
          for (const err of validate.errors) {
            const error: VerificationError = {
              eventIndex,
              operationId,
              phase: 'request',
              schemaPath: err.schemaPath || err.instancePath || '',
              message: err.message || 'Validation failed',
            };
            errors.push(error);
            stats.errors.push(error);
          }
        }
      }
    }

    // Validate response body if operation has response schema for this status
    const statusCode = event.response.status;
    const matchingResponse = operation.responses.find((r) => r.statusCode === statusCode);

    if (matchingResponse?.schema && event.response.body !== undefined) {
      const schema = resolveSchema(
        matchingResponse.schema as { $ref: string } | JsonSchemaObject,
        contract.schemas
      );

      if (schema) {
        const jsonSchema = toJsonSchema(schema, contract.schemas);
        const validate = ajv.compile(jsonSchema);
        const valid = validate(event.response.body);

        if (!valid && validate.errors) {
          eventValid = false;
          for (const err of validate.errors) {
            const error: VerificationError = {
              eventIndex,
              operationId,
              phase: 'response',
              statusCode,
              schemaPath: err.schemaPath || err.instancePath || '',
              message: err.message || 'Validation failed',
            };
            errors.push(error);
            stats.errors.push(error);
          }
        }
      }
    }

    if (eventValid) {
      stats.valid++;
    } else {
      stats.invalid++;
    }
  }

  // Build operation summaries
  const operationSummaries: OperationVerificationSummary[] = [];
  for (const [operationId, stats] of operationStats) {
    operationSummaries.push({
      operationId,
      totalEvents: stats.valid + stats.invalid,
      validEvents: stats.valid,
      invalidEvents: stats.invalid,
      errors: stats.errors,
    });
  }

  // Sort by operationId for deterministic output
  operationSummaries.sort((a, b) => a.operationId.localeCompare(b.operationId));

  const validEvents =
    events.length -
    errors.filter((e, i, arr) => arr.findIndex((x) => x.eventIndex === e.eventIndex) === i).length;

  return {
    valid: errors.length === 0,
    totalEvents: events.length,
    validEvents,
    invalidEvents: events.length - validEvents,
    operationSummaries,
    errors,
  };
}

/**
 * Format verification result for console output
 */
function formatResult(result: VerificationResult, verbose: boolean): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✓ All evidence is valid');
  } else {
    lines.push('✗ Evidence verification failed');
  }

  lines.push('');
  lines.push(`Total events: ${result.totalEvents}`);
  lines.push(`Valid: ${result.validEvents}`);
  lines.push(`Invalid: ${result.invalidEvents}`);

  if (result.operationSummaries.length > 0) {
    lines.push('');
    lines.push('Per-operation summary:');
    for (const summary of result.operationSummaries) {
      const status = summary.invalidEvents === 0 ? '✓' : '✗';
      lines.push(
        `  ${status} ${summary.operationId}: ${summary.validEvents}/${summary.totalEvents} valid`
      );
    }
  }

  if (!result.valid) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      const statusInfo = error.statusCode ? ` (status ${error.statusCode})` : '';
      lines.push(
        `  • [${error.phase}${statusInfo}] ${error.operationId} event #${error.eventIndex + 1}: ${error.message}`
      );
      if (verbose && error.schemaPath) {
        lines.push(`    Schema path: ${error.schemaPath}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Evidence verify command handler
 */
export function evidenceVerifyCommand(evidencePath: string, options: EvidenceVerifyOptions): void {
  const resolvedEvidencePath = resolve(evidencePath);
  const resolvedContractPath = resolve(options.contract);

  // Check files exist
  if (!existsSync(resolvedEvidencePath)) {
    console.error(`Error: Evidence file not found: ${resolvedEvidencePath}`);
    process.exit(1);
  }

  if (!existsSync(resolvedContractPath)) {
    console.error(`Error: Contract file not found: ${resolvedContractPath}`);
    process.exit(1);
  }

  // Load files
  let events: EvidenceEvent[];
  let contract: ContractIR;

  try {
    events = loadEvidence(resolvedEvidencePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: Failed to load evidence: ${message}`);
    process.exit(1);
  }

  try {
    contract = loadContract(resolvedContractPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: Failed to load contract: ${message}`);
    process.exit(1);
  }

  // Verify
  const result = verifyEvidence(events, contract);

  // Output
  console.log(formatResult(result, options.verbose ?? false));

  // Exit code
  process.exit(result.valid ? 0 : 1);
}
