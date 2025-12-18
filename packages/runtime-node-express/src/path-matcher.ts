/**
 * Path matching utilities for Express routes
 *
 * This module re-exports path matching utilities from @docsmyth/path-matcher
 * to maintain backwards compatibility. New code should import directly
 * from @docsmyth/path-matcher for shared behavior with @docsmyth/capture-proxy.
 *
 * @deprecated Import from '@docsmyth/path-matcher' instead
 */

// Re-export everything from the shared path-matcher package
export {
  expressPathToIrPath,
  irPathToExpressPath,
  normalizePath,
  matchPath,
  createPathMatcher,
} from '@docsmyth/path-matcher';
