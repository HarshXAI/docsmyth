/**
 * @docsmyth/path-matcher
 *
 * Shared path matching utilities for Contract IR path patterns.
 * Used by both @docsmyth/runtime-node-express and @docsmyth/capture-proxy
 * to ensure consistent path matching behavior.
 */

export {
    expressPathToIrPath,
    irPathToExpressPath,
    normalizePath,
    matchPath,
    createPathMatcher,
    type PathMatcher,
    type PathMatchResult,
} from './path-matcher.js';

export {
    createOperationMatcher,
    findOperation,
    type OperationMatcher,
    type OperationMatchResult,
} from './operation-matcher.js';
