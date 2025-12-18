/**
 * Path matching utilities for Express routes
 *
 * This module re-exports path matching utilities from @acp/path-matcher
 * to maintain backwards compatibility. New code should import directly
 * from @acp/path-matcher for shared behavior with @acp/capture-proxy.
 *
 * @deprecated Import from '@acp/path-matcher' instead
 */

// Re-export everything from the shared path-matcher package
export {
  expressPathToIrPath,
  irPathToExpressPath,
  normalizePath,
  matchPath,
  createPathMatcher,
} from '@acp/path-matcher';
