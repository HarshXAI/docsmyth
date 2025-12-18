/**
 * @acp/compiler-openapi
 *
 * Compiles Contract IR to OpenAPI 3.1 specification.
 * Produces deterministic output with stable key ordering.
 * Preserves $ref references and handles recursive schemas safely.
 */

import type { ContractIR, HttpOperation, HttpResponse, JsonSchemaObject } from '@acp/ir-spec';
import { SchemaDepthError, DEFAULT_MAX_DEPTH } from '@acp/ir-spec';
import type {
  OpenAPIDocument,
  OpenAPIOperation,
  OpenAPIPathItem,
  OpenAPIResponse,
  OpenAPISchema,
  OpenAPIExample,
  OpenAPIMediaType,
} from './types.js';

export type { OpenAPIDocument } from './types.js';
export { SchemaCycleError, SchemaDepthError } from '@acp/ir-spec';

/**
 * Example object for a single response
 */
export interface ExampleObject {
  summary?: string;
  description?: string;
  value: unknown;
}

/**
 * Examples map structure
 * { [operationId]: { [statusCode]: [exampleObjects] } }
 */
export type ExamplesMap = Record<string, Record<string, ExampleObject[]>>;

/**
 * Compiler options
 */
export interface CompileOptions {
  /** Include x-* extensions in output */
  includeExtensions?: boolean;
  /** Default content type for request/response bodies */
  defaultContentType?: string;
  /** Optional verified examples to inject into OpenAPI output */
  examples?: ExamplesMap;
  /** Maximum schema traversal depth (default: 100) */
  maxDepth?: number;
  /** Throw on schema cycles (default: false - preserves $ref) */
  throwOnCycle?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<CompileOptions, 'examples'>> & { examples?: ExamplesMap } = {
  includeExtensions: false,
  defaultContentType: 'application/json',
  examples: undefined,
  maxDepth: DEFAULT_MAX_DEPTH,
  throwOnCycle: false,
};

/**
 * HTTP methods in stable order for deterministic output
 */
const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

/**
 * Converts a schema reference from IR format to OpenAPI format
 *
 * @param ref - IR reference like "schema:CreateOrderRequest"
 * @returns OpenAPI reference like "#/components/schemas/CreateOrderRequest"
 */
function convertSchemaRef(ref: string): string {
  if (ref.startsWith('schema:')) {
    const schemaId = ref.slice(7); // Remove "schema:" prefix
    return `#/components/schemas/${schemaId}`;
  }
  return ref;
}

/**
 * Converts an IR schema to OpenAPI schema
 * Preserves $ref references and handles oneOf/anyOf/allOf
 *
 * @param schema - IR schema or $ref object
 * @param visited - Set of visited schema objects for cycle detection
 * @param depth - Current traversal depth
 * @param maxDepth - Maximum allowed depth
 * @param operationId - Optional operation ID for error context
 */
function convertSchema(
  schema: JsonSchemaObject | { $ref: string },
  visited: WeakSet<object> = new WeakSet(),
  depth: number = 0,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  operationId?: string
): OpenAPISchema | { $ref: string } {
  // Handle $ref - preserve it, don't inline
  if ('$ref' in schema && typeof schema.$ref === 'string') {
    return { $ref: convertSchemaRef(schema.$ref) };
  }

  const irSchema = schema as JsonSchemaObject;

  // Check for object cycle (same object instance)
  if (visited.has(irSchema)) {
    // Return an empty schema to break the cycle safely
    return { type: 'object', description: '[Circular reference detected]' };
  }

  // Check max depth
  if (depth > maxDepth) {
    throw new SchemaDepthError(maxDepth, [`depth=${depth}`], operationId);
  }

  // Mark as visited
  visited.add(irSchema);

  const result: OpenAPISchema = {};

  // Handle type (including nullable via type array in 3.1)
  if (irSchema.type) {
    result.type = irSchema.type;
  }

  // Handle nullable (OpenAPI 3.1 uses type array)
  if (irSchema.nullable === true && irSchema.type && typeof irSchema.type === 'string') {
    result.type = [irSchema.type, 'null'];
  }

  if (irSchema.description) result.description = irSchema.description;
  if (irSchema.format) result.format = irSchema.format;
  if (irSchema.enum) result.enum = irSchema.enum;
  if (irSchema.required) result.required = irSchema.required;

  // Handle properties
  if (irSchema.properties) {
    result.properties = {};
    // Sort properties alphabetically for deterministic output
    const sortedKeys = Object.keys(irSchema.properties).sort();
    for (const key of sortedKeys) {
      result.properties[key] = convertSchema(
        irSchema.properties[key] as JsonSchemaObject | { $ref: string },
        visited,
        depth + 1,
        maxDepth,
        operationId
      );
    }
  }

  // Handle items
  if (irSchema.items) {
    result.items = convertSchema(
      irSchema.items as JsonSchemaObject | { $ref: string },
      visited,
      depth + 1,
      maxDepth,
      operationId
    );
  }

  // Handle additionalProperties
  if (irSchema.additionalProperties !== undefined) {
    if (typeof irSchema.additionalProperties === 'boolean') {
      result.additionalProperties = irSchema.additionalProperties;
    } else {
      result.additionalProperties = convertSchema(
        irSchema.additionalProperties,
        visited,
        depth + 1,
        maxDepth,
        operationId
      ) as OpenAPISchema;
    }
  }

  // Handle oneOf
  if (Array.isArray(irSchema.oneOf)) {
    result.oneOf = irSchema.oneOf.map((sub) =>
      convertSchema(
        sub as JsonSchemaObject | { $ref: string },
        visited,
        depth + 1,
        maxDepth,
        operationId
      )
    );
  }

  // Handle anyOf
  if (Array.isArray(irSchema.anyOf)) {
    result.anyOf = irSchema.anyOf.map((sub) =>
      convertSchema(
        sub as JsonSchemaObject | { $ref: string },
        visited,
        depth + 1,
        maxDepth,
        operationId
      )
    );
  }

  // Handle allOf
  if (Array.isArray(irSchema.allOf)) {
    result.allOf = irSchema.allOf.map((sub) =>
      convertSchema(
        sub as JsonSchemaObject | { $ref: string },
        visited,
        depth + 1,
        maxDepth,
        operationId
      )
    );
  }

  // Handle discriminator for discriminated unions
  if (irSchema.discriminator && typeof irSchema.discriminator === 'object') {
    const disc = irSchema.discriminator as { propertyName?: string; mapping?: Record<string, string> };
    if (disc.propertyName) {
      result.discriminator = {
        propertyName: disc.propertyName,
      };
      if (disc.mapping) {
        // Convert schema: refs to OpenAPI refs in mapping
        result.discriminator.mapping = {};
        for (const [key, value] of Object.entries(disc.mapping)) {
          result.discriminator.mapping[key] = convertSchemaRef(value);
        }
      }
    }
  }

  return result;
}

/**
 * Converts IR responses to OpenAPI responses
 * Responses are sorted by status code for deterministic output
 */
function convertResponses(
  responses: HttpResponse[],
  contentType: string,
  operationExamples?: Record<string, ExampleObject[]>,
  maxDepth: number = DEFAULT_MAX_DEPTH,
  operationId?: string
): Record<string, OpenAPIResponse> {
  const result: Record<string, OpenAPIResponse> = {};

  // Sort responses by status code for deterministic output
  const sortedResponses = [...responses].sort((a, b) => a.statusCode - b.statusCode);

  for (const response of sortedResponses) {
    const statusCode = String(response.statusCode);
    const oaResponse: OpenAPIResponse = {
      description: response.description || `Response for status ${statusCode}`,
    };

    if (response.schema) {
      const ct = response.contentType || contentType;
      const mediaType: OpenAPIMediaType = {
        schema: convertSchema(
          response.schema as JsonSchemaObject | { $ref: string },
          new WeakSet(),
          0,
          maxDepth,
          operationId
        ),
      };

      // Add examples if available for this status code
      const statusExamples = operationExamples?.[statusCode];
      if (statusExamples && statusExamples.length > 0) {
        const examples: Record<string, OpenAPIExample> = {};
        // Sort examples by index for deterministic output
        statusExamples.forEach((example, index) => {
          const key = `example-${index + 1}`;
          examples[key] = {
            ...(example.summary && { summary: example.summary }),
            ...(example.description && { description: example.description }),
            value: example.value,
          };
        });
        mediaType.examples = examples;
      }

      oaResponse.content = {
        [ct]: mediaType,
      };
    }

    result[statusCode] = oaResponse;
  }

  return result;
}

/**
 * Converts an IR HTTP operation to OpenAPI operation
 */
function convertOperation(
  op: HttpOperation,
  contentType: string,
  operationExamples?: Record<string, ExampleObject[]>,
  maxDepth: number = DEFAULT_MAX_DEPTH
): OpenAPIOperation {
  const result: OpenAPIOperation = {
    operationId: op.operationId,
    responses: convertResponses(op.responses, contentType, operationExamples, maxDepth, op.operationId),
  };

  if (op.summary) result.summary = op.summary;
  if (op.description) result.description = op.description;
  if (op.tags) result.tags = op.tags;
  if (op.deprecated) result.deprecated = op.deprecated;

  if (op.parameters && op.parameters.length > 0) {
    result.parameters = op.parameters.map((param) => ({
      name: param.name,
      in: param.in,
      required: param.required,
      description: param.description,
      schema: param.schema,
    }));
  }

  if (op.requestBody && op.requestBody.schema) {
    const ct = op.requestBody.contentType || contentType;
    result.requestBody = {
      required: op.requestBody.required,
      description: op.requestBody.description,
      content: {
        [ct]: {
          schema: convertSchema(
            op.requestBody.schema as JsonSchemaObject | { $ref: string },
            new WeakSet(),
            0,
            maxDepth,
            op.operationId
          ),
        },
      },
    };
  }

  if (op.security && op.security.length > 0) {
    result.security = op.security.map((sec) => ({
      [sec.scheme]: sec.scopes || [],
    }));
  }

  return result;
}

/**
 * Sorts path item methods in a stable order
 */
function sortPathItem(pathItem: OpenAPIPathItem): OpenAPIPathItem {
  const sorted: OpenAPIPathItem = {};
  for (const method of METHOD_ORDER) {
    if (pathItem[method]) {
      sorted[method] = pathItem[method];
    }
  }
  return sorted;
}

/**
 * Compiles a Contract IR document to OpenAPI 3.1
 *
 * @param ir - The Contract IR document to compile
 * @param options - Compiler options
 * @returns An OpenAPI 3.1 document with deterministic key ordering
 *
 * @example
 * ```ts
 * import { compileOpenApi } from '@acp/compiler-openapi';
 * import type { ContractIR } from '@acp/ir-spec';
 *
 * const ir: ContractIR = { ... };
 * const openapi = compileOpenApi(ir);
 *
 * console.log(JSON.stringify(openapi, null, 2));
 * ```
 */
export function compileOpenApi(ir: ContractIR, options?: CompileOptions): OpenAPIDocument {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Build paths from operations
  const unsortedPaths: Record<string, OpenAPIPathItem> = {};

  for (const op of ir.operations) {
    if (!unsortedPaths[op.path]) {
      unsortedPaths[op.path] = {};
    }

    const method = op.method.toLowerCase() as keyof OpenAPIPathItem;
    // Get examples for this operation if available
    const operationExamples = opts.examples?.[op.operationId];
    unsortedPaths[op.path][method] = convertOperation(
      op,
      opts.defaultContentType,
      operationExamples,
      opts.maxDepth
    );
  }

  // Sort paths lexicographically and methods in stable order
  const paths: Record<string, OpenAPIPathItem> = {};
  const sortedPathKeys = Object.keys(unsortedPaths).sort();
  for (const pathKey of sortedPathKeys) {
    paths[pathKey] = sortPathItem(unsortedPaths[pathKey]);
  }

  // Build components - sort schemas alphabetically
  const schemas: Record<string, OpenAPISchema> = {};
  const sortedSchemaKeys = Object.keys(ir.schemas).sort();
  for (const name of sortedSchemaKeys) {
    const schema = ir.schemas[name];
    // Remove $id from output schema as OpenAPI uses component path
    const { $id: _id, ...rest } = schema;
    schemas[name] = convertSchema(
      rest as JsonSchemaObject,
      new WeakSet(),
      0,
      opts.maxDepth
    ) as OpenAPISchema;
  }

  // Build the document
  const doc: OpenAPIDocument = {
    openapi: '3.1.0',
    info: {
      title: ir.service.name,
      version: ir.service.version,
      ...(ir.service.description && { description: ir.service.description }),
      ...(ir.service.contact && { contact: ir.service.contact }),
      ...(ir.service.license && { license: ir.service.license }),
    },
    paths,
  };

  // Add servers if baseUrls are provided
  if (ir.service.baseUrls && ir.service.baseUrls.length > 0) {
    doc.servers = ir.service.baseUrls.map((url) => ({ url }));
  }

  // Add components if we have schemas or security schemes
  if (Object.keys(schemas).length > 0 || ir.securitySchemes) {
    doc.components = {};
    if (Object.keys(schemas).length > 0) {
      doc.components.schemas = schemas;
    }
    if (ir.securitySchemes) {
      // Sort security schemes alphabetically
      const sortedSecuritySchemes: Record<string, (typeof ir.securitySchemes)[string]> = {};
      const sortedSecurityKeys = Object.keys(ir.securitySchemes).sort();
      for (const key of sortedSecurityKeys) {
        sortedSecuritySchemes[key] = ir.securitySchemes[key];
      }
      doc.components.securitySchemes = sortedSecuritySchemes;
    }
  }

  // Add global security
  if (ir.security && ir.security.length > 0) {
    doc.security = ir.security.map((sec) => ({
      [sec.scheme]: sec.scopes || [],
    }));
  }

  return doc;
}
