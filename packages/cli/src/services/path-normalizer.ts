/**
 * Path Normalizer Service
 *
 * Normalizes request paths by detecting dynamic segments (IDs, UUIDs, etc.)
 * and converting them to path parameters. Used for inference when no contract exists.
 */

/**
 * UUID-like pattern (8-4-4-4-12 hex format)
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID without dashes pattern
 */
const UUID_NODASH_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * Numeric ID pattern (pure integers)
 */
const NUMERIC_PATTERN = /^\d+$/;

/**
 * MongoDB ObjectId pattern (24 hex chars)
 */
const OBJECTID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Short ID pattern (common short IDs like nanoid)
 */
const SHORT_ID_PATTERN = /^[a-zA-Z0-9_-]{6,22}$/;

/**
 * Check if a path segment looks like a dynamic parameter
 */
export function isLikelyParameter(segment: string): boolean {
    if (!segment) return false;

    // Numeric IDs (e.g., 123, 45678)
    if (NUMERIC_PATTERN.test(segment)) return true;

    // UUIDs (e.g., 550e8400-e29b-41d4-a716-446655440000)
    if (UUID_PATTERN.test(segment)) return true;

    // UUIDs without dashes
    if (UUID_NODASH_PATTERN.test(segment)) return true;

    // MongoDB ObjectIds
    if (OBJECTID_PATTERN.test(segment)) return true;

    // Short IDs that are mostly alphanumeric with high entropy
    // Only match if it looks like an ID (has numbers mixed with letters)
    if (SHORT_ID_PATTERN.test(segment) && /\d/.test(segment) && /[a-zA-Z]/.test(segment)) {
        return true;
    }

    return false;
}

/**
 * Result of path normalization
 */
export interface NormalizedPath {
    /** The normalized path template (e.g., /users/{param1}) */
    template: string;
    /** Extracted path parameters with their values */
    params: Record<string, string>;
    /** Parameter names in order */
    paramNames: string[];
}

/**
 * Normalize a request path by detecting and replacing dynamic segments
 *
 * @param path - The actual request path (e.g., /users/123/posts/abc-def-ghi)
 * @returns Normalized path info
 */
export function normalizePath(path: string): NormalizedPath {
    const segments = path.split('/').filter(Boolean);
    const templateSegments: string[] = [];
    const params: Record<string, string> = {};
    const paramNames: string[] = [];
    let paramCounter = 0;

    for (const segment of segments) {
        if (isLikelyParameter(segment)) {
            paramCounter++;
            const paramName = `param${paramCounter}`;
            templateSegments.push(`{${paramName}}`);
            params[paramName] = segment;
            paramNames.push(paramName);
        } else {
            templateSegments.push(segment);
        }
    }

    const template = '/' + templateSegments.join('/');

    return {
        template,
        params,
        paramNames,
    };
}

/**
 * Generate a deterministic operationId from method and path
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param normalizedPath - Normalized path template
 * @returns Operation ID string
 */
export function generateOperationId(method: string, normalizedPath: string): string {
    // Format: METHOD /path/template → "METHOD /path/template"
    return `${method.toUpperCase()} ${normalizedPath}`;
}

/**
 * Infer a more meaningful operationId based on REST conventions
 *
 * @param method - HTTP method
 * @param normalizedPath - Normalized path template
 * @returns A more descriptive operationId
 */
export function inferSemanticOperationId(method: string, normalizedPath: string): string {
    const segments = normalizedPath.split('/').filter(Boolean);
    // Find last non-param segment (backward compatible with ES2020)
    let lastNonParam: string | undefined;
    for (let i = segments.length - 1; i >= 0; i--) {
        if (!segments[i].startsWith('{')) {
            lastNonParam = segments[i];
            break;
        }
    }
    // Check if the last segment is a param (determines if accessing single resource or collection)
    const lastSegment = segments[segments.length - 1];
    const lastSegmentIsParam = lastSegment?.startsWith('{') || false;
    const resource = lastNonParam || 'resource';

    // Singularize resource name heuristically
    const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;
    const plural = resource.endsWith('s') ? resource : resource + 's';

    // Common REST patterns
    const upperMethod = method.toUpperCase();

    if (upperMethod === 'GET' && !lastSegmentIsParam) {
        return `list${capitalize(plural)}`;
    }
    if (upperMethod === 'GET' && lastSegmentIsParam) {
        return `get${capitalize(singular)}`;
    }
    if (upperMethod === 'POST' && !lastSegmentIsParam) {
        return `create${capitalize(singular)}`;
    }
    if (upperMethod === 'PUT' && lastSegmentIsParam) {
        return `update${capitalize(singular)}`;
    }
    if (upperMethod === 'PATCH' && lastSegmentIsParam) {
        return `patch${capitalize(singular)}`;
    }
    if (upperMethod === 'DELETE' && lastSegmentIsParam) {
        return `delete${capitalize(singular)}`;
    }

    // Fallback to method + resource
    return `${method.toLowerCase()}${capitalize(resource)}`;
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
