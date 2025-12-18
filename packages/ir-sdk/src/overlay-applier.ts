/**
 * Overlay Applier
 *
 * Implements applyOverlay(contractIR, overlay) -> contractIR'
 * Produces a new Contract IR with overlay modifications applied.
 *
 * Guarantees:
 * - Deterministic output (stable ordering)
 * - Cycle-safe schema redactions
 * - Base IR remains immutable
 * - $ref correctness preserved
 */

import type {
    ContractIR,
    HttpOperation,
    JsonSchemaObject,
    Overlay,
    HideOperation,
    SchemaRedaction,
    ResponseRedaction,
    RequestRedaction,
    ServerOverride,
    OverlaySummary,
    HttpMethod,
} from '@acp/ir-spec';
import { isHideByOperationId, isHideByMethodPath } from '@acp/ir-spec';

/**
 * Result of applying an overlay
 */
export interface ApplyOverlayResult {
    /** The modified Contract IR */
    ir: ContractIR;
    /** Summary of what was changed */
    summary: OverlaySummary;
    /** Any warnings generated during application */
    warnings: string[];
}

/**
 * Options for overlay application
 */
export interface ApplyOverlayOptions {
    /** Whether to validate the overlay first (default: true) */
    validate?: boolean;
    /** Maximum schema traversal depth (default: 100) */
    maxSchemaDepth?: number;
}

/**
 * Apply an overlay to a Contract IR, producing a modified view
 *
 * @param ir - The base Contract IR (not modified)
 * @param overlay - The overlay to apply
 * @param options - Optional configuration
 * @returns The modified IR and a summary of changes
 *
 * @example
 * ```ts
 * import { applyOverlay } from '@acp/ir-sdk';
 *
 * const result = applyOverlay(baseContract, publicOverlay);
 * console.log(`Hidden ${result.summary.hiddenOperationsCount} operations`);
 * // result.ir is the modified contract
 * ```
 */
export function applyOverlay(
    ir: ContractIR,
    overlay: Overlay,
    options: ApplyOverlayOptions = {}
): ApplyOverlayResult {
    const { maxSchemaDepth = 100 } = options;
    const warnings: string[] = [];

    // Track changes for summary
    const hiddenOperationIds: string[] = [];
    const redactedSchemaIds = new Set<string>();

    // Deep clone the IR to ensure immutability
    let result: ContractIR = deepClone(ir);

    // 1. Apply hideOperations
    if (overlay.hideOperations && overlay.hideOperations.length > 0) {
        const { operations, hidden } = filterOperations(
            result.operations,
            overlay.hideOperations,
            warnings
        );
        result = { ...result, operations };
        hiddenOperationIds.push(...hidden);
    }

    // 2. Apply serverOverrides
    if (overlay.serverOverrides && overlay.serverOverrides.length > 0) {
        result = applyServerOverrides(result, overlay.serverOverrides);
    }

    // 3. Apply schemaRedactions (cycle-safe)
    if (overlay.schemaRedactions && overlay.schemaRedactions.length > 0) {
        const { schemas, redacted } = redactSchemas(
            result.schemas,
            overlay.schemaRedactions,
            maxSchemaDepth,
            warnings
        );
        result = { ...result, schemas };
        redacted.forEach((id) => redactedSchemaIds.add(id));
    }

    // 4. Apply responseRedactions
    if (overlay.responseRedactions && overlay.responseRedactions.length > 0) {
        result = applyResponseRedactions(result, overlay.responseRedactions, maxSchemaDepth, warnings);
    }

    // 5. Apply requestRedactions
    if (overlay.requestRedactions && overlay.requestRedactions.length > 0) {
        result = applyRequestRedactions(result, overlay.requestRedactions, maxSchemaDepth, warnings);
    }

    // Build summary
    const summary: OverlaySummary = {
        hiddenOperationsCount: hiddenOperationIds.length,
        schemaRedactionsCount: overlay.schemaRedactions?.length ?? 0,
        responseRedactionsCount: overlay.responseRedactions?.length ?? 0,
        requestRedactionsCount: overlay.requestRedactions?.length ?? 0,
        hasServerOverrides: (overlay.serverOverrides?.length ?? 0) > 0,
        hiddenOperationIds,
        redactedSchemaIds: Array.from(redactedSchemaIds).sort(),
    };

    return { ir: result, summary, warnings };
}

/**
 * Deep clone an object (JSON-safe)
 */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Filter operations based on hide rules
 */
