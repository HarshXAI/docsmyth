/**
 * Operation matching utilities for Contract IR
 *
 * Provides efficient matching of HTTP requests to operations
 * defined in a Contract IR document.
 */

import type { ContractIR, HttpOperation } from '@docsmyth/ir-spec';
import { createPathMatcher, normalizePath, type PathMatcher } from './path-matcher.js';

/**
 * Result of matching a request to an operation
 */
export interface OperationMatchResult {
  /** Matched operation from the contract */
  operation: HttpOperation;
  /** Extracted path parameters */
  params: Record<string, string>;
  /** The IR path template that matched */
  pathTemplate: string;
}

/**
 * Pre-compiled operation matcher for efficient repeated matching
 */
export interface OperationMatcher {
  /** Map of HTTP method to list of compiled matchers */
  byMethod: Map<string, Array<{
    operation: HttpOperation;
    pathMatcher: PathMatcher;
  }>>;
  /** Total number of operations */
  operationCount: number;
  /** Service name from contract */
  serviceName: string;
  /** Service version from contract */
  serviceVersion: string;
}

/**
 * Build an operation matcher from a Contract IR document.
 * Operations are grouped by HTTP method for efficient matching.
 *
 * @param contract - Contract IR document
 * @returns Pre-compiled operation matcher
 */
export function createOperationMatcher(contract: ContractIR): OperationMatcher {
  const byMethod = new Map<string, Array<{
    operation: HttpOperation;
    pathMatcher: PathMatcher;
  }>>();

  for (const op of contract.operations) {
    const method = op.method.toUpperCase();
    if (!byMethod.has(method)) {
      byMethod.set(method, []);
    }

    byMethod.get(method)!.push({
      operation: op,
      pathMatcher: createPathMatcher(op.path),
    });
  }

  return {
    byMethod,
    operationCount: contract.operations.length,
    serviceName: contract.service.name,
    serviceVersion: contract.service.version,
  };
}

/**
 * Find an operation matching the given HTTP method and path.
 *
 * @param matcher - Pre-compiled operation matcher
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path (e.g., /users/123)
 * @returns Match result with operation and params, or null if no match
 */
export function findOperation(
  matcher: OperationMatcher,
  method: string,
  path: string
): OperationMatchResult | null {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizePath(path);
  const methodOps = matcher.byMethod.get(normalizedMethod);

  if (!methodOps) {
    return null;
  }

  for (const { operation, pathMatcher } of methodOps) {
    const match = normalizedPath.match(pathMatcher.regex);
    if (match) {
      const params: Record<string, string> = {};
      for (let i = 0; i < pathMatcher.paramNames.length; i++) {
        params[pathMatcher.paramNames[i]] = match[i + 1];
      }
      return {
        operation,
        params,
        pathTemplate: pathMatcher.pattern,
      };
    }
  }

  return null;
}
