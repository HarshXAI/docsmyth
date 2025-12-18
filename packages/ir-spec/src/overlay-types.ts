/**
 * Overlay Types v0.1
 *
 * Defines types for overlay documents that can modify Contract IR views
 * without mutating the base IR. Overlays enable producing multiple
 * documentation views (public/internal) from a single contract.
 */

import type { HttpMethod } from './types.js';

/**
 * Supported overlay versions
 */
export type OverlayVersion = '0.1';

/**
 * Hide operation by operationId
 */
export interface HideByOperationId {
    /** Operation ID to hide */
    operationId: string;
    /** Reason for hiding (optional, for documentation) */
    reason?: string;
}

/**
 * Hide operation by method + path
 */
export interface HideByMethodPath {
    /** HTTP method */
    method: HttpMethod;
    /** Path pattern (e.g., "/internal/*" or "/admin/users") */
    path: string;
    /** Reason for hiding (optional, for documentation) */
    reason?: string;
}

/**
 * Operation to hide (either by operationId or method+path)
 */
export type HideOperation = HideByOperationId | HideByMethodPath;

/**
 * Server URL override
 */
export interface ServerOverride {
    /** Pattern to match (regex or exact) */
    pattern: string;
    /** Replacement URL */
    replacement: string;
    /** Whether pattern is a regex (default: false = exact match) */
    isRegex?: boolean;
}

/**
 * Schema field redaction
 */
export interface SchemaRedaction {
    /** Schema ID to redact from (e.g., "CreateOrderRequest") */
    schemaId: string;
    /** Fields to remove (dot notation for nested, e.g., "user.internalId") */
    fields: string[];
    /** Reason for redaction (optional, for documentation) */
    reason?: string;
}

/**
 * Response schema redaction for specific operations
 */
export interface ResponseRedaction {
    /** Operation ID */
    operationId: string;
    /** Status code (optional, applies to all if not specified) */
    statusCode?: number;
    /** Fields to remove from response schema */
    fields: string[];
    /** Reason for redaction (optional) */
    reason?: string;
}

/**
 * Request schema redaction for specific operations
 */
export interface RequestRedaction {
    /** Operation ID */
    operationId: string;
    /** Fields to remove from request body schema */
    fields: string[];
    /** Reason for redaction (optional) */
    reason?: string;
}

/**
 * Overlay document structure
 *
 * An overlay defines modifications to apply to a Contract IR to produce
 * a different view (e.g., public vs internal documentation).
 */
export interface Overlay {
    /** Overlay format version */
    irOverlayVersion: OverlayVersion;

    /** Human-readable name for the overlay */
    name: string;

    /** Description of what this overlay does */
    description?: string;

    /**
     * Operations to hide from the view
     * Hidden operations will not appear in compiled OpenAPI or portal
     */
    hideOperations?: HideOperation[];

    /**
     * Server URL overrides
     * Rewrite base URLs for this view (e.g., internal vs external URLs)
     */
    serverOverrides?: ServerOverride[];

    /**
     * Schema field redactions
     * Remove sensitive fields from shared schemas
     */
    schemaRedactions?: SchemaRedaction[];

    /**
     * Response-specific field redactions
     * Remove fields from specific operation responses
     */
    responseRedactions?: ResponseRedaction[];

    /**
     * Request-specific field redactions
     * Remove fields from specific operation request bodies
     */
    requestRedactions?: RequestRedaction[];

    /**
     * Extension data (for custom metadata)
     */
    extensions?: Record<string, unknown>;
}

/**
 * Summary of what an overlay will do when applied
 */
export interface OverlaySummary {
    /** Number of operations that will be hidden */
    hiddenOperationsCount: number;
    /** Number of schema redactions */
    schemaRedactionsCount: number;
    /** Number of response redactions */
    responseRedactionsCount: number;
    /** Number of request redactions */
    requestRedactionsCount: number;
    /** Whether servers will be rewritten */
    hasServerOverrides: boolean;
    /** List of operation IDs that will be hidden */
    hiddenOperationIds: string[];
    /** List of schema IDs with redactions */
    redactedSchemaIds: string[];
}

/**
 * Type guard to check if hide operation is by operationId
 */
export function isHideByOperationId(op: HideOperation): op is HideByOperationId {
    return 'operationId' in op;
}

/**
 * Type guard to check if hide operation is by method+path
 */
export function isHideByMethodPath(op: HideOperation): op is HideByMethodPath {
    return 'method' in op && 'path' in op;
}