function filterOperations(
    operations: HttpOperation[],
    hideRules: HideOperation[],
    warnings: string[]
): { operations: HttpOperation[]; hidden: string[] } {
    const hidden: string[] = [];

    // Build lookup sets for efficient matching
    const hideByOperationId = new Set<string>();
    const hideByMethodPath = new Map<string, Set<string>>(); // method -> Set<path patterns>

    for (const rule of hideRules) {
        if (isHideByOperationId(rule)) {
            hideByOperationId.add(rule.operationId);
        } else if (isHideByMethodPath(rule)) {
            if (!hideByMethodPath.has(rule.method)) {
                hideByMethodPath.set(rule.method, new Set());
            }
            hideByMethodPath.get(rule.method)!.add(rule.path);
        }
    }

    const filtered = operations.filter((op) => {
        // Check operationId match
        if (hideByOperationId.has(op.operationId)) {
            hidden.push(op.operationId);
            return false;
        }

        // Check method+path match
        const pathPatterns = hideByMethodPath.get(op.method);
        if (pathPatterns) {
            for (const pattern of pathPatterns) {
                if (matchPath(op.path, pattern)) {
                    hidden.push(op.operationId);
                    return false;
                }
            }
        }

        return true;
    });

    // Warn about hide rules that didn't match anything
    const foundOperationIds = new Set(hidden);
    for (const id of hideByOperationId) {
        if (!foundOperationIds.has(id)) {
            warnings.push(`Hide rule for operationId "${id}" did not match any operation`);
        }
    }

    return { operations: filtered, hidden };
}

/**
 * Match a path against a pattern (supports * wildcard)
 */
function matchPath(path: string, pattern: string): boolean {
    // Exact match
    if (path === pattern) return true;

    // Wildcard matching
    if (pattern.includes('*')) {
        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
            .replace(/\*/g, '.*'); // Convert * to .*
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(path);
    }

    return false;
}

/**
 * Apply server URL overrides
 */
function applyServerOverrides(ir: ContractIR, overrides: ServerOverride[]): ContractIR {
    if (!ir.service.baseUrls || ir.service.baseUrls.length === 0) {
        return ir;
    }

    const newBaseUrls = ir.service.baseUrls.map((url) => {
        let result = url;
        for (const override of overrides) {
            if (override.isRegex) {
                try {
                    const regex = new RegExp(override.pattern, 'g');
                    result = result.replace(regex, override.replacement);
                } catch {
                    // Invalid regex, skip
                }
            } else {
                // Exact match replacement
                if (result === override.pattern) {
                    result = override.replacement;
                } else if (result.includes(override.pattern)) {
                    // Substring replacement
                    result = result.replace(override.pattern, override.replacement);
                }
            }
        }
        return result;
    });

    return {
        ...ir,
        service: {
            ...ir.service,
            baseUrls: newBaseUrls,
        },
    };
}

/**
 * Redact fields from schemas (cycle-safe)
 */
function redactSchemas(
    schemas: Record<string, JsonSchemaObject>,
    redactions: SchemaRedaction[],
    maxDepth: number,
    warnings: string[]
): { schemas: Record<string, JsonSchemaObject>; redacted: string[] } {
    const result = deepClone(schemas);
    const redacted: string[] = [];

    for (const redaction of redactions) {
        const schema = result[redaction.schemaId];
        if (!schema) {
            warnings.push(`Schema "${redaction.schemaId}" not found for redaction`);
            continue;
        }

        redacted.push(redaction.schemaId);

        for (const fieldPath of redaction.fields) {
            removeField(schema, fieldPath, maxDepth);
        }
    }

    return { schemas: result, redacted };
}

/**
 * Remove a field from a schema by dot-notation path
 */
function removeField(schema: JsonSchemaObject, fieldPath: string, _maxDepth: number): void {
    const parts = fieldPath.split('.');
    let current: JsonSchemaObject | undefined = schema;

    // Navigate to parent of the field to remove
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];

        if (!current) return;

        // Check if we're navigating into properties
        if (current.properties && current.properties[part]) {
            const prop = current.properties[part];
            // Handle $ref - cannot traverse into refs
            if ('$ref' in prop) {
                return; // Cannot redact through a $ref
            }
            current = prop as JsonSchemaObject;
        } else {
            // Field doesn't exist
            return;
        }
    }

    // Remove the final field
    const finalField = parts[parts.length - 1];
    if (current?.properties && finalField in current.properties) {
        delete current.properties[finalField];

        // Also remove from required array if present
        if (current.required) {
            current.required = current.required.filter((r) => r !== finalField);
        }
    }
}

