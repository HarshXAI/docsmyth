/**
 * Express evidence capture middleware
 *
 * Captures HTTP request/response pairs and emits them as evidence events.
 * Evidence is sanitized before emission to remove sensitive data.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ContractIR, HttpOperation } from '@acp/ir-spec';
import { sanitize, type SanitizeConfig, type EvidenceEvent } from '@acp/evidence-sdk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchPath, normalizePath } from './path-matcher.js';
import { createNdjsonEmitter, type EvidenceEmitter } from './emitter.js';
import { createLogger, type Logger } from './logger.js';

/**
 * Options for the evidence capture middleware
 */
export interface EvidenceCaptureOptions {
  /**
   * Path to a Contract IR JSON file
   * Either contractPath or contract must be provided
   */
  contractPath?: string;

  /**
   * In-memory Contract IR object
   * Either contractPath or contract must be provided
   */
  contract?: ContractIR;

  /**
   * Whether evidence capture is enabled
   * Default: false (must be explicitly enabled)
   */
  enabled?: boolean;

  /**
   * Path to the evidence output file
   * Default: '.acp/evidence.ndjson'
   */
  outputPath?: string;

  /**
   * Custom evidence emitter function
   * If provided, overrides outputPath
   */
  emitter?: EvidenceEmitter;

  /**
   * Sanitization configuration
   */
  sanitizeConfig?: SanitizeConfig;

  /**
   * Whether to capture request body
   * Default: true
   */
  captureRequestBody?: boolean;

  /**
   * Whether to capture response body
   * Default: true
   */
  captureResponseBody?: boolean;

  /**
   * Maximum body size to capture (in bytes)
   * Default: 100KB
   */
  maxBodySize?: number;

  /**
   * Function to generate trace IDs
   * If not provided, traceId will be undefined
   */
  traceIdGenerator?: (req: Request) => string | undefined;

  /**
   * Logger instance for internal logging
   * Default: createLogger() with level 'warn'
   */
  logger?: Logger;
}

/**
 * Internal resolved options
 */
interface ResolvedOptions {
  contract: ContractIR;
  enabled: boolean;
  emitter: EvidenceEmitter;
  sanitizeConfig?: SanitizeConfig;
  captureRequestBody: boolean;
  captureResponseBody: boolean;
  maxBodySize: number;
  traceIdGenerator?: (req: Request) => string | undefined;
  logger: Logger;
}

/**
 * Operation lookup table for fast matching
 */
interface OperationMatcher {
  operations: Array<{
    operation: HttpOperation;
    irPath: string;
  }>;
}

/**
 * Load contract from file or use in-memory contract
 */
function loadContract(options: EvidenceCaptureOptions): ContractIR {
  if (options.contract) {
    return options.contract;
  }

  if (options.contractPath) {
    const fullPath = resolve(options.contractPath);
    try {
      const content = readFileSync(fullPath, 'utf-8');
      return JSON.parse(content) as ContractIR;
    } catch (error) {
      throw new Error(`Failed to load contract from ${fullPath}: ${error}`);
    }
  }

  throw new Error('Either contractPath or contract must be provided');
}

/**
 * Build operation matcher from contract
 */
function buildOperationMatcher(contract: ContractIR): OperationMatcher {
  return {
    operations: contract.operations.map((op) => ({
      operation: op,
      irPath: normalizePath(op.path),
    })),
  };
}

/**
 * Find operation matching request method and path
 */
function findOperation(
  matcher: OperationMatcher,
  method: string,
  path: string
): { operation: HttpOperation; params: Record<string, string> } | null {
  const normalizedPath = normalizePath(path);
  const normalizedMethod = method.toUpperCase();

  for (const { operation, irPath } of matcher.operations) {
    if (operation.method !== normalizedMethod) {
      continue;
    }

    const params = matchPath(normalizedPath, irPath);
    if (params !== null) {
      return { operation, params };
    }
  }

  return null;
}

/**
 * Safe JSON parse (returns undefined on failure)
 */
function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

/**
 * Capture response body by intercepting res.json/res.send
 */
