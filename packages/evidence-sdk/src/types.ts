/**
 * Evidence Model v0.1 Type Definitions
 *
 * This module defines the types for capturing evidence of API requests/responses
 * during development and testing. Evidence can be used to validate contracts
 * and inject verified examples into OpenAPI specs.
 */

/**
 * Evidence model version
 */
export type EvidenceVersion = '0.1';

/**
 * Supported protocols
 */
export type EvidenceProtocol = 'http';

/**
 * HTTP request evidence
 */
export interface EvidenceRequest {
  /** HTTP method */
  method: string;
  /** Request path (e.g., /users/123) */
  path: string;
  /** Query parameters (parsed) */
  query?: Record<string, unknown>;
  /** Path parameters (e.g., { id: "123" }) */
  params?: Record<string, string>;
  /** Request headers (should be sanitized) */
  headers?: Record<string, string>;
  /** Request body (JSON) */
  body?: unknown;
}

/**
 * HTTP response evidence
 */
export interface EvidenceResponse {
  /** HTTP status code */
  status: number;
  /** Response headers (should be sanitized) */
  headers?: Record<string, string>;
  /** Response body (JSON) */
  body?: unknown;
}

/**
 * A single evidence event capturing a request/response pair
 */
export interface EvidenceEvent {
  /** Evidence model version */
  evidenceVersion: EvidenceVersion;
  /** Operation ID from the Contract IR */
  operationId: string;
  /** Protocol (currently only http) */
  protocol: EvidenceProtocol;
  /** ISO timestamp when the event was captured */
  timestamp: string;
  /** Optional trace ID for distributed tracing */
  traceId?: string;
  /** Request evidence */
  request: EvidenceRequest;
  /** Response evidence */
  response: EvidenceResponse;
}

/**
 * A bundle of evidence events with metadata
 */
export interface EvidenceBundle {
  /** Evidence model version */
  evidenceVersion: EvidenceVersion;
  /** ISO timestamp when the bundle was created */
  createdAt: string;
  /** Service name from Contract IR */
  serviceName?: string;
  /** Service version from Contract IR */
  serviceVersion?: string;
  /** Contract IR version used for validation */
  contractIrVersion?: string;
  /** Individual evidence events */
  events: EvidenceEvent[];
}

/**
 * Summary of verification results per operation
 */
export interface OperationVerificationSummary {
  operationId: string;
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  errors: VerificationError[];
}

/**
 * A single verification error
 */
export interface VerificationError {
  /** Index of the event in the evidence file */
  eventIndex: number;
  /** The operation ID */
  operationId: string;
  /** Whether this was a request or response validation error */
  phase: 'request' | 'response';
  /** Status code (for response errors) */
  statusCode?: number;
  /** JSON Schema path where validation failed */
  schemaPath: string;
  /** Error message */
  message: string;
}

/**
 * Full verification result
 */
export interface VerificationResult {
  valid: boolean;
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  operationSummaries: OperationVerificationSummary[];
  errors: VerificationError[];
}
