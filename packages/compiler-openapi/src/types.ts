/**
 * OpenAPI 3.1 Types
 *
 * Simplified type definitions for OpenAPI 3.1 output.
 * These are partial types focused on what we generate.
 */

/**
 * OpenAPI 3.1 Info Object
 */
export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
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
 * OpenAPI 3.1 Server Object
 */
export interface OpenAPIServer {
  url: string;
  description?: string;
}

/**
 * OpenAPI 3.1 Schema Object (simplified)
 */
export interface OpenAPISchema {
  type?: string | string[];
  properties?: Record<string, OpenAPISchema | { $ref: string }>;
  items?: OpenAPISchema | { $ref: string };
  required?: string[];
  description?: string;
  format?: string;
  enum?: unknown[];
  additionalProperties?: boolean | OpenAPISchema;
  nullable?: boolean;
  oneOf?: Array<OpenAPISchema | { $ref: string }>;
  anyOf?: Array<OpenAPISchema | { $ref: string }>;
  allOf?: Array<OpenAPISchema | { $ref: string }>;
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  [key: string]: unknown;
}

/**
 * OpenAPI 3.1 Parameter Object
 */
export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: OpenAPISchema;
}

/**
 * OpenAPI 3.1 Request Body Object
 */
export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, OpenAPIMediaType>;
}

/**
 * OpenAPI 3.1 Media Type Object
 */
export interface OpenAPIMediaType {
  schema: OpenAPISchema | { $ref: string };
  examples?: Record<string, OpenAPIExample>;
}

/**
 * OpenAPI 3.1 Example Object
 */
export interface OpenAPIExample {
  summary?: string;
  description?: string;
  value: unknown;
}

/**
 * OpenAPI 3.1 Response Object
 */
export interface OpenAPIResponse {
  description: string;
  content?: Record<string, OpenAPIMediaType>;
}

/**
 * OpenAPI 3.1 Operation Object
 */
export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
}

/**
 * OpenAPI 3.1 Path Item Object
 */
export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  head?: OpenAPIOperation;
  options?: OpenAPIOperation;
}

/**
 * OpenAPI 3.1 Security Scheme Object
 */
export interface OpenAPISecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  description?: string;
}

/**
 * OpenAPI 3.1 Components Object
 */
export interface OpenAPIComponents {
  schemas?: Record<string, OpenAPISchema>;
  securitySchemes?: Record<string, OpenAPISecurityScheme>;
}

/**
 * OpenAPI 3.1 Document
 */
export interface OpenAPIDocument {
  openapi: '3.1.0';
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: Record<string, OpenAPIPathItem>;
  components?: OpenAPIComponents;
  security?: Array<Record<string, string[]>>;
}