function captureResponseBody(res: Response, callback: (body: unknown) => void): void {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function (body: unknown): Response {
    callback(body);
    return originalJson(body);
  };

  res.send = function (body: unknown): Response {
    // Try to parse as JSON if it's a string
    if (typeof body === 'string') {
      const parsed = safeJsonParse(body);
      if (parsed !== undefined) {
        callback(parsed);
      }
    } else if (typeof body === 'object') {
      callback(body);
    }
    return originalSend(body);
  };
}

/**
 * Extract headers from request/response
 */
function extractHeaders(
  headersObj: Record<string, string | string[] | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headersObj)) {
    if (value !== undefined) {
      result[key] = Array.isArray(value) ? value.join(', ') : value;
    }
  }
  return result;
}

/**
 * Creates Express middleware for evidence capture
 *
 * @param options - Middleware options
 * @returns Express middleware
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { evidenceCapture } from '@acp/runtime-node-express';
 *
 * const app = express();
 *
 * // Load contract and enable capture in development
 * app.use(evidenceCapture({
 *   contractPath: './contract-ir.json',
 *   enabled: process.env.NODE_ENV !== 'production',
 * }));
 *
 * app.post('/orders', (req, res) => {
 *   res.status(201).json({ id: '123' });
 * });
 * ```
 */
export function evidenceCapture(options: EvidenceCaptureOptions): RequestHandler {
  // Create logger first so it can be used during setup
  const logger = options.logger ?? createLogger();

  // Resolve options
  const resolvedOptions: ResolvedOptions = {
    contract: loadContract(options),
    enabled: options.enabled ?? false,
    emitter:
      options.emitter ??
      createNdjsonEmitter({
        filePath: options.outputPath ?? '.acp/evidence.ndjson',
        createDirs: true,
        logger,
      }),
    sanitizeConfig: options.sanitizeConfig,
    captureRequestBody: options.captureRequestBody ?? true,
    captureResponseBody: options.captureResponseBody ?? true,
    maxBodySize: options.maxBodySize ?? 100 * 1024, // 100KB
    traceIdGenerator: options.traceIdGenerator,
    logger,
  };

  // Build operation matcher
  const matcher = buildOperationMatcher(resolvedOptions.contract);

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip if capture is disabled
    if (!resolvedOptions.enabled) {
      next();
      return;
    }

    try {
      // Match request to operation
      const match = findOperation(matcher, req.method, req.path);
      if (!match) {
        // No matching operation, skip capture
        next();
        return;
      }

      const { operation, params } = match;
      const startTime = Date.now();
      let responseBody: unknown;

      // Capture response body
      if (resolvedOptions.captureResponseBody) {
        captureResponseBody(res, (body) => {
          responseBody = body;
        });
      }

      // Hook into response finish
      res.on('finish', () => {
        try {
          const event: EvidenceEvent = {
            evidenceVersion: '0.1',
            operationId: operation.operationId,
            protocol: 'http',
            timestamp: new Date(startTime).toISOString(),
            traceId: resolvedOptions.traceIdGenerator?.(req),
            request: {
              method: req.method,
              path: req.path,
              query:
                Object.keys(req.query).length > 0
                  ? (req.query as Record<string, unknown>)
                  : undefined,
              params: Object.keys(params).length > 0 ? params : undefined,
              headers: extractHeaders(req.headers as Record<string, string | string[] | undefined>),
              body: resolvedOptions.captureRequestBody ? req.body : undefined,
            },
            response: {
              status: res.statusCode,
              headers: extractHeaders(
                res.getHeaders() as Record<string, string | string[] | undefined>
              ),
              body: responseBody,
            },
          };

          // Sanitize and emit
          const sanitized = sanitize(event, resolvedOptions.sanitizeConfig);

          // Emit asynchronously to not block response
          Promise.resolve(resolvedOptions.emitter(sanitized)).catch((err) => {
            resolvedOptions.logger.warn('Failed to emit evidence:', err);
          });
        } catch (error) {
          // Never crash the app due to evidence capture
          resolvedOptions.logger.warn('Failed to capture evidence:', error);
        }
      });

      next();
    } catch (error) {
      // Never crash the app due to evidence capture
      resolvedOptions.logger.warn('Evidence capture error:', error);
      next();
    }
  };
}
