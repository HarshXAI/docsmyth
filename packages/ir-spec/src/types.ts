/**
 * Contract IR v0.1 Type Definitions
 *
 * This module defines the core types for the Contract Intermediate Representation.
 * The IR serves as a canonical, language-agnostic representation of API contracts
 * that can be compiled to various output formats (OpenAPI, AsyncAPI, etc.)
 */

/** Supported IR versions */
export type IRVersion = '0.1';

/**
 * Schema reference string in format "schema:$id"
 * Example: "schema:CreateOrderRequest"
 */
export type SchemaRef = `schema:${string}`;

/**
 * Any reference string (currently only schema refs, extensible for future)
 */
export type Ref = SchemaRef;

/**
 * JSON Schema-like object for defining data shapes
 * Supports oneOf/anyOf/allOf, nullable, and discriminated unions
 */
export interface JsonSchemaObject {
  $id?: string;
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JsonSchemaObject | { $ref: Ref }>;
  items?: JsonSchemaObject | { $ref: Ref };
  required?: string[];
  description?: string;
  format?: string;
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchemaObject;
  /** Schema must match exactly one of these schemas */
  oneOf?: Array<JsonSchemaObject | { $ref: Ref }>;
  /** Schema must match at least one of these schemas */
  anyOf?: Array<JsonSchemaObject | { $ref: Ref }>;
  /** Schema must match all of these schemas (composition) */
  allOf?: Array<JsonSchemaObject | { $ref: Ref }>;
  /** Whether the value can be null (OpenAPI 3.1 uses type array instead) */
  nullable?: boolean;
  /** Discriminator for oneOf unions */
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  [key: string]: unknown;
}

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * HTTP status codes (common ones for type safety)
 */
export type HttpStatusCode =
  | 200
  | 201
  | 204
  | 400
  | 401
  | 403
  | 404
  | 409
  | 422
  | 500
  | 502
  | 503
  | number;

/**
 * HTTP Response definition
 */
export interface HttpResponse {
  statusCode: HttpStatusCode;
  description?: string;
  contentType?: string;
  schema?: { $ref: Ref } | JsonSchemaObject;
}

/**
 * Parameter location in HTTP request
 */
export type ParameterLocation = 'path' | 'query' | 'header' | 'cookie';

/**
 * HTTP Parameter definition
 */
export interface HttpParameter {
  name: string;
  in: ParameterLocation;
  required?: boolean;
  description?: string;
  schema?: JsonSchemaObject;
}

/**
 * Request body definition
 */
export interface HttpRequestBody {
  description?: string;
  required?: boolean;
  contentType?: string;
  schema?: { $ref: Ref } | JsonSchemaObject;
}

/**
 * HTTP Operation definition
 */
export interface HttpOperation {
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
 * Security requirement (simplified for v0.1)
 */
export interface SecurityRequirement {
  scheme: string;
  scopes?: string[];
}

/**
 * Security scheme definition
 */
export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  description?: string;
}

/**
 * Service metadata
 */
export interface ServiceInfo {
  name: string;
  version: string;
  description?: string;
  baseUrls?: string[];
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

/**
 * The root Contract IR document
 */
export interface ContractIR {
  /** IR format version */
  irVersion: IRVersion;

  /** Service metadata */
  service: ServiceInfo;

  /** Named schemas (reusable data types) */
  schemas: Record<string, JsonSchemaObject>;

  /** HTTP operations */
  operations: HttpOperation[];

  /** Security schemes */
  securitySchemes?: Record<string, SecurityScheme>;

  /** Default security requirements */
  security?: SecurityRequirement[];

  /** Extension data (for custom metadata) */
  extensions?: Record<string, unknown>;
}
