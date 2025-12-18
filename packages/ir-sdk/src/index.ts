/**
 * @docsmyth/ir-sdk
 *
 * SDK for building Contract IR documents programmatically.
 * Provides type-safe builder functions for creating IR structures.
 */

import type {
  ContractIR,
  HttpMethod,
  HttpOperation,
  HttpParameter,
  HttpRequestBody,
  HttpResponse,
  HttpStatusCode,
  JsonSchemaObject,
  ParameterLocation,
  SchemaRef,
  SecurityRequirement,
  SecurityScheme,
  ServiceInfo,
} from '@docsmyth/ir-spec';

/**
 * Creates a schema reference string
 *
 * @param id - The schema identifier
 * @returns A schema reference in format "schema:$id"
 *
 * @example
 * ```ts
 * ref('CreateOrderRequest') // => "schema:CreateOrderRequest"
 * ```
 */
export function ref(id: string): SchemaRef {
  return `schema:${id}`;
}

/**
 * Options for creating a service
 */
export interface MakeServiceOptions {
  name: string;
  version: string;
  description?: string;
  baseUrls?: string[];
  contact?: ServiceInfo['contact'];
  license?: ServiceInfo['license'];
}

/**
 * Creates a ServiceInfo object
 *
 * @param options - Service configuration options
 * @returns A typed ServiceInfo object
 *
 * @example
 * ```ts
 * const service = makeService({
 *   name: 'orders-api',
 *   version: '1.0.0',
 *   baseUrls: ['https://api.example.com'],
 * });
 * ```
 */
export function makeService(options: MakeServiceOptions): ServiceInfo {
  return {
    name: options.name,
    version: options.version,
    ...(options.description && { description: options.description }),
    ...(options.baseUrls && { baseUrls: options.baseUrls }),
    ...(options.contact && { contact: options.contact }),
    ...(options.license && { license: options.license }),
  };
}

/**
 * Options for creating an HTTP operation
 */
export interface MakeHttpOperationOptions {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: HttpParameter[];
  requestBody?: HttpRequestBody;
  responses: HttpResponse[];
  deprecated?: boolean;
  security?: SecurityRequirement[];
}

/**
 * Creates an HttpOperation object
 *
 * @param options - Operation configuration options
 * @returns A typed HttpOperation object
 *
 * @example
 * ```ts
 * const operation = makeHttpOperation({
 *   operationId: 'createOrder',
 *   method: 'POST',
 *   path: '/orders',
 *   responses: [
 *     { statusCode: 201, schema: { $ref: ref('CreateOrderResponse') } },
 *   ],
 * });
 * ```
 */
export function makeHttpOperation(options: MakeHttpOperationOptions): HttpOperation {
  return {
    operationId: options.operationId,
    method: options.method,
    path: options.path,
    ...(options.summary && { summary: options.summary }),
    ...(options.description && { description: options.description }),
    ...(options.tags && { tags: options.tags }),
    ...(options.parameters && { parameters: options.parameters }),
    ...(options.requestBody && { requestBody: options.requestBody }),
    responses: options.responses,
    ...(options.deprecated !== undefined && { deprecated: options.deprecated }),
    ...(options.security && { security: options.security }),
  };
}

/**
 * Creates an HTTP response object
 */
export function makeResponse(
  statusCode: HttpStatusCode,
  options?: {
    description?: string;
    contentType?: string;
    schema?: { $ref: SchemaRef } | JsonSchemaObject;
  }
): HttpResponse {
  return {
    statusCode,
    ...(options?.description && { description: options.description }),
    ...(options?.contentType && { contentType: options.contentType }),
    ...(options?.schema && { schema: options.schema }),
  };
}

/**
 * Creates an HTTP parameter object
 */
export function makeParameter(
  name: string,
  location: ParameterLocation,
  options?: {
    required?: boolean;
    description?: string;
    schema?: JsonSchemaObject;
  }
): HttpParameter {
  return {
    name,
    in: location,
    ...(options?.required !== undefined && { required: options.required }),
    ...(options?.description && { description: options.description }),
    ...(options?.schema && { schema: options.schema }),
  };
}

/**
 * Creates an HTTP request body object
 */
export function makeRequestBody(options: {
  schema: { $ref: SchemaRef } | JsonSchemaObject;
  description?: string;
  required?: boolean;
  contentType?: string;
}): HttpRequestBody {
  return {
    schema: options.schema,
    ...(options.description && { description: options.description }),
    ...(options.required !== undefined && { required: options.required }),
    ...(options.contentType && { contentType: options.contentType }),
  };
}

/**
 * Creates a security scheme object
 */
export function makeSecurityScheme(
  type: SecurityScheme['type'],
  options?: Omit<SecurityScheme, 'type'>
): SecurityScheme {
  return {
    type,
    ...options,
  };
}

/**
 * Options for creating a complete Contract IR document
 */
export interface MakeContractIROptions {
  service: ServiceInfo;
  schemas?: Record<string, JsonSchemaObject>;
  operations?: HttpOperation[];
  securitySchemes?: Record<string, SecurityScheme>;
  security?: SecurityRequirement[];
  extensions?: Record<string, unknown>;
}

/**
 * Creates a complete Contract IR document
 *
 * @param options - IR document configuration
 * @returns A typed ContractIR object with version 0.1
 *
 * @example
 * ```ts
 * const ir = makeContractIR({
 *   service: makeService({ name: 'my-api', version: '1.0.0' }),
 *   schemas: { ... },
 *   operations: [ ... ],
 * });
 * ```
 */
export function makeContractIR(options: MakeContractIROptions): ContractIR {
  return {
    irVersion: '0.1',
    service: options.service,
    schemas: options.schemas ?? {},
    operations: options.operations ?? [],
    ...(options.securitySchemes && { securitySchemes: options.securitySchemes }),
    ...(options.security && { security: options.security }),
    ...(options.extensions && { extensions: options.extensions }),
  };
}

// Re-export types for convenience
export type {
  ContractIR,
  HttpMethod,
  HttpOperation,
  HttpParameter,
  HttpRequestBody,
  HttpResponse,
  HttpStatusCode,
  JsonSchemaObject,
  ParameterLocation,
  SchemaRef,
  SecurityRequirement,
  SecurityScheme,
  ServiceInfo,
  // Overlay types
  Overlay,
  OverlayVersion,
  HideOperation,
  HideByOperationId,
  HideByMethodPath,
  ServerOverride,
  SchemaRedaction,
  ResponseRedaction,
  RequestRedaction,
  OverlaySummary,
} from '@docsmyth/ir-spec';

// Re-export overlay validation
export { validateOverlay, isOverlay, formatOverlayErrors } from '@docsmyth/ir-spec';
export type { OverlayValidationError, OverlayValidationResult } from '@docsmyth/ir-spec';

// Overlay applier
export { applyOverlay, getOverlaySummary } from './overlay-applier.js';
export type { ApplyOverlayResult, ApplyOverlayOptions } from './overlay-applier.js';