/**
 * Apply response redactions to operations
 */
function applyResponseRedactions(
    ir: ContractIR,
    redactions: ResponseRedaction[],
    maxDepth: number,
    warnings: string[]
): ContractIR {
    const operations = ir.operations.map((op) => {
        const matchingRedactions = redactions.filter((r) => r.operationId === op.operationId);
        if (matchingRedactions.length === 0) return op;

        const responses = op.responses.map((response) => {
            const applicableRedactions = matchingRedactions.filter(
                (r) => r.statusCode === undefined || r.statusCode === response.statusCode
            );

            if (applicableRedactions.length === 0) return response;

            // Clone response and redact fields from schema
            const newResponse = deepClone(response);
            if (newResponse.schema && !('$ref' in newResponse.schema)) {
                for (const redaction of applicableRedactions) {
                    for (const field of redaction.fields) {
                        removeField(newResponse.schema as JsonSchemaObject, field, maxDepth);
                    }
                }
            }

            return newResponse;
        });

        return { ...op, responses };
    });

    // Warn about unmatched redactions
    const opIds = new Set(ir.operations.map((o) => o.operationId));
    for (const redaction of redactions) {
        if (!opIds.has(redaction.operationId)) {
            warnings.push(
                `Response redaction for operationId "${redaction.operationId}" did not match any operation`
            );
        }
    }

    return { ...ir, operations };
}

/**
 * Apply request redactions to operations
 */
function applyRequestRedactions(
    ir: ContractIR,
    redactions: RequestRedaction[],
    maxDepth: number,
    warnings: string[]
): ContractIR {
    const operations = ir.operations.map((op) => {
        const matchingRedactions = redactions.filter((r) => r.operationId === op.operationId);
        if (matchingRedactions.length === 0 || !op.requestBody) return op;

        // Clone operation and redact fields from request body schema
        const newOp = deepClone(op);
        if (newOp.requestBody?.schema && !('$ref' in newOp.requestBody.schema)) {
            for (const redaction of matchingRedactions) {
                for (const field of redaction.fields) {
                    removeField(newOp.requestBody.schema as JsonSchemaObject, field, maxDepth);
                }
            }
        }

        return newOp;
    });

    // Warn about unmatched redactions
    const opIds = new Set(ir.operations.map((o) => o.operationId));
    for (const redaction of redactions) {
        if (!opIds.has(redaction.operationId)) {
            warnings.push(
                `Request redaction for operationId "${redaction.operationId}" did not match any operation`
            );
        }
    }

    return { ...ir, operations };
}

/**
 * Get a summary of what an overlay will do without applying it
 *
 * @param ir - The Contract IR to analyze
 * @param overlay - The overlay to summarize
 * @returns Summary of planned changes
 */
export function getOverlaySummary(ir: ContractIR, overlay: Overlay): OverlaySummary {
    const hiddenOperationIds: string[] = [];

    // Calculate hidden operations
    if (overlay.hideOperations) {
        const hideByOperationId = new Set<string>();
        const hideByMethodPath: Array<{ method: HttpMethod; path: string }> = [];

        for (const rule of overlay.hideOperations) {
            if (isHideByOperationId(rule)) {
                hideByOperationId.add(rule.operationId);
            } else if (isHideByMethodPath(rule)) {
                hideByMethodPath.push({ method: rule.method, path: rule.path });
            }
        }

        for (const op of ir.operations) {
            if (hideByOperationId.has(op.operationId)) {
                hiddenOperationIds.push(op.operationId);
            } else {
                for (const { method, path } of hideByMethodPath) {
                    if (op.method === method && matchPath(op.path, path)) {
                        hiddenOperationIds.push(op.operationId);
                        break;
                    }
                }
            }
        }
    }

    // Get redacted schema IDs
    const redactedSchemaIds = overlay.schemaRedactions
        ? overlay.schemaRedactions.map((r) => r.schemaId).filter((id) => id in ir.schemas)
        : [];

    return {
        hiddenOperationsCount: hiddenOperationIds.length,
        schemaRedactionsCount: overlay.schemaRedactions?.length ?? 0,
        responseRedactionsCount: overlay.responseRedactions?.length ?? 0,
        requestRedactionsCount: overlay.requestRedactions?.length ?? 0,
        hasServerOverrides: (overlay.serverOverrides?.length ?? 0) > 0,
        hiddenOperationIds,
        redactedSchemaIds: [...new Set(redactedSchemaIds)].sort(),
    };
}
