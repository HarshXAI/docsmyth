/**
 * Sanitization utilities for evidence capture
 *
 * Provides conservative defaults for removing sensitive data
 * from captured HTTP requests and responses.
 */

import type { EvidenceEvent, EvidenceRequest, EvidenceResponse } from './types.js';

/**
 * Configuration for sanitization
 */
export interface SanitizeConfig {
  /**
   * Headers to always remove (case-insensitive)
   * Default: ['authorization', 'cookie', 'set-cookie', 'x-api-key']
   */
  denylistHeaders?: string[];

  /**
   * Headers to allow (if set, only these headers are kept)
   * Default: undefined (all except denylist are kept)
   */
  allowlistHeaders?: string[];

  /**
   * Patterns to mask in string values
   * Matched text is replaced with '[REDACTED]'
   */
  maskPatterns?: RegExp[];

  /**
   * Whether to mask common PII patterns (email, phone, SSN)
   * Default: true
   */
  maskPii?: boolean;

  /**
   * Whether to mask bearer tokens
   * Default: true
   */
  maskTokens?: boolean;

  /**
   * Custom field names to mask in request/response bodies (case-insensitive)
   * Default: ['password', 'secret', 'token', 'apikey', 'api_key']
   */
  sensitiveFields?: string[];
}

/**
 * Default headers to remove
 */
const DEFAULT_DENYLIST_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-xsrf-token',
];

/**
 * Default sensitive field names
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'apiKey',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
];

/**
 * Common PII patterns
 */
const PII_PATTERNS = {
  // Email pattern (simplified)
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // US phone pattern (simplified)
  phone: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  // US SSN pattern
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
};

/**
 * Token patterns
 */
const TOKEN_PATTERNS = {
  // Bearer tokens
  bearer: /Bearer\s+[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*\.?[A-Za-z0-9\-_=]*/gi,
  // JWT-like tokens (3 base64 segments separated by dots)
  jwt: /\b[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{20,}\b/g,
  // Generic API keys (long alphanumeric strings)
  apiKey: /\b[A-Za-z0-9]{32,}\b/g,
};

const REDACTED = '[REDACTED]';

/**
 * Merge user config with defaults
 */
function getEffectiveConfig(config?: SanitizeConfig): Required<
  Omit<SanitizeConfig, 'allowlistHeaders' | 'maskPatterns'>
> & {
  allowlistHeaders?: string[];
  maskPatterns: RegExp[];
} {
  return {
    denylistHeaders: config?.denylistHeaders ?? DEFAULT_DENYLIST_HEADERS,
    allowlistHeaders: config?.allowlistHeaders,
    maskPatterns: config?.maskPatterns ?? [],
    maskPii: config?.maskPii ?? true,
    maskTokens: config?.maskTokens ?? true,
    sensitiveFields: config?.sensitiveFields ?? DEFAULT_SENSITIVE_FIELDS,
  };
}

/**
 * Normalize header name for comparison
 */
function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

/**
 * Check if a header should be removed
 */
function shouldRemoveHeader(name: string, config: ReturnType<typeof getEffectiveConfig>): boolean {
  const normalized = normalizeHeaderName(name);

  // If allowlist is set, only keep headers in the allowlist
  if (config.allowlistHeaders) {
    return !config.allowlistHeaders.some((h) => normalizeHeaderName(h) === normalized);
  }

  // Otherwise, remove headers in the denylist
  return config.denylistHeaders.some((h) => normalizeHeaderName(h) === normalized);
}

/**
 * Sanitize headers by removing sensitive ones
 */
function sanitizeHeaders(
  headers: Record<string, string> | undefined,
  config: ReturnType<typeof getEffectiveConfig>
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (!shouldRemoveHeader(key, config)) {
      sanitized[key] = maskString(value, config);
    }
  }

  // Return undefined if all headers were removed
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Apply masking patterns to a string
 */
function maskString(value: string, config: ReturnType<typeof getEffectiveConfig>): string {
  let result = value;

  // Apply custom patterns
  for (const pattern of config.maskPatterns) {
    result = result.replace(pattern, REDACTED);
  }

  // Mask PII if enabled
  if (config.maskPii) {
    result = result.replace(PII_PATTERNS.email, REDACTED);
    result = result.replace(PII_PATTERNS.phone, REDACTED);
    result = result.replace(PII_PATTERNS.ssn, REDACTED);
  }

  // Mask tokens if enabled
  if (config.maskTokens) {
    result = result.replace(TOKEN_PATTERNS.bearer, `Bearer ${REDACTED}`);
    result = result.replace(TOKEN_PATTERNS.jwt, REDACTED);
  }

  return result;
}

/**
 * Recursively sanitize an object (body)
 */
function sanitizeBody(
  body: unknown,
  config: ReturnType<typeof getEffectiveConfig>,
  depth = 0
): unknown {
  // Prevent infinite recursion
  if (depth > 50) return body;

  if (body === null || body === undefined) {
    return body;
  }

  if (typeof body === 'string') {
    return maskString(body, config);
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBody(item, config, depth + 1));
  }

  if (typeof body === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      // Check if this is a sensitive field
      const isSensitive = config.sensitiveFields.some(
        (field) => field.toLowerCase() === key.toLowerCase()
      );

      if (isSensitive) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizeBody(value, config, depth + 1);
      }
    }

    return result;
  }

  // Primitives (numbers, booleans) pass through
  return body;
}

/**
 * Sanitize an HTTP request
 */
function sanitizeRequest(
  request: EvidenceRequest,
  config: ReturnType<typeof getEffectiveConfig>
): EvidenceRequest {
  return {
    method: request.method,
    path: request.path,
    query: request.query
      ? (sanitizeBody(request.query, config) as Record<string, unknown>)
      : undefined,
    params: request.params,
    headers: sanitizeHeaders(request.headers, config),
    body: request.body !== undefined ? sanitizeBody(request.body, config) : undefined,
  };
}

/**
 * Sanitize an HTTP response
 */
function sanitizeResponse(
  response: EvidenceResponse,
  config: ReturnType<typeof getEffectiveConfig>
): EvidenceResponse {
  return {
    status: response.status,
    headers: sanitizeHeaders(response.headers, config),
    body: response.body !== undefined ? sanitizeBody(response.body, config) : undefined,
  };
}

/**
 * Sanitize an evidence event
 *
 * @param event - The evidence event to sanitize
 * @param config - Sanitization configuration
 * @returns A sanitized copy of the event
 *
 * @example
 * ```ts
 * import { sanitize } from '@docsmyth/evidence-sdk';
 *
 * const sanitized = sanitize(rawEvent, {
 *   maskPii: true,
 *   denylistHeaders: ['authorization', 'cookie'],
 * });
 * ```
 */
export function sanitize(event: EvidenceEvent, config?: SanitizeConfig): EvidenceEvent {
  const effectiveConfig = getEffectiveConfig(config);

  return {
    evidenceVersion: event.evidenceVersion,
    operationId: event.operationId,
    protocol: event.protocol,
    timestamp: event.timestamp,
    traceId: event.traceId,
    request: sanitizeRequest(event.request, effectiveConfig),
    response: sanitizeResponse(event.response, effectiveConfig),
  };
}

/**
 * Create a default sanitize function with pre-configured options
 */
export function createSanitizer(config?: SanitizeConfig): (event: EvidenceEvent) => EvidenceEvent {
  const effectiveConfig = getEffectiveConfig(config);
  return (event: EvidenceEvent) => sanitize(event, effectiveConfig);
}
