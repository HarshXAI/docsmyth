/**
 * Path matching utilities for Contract IR paths
 *
 * Handles conversion between Express path format (/users/:id)
 * and OpenAPI/IR path format (/users/{id})
 */

/**
 * Result of a path match operation
 */
export interface PathMatchResult {
    /** Extracted path parameters */
    params: Record<string, string>;
}

/**
 * Compiled path matcher for efficient repeated matching
 */
export interface PathMatcher {
    /** Regular expression for matching */
    regex: RegExp;
    /** Names of path parameters in order */
    paramNames: string[];
    /** Original IR path pattern */
    pattern: string;
}

/**
 * Convert Express path parameter format to IR format
 * Express: /users/:id/posts/:postId
 * IR: /users/{id}/posts/{postId}
 */
export function expressPathToIrPath(expressPath: string): string {
    return expressPath.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

/**
 * Convert IR path parameter format to Express format
 * IR: /users/{id}/posts/{postId}
 * Express: /users/:id/posts/:postId
 */
export function irPathToExpressPath(irPath: string): string {
    return irPath.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, ':$1');
}

/**
 * Normalize a path for comparison (remove trailing slashes, ensure leading slash)
 */
export function normalizePath(path: string): string {
    // Remove trailing slash (but keep root /)
    let normalized = path.replace(/\/+$/, '') || '/';
    // Ensure leading slash
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    return normalized;
}

/**
 * Create a compiled regex pattern from an IR path for matching.
 * Handles path parameters like {id}
 *
 * @param irPath - IR path pattern (e.g., /users/{id}/posts/{postId})
 * @returns Compiled path matcher
 */
export function createPathMatcher(irPath: string): PathMatcher {
    const paramNames: string[] = [];
    const normalizedPattern = normalizePath(irPath);

    // First, escape special regex characters (except curly braces which we'll handle)
    let pattern = normalizedPattern.replace(/[.+*?^$|[\]\\]/g, (match) => '\\' + match);

    // Now replace path parameters {name} with capture groups
    pattern = pattern.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name) => {
        paramNames.push(name);
        // Match any non-slash characters
        return '([^/]+)';
    });

    // Match exact path
    return {
        regex: new RegExp(`^${pattern}$`),
        paramNames,
        pattern: normalizedPattern,
    };
}

/**
 * Match a request path against an IR path pattern
 *
 * @param requestPath - Actual request path (e.g., /users/123)
 * @param irPath - IR path pattern (e.g., /users/{id})
 * @returns Extracted path parameters if match, null otherwise
 */
export function matchPath(requestPath: string, irPath: string): Record<string, string> | null {
    const matcher = createPathMatcher(irPath);
    const normalized = normalizePath(requestPath);
    const match = normalized.match(matcher.regex);

    if (!match) {
        return null;
    }

    const params: Record<string, string> = {};
    for (let i = 0; i < matcher.paramNames.length; i++) {
        params[matcher.paramNames[i]] = match[i + 1];
    }

    return params;
}
