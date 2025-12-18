/**
 * Overlay Validation Module
 *
 * Provides validation for Overlay documents with readable error messages.
 */

import type { Overlay, OverlayVersion } from './overlay-types.js';

/**
 * Overlay validation error
 */
export interface OverlayValidationError {
    path: string;
    message: string;
    code: string;
}

/**
 * Overlay validation result
 */
export interface OverlayValidationResult {
    valid: boolean;
    errors: OverlayValidationError[];
    warnings: OverlayValidationError[];
}

/**
 * Supported overlay versions
 */
const SUPPORTED_OVERLAY_VERSIONS: OverlayVersion[] = ['0.1'];

/**
 * Valid HTTP methods
 */
const VALID_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/**
 * Validate an Overlay document
 *
 * @param overlay - The overlay document to validate
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```ts
 * import { validateOverlay } from '@acp/ir-spec';
 *
 * const result = validateOverlay(overlayDoc);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 * ```
 */
export function validateOverlay(overlay: unknown): OverlayValidationResult {
    const errors: OverlayValidationError[] = [];
    const warnings: OverlayValidationError[] = [];

    // Basic type check
    if (!overlay || typeof overlay !== 'object') {
        return {
            valid: false,
            errors: [
                {
                    path: '',
                    message: 'Overlay document must be an object',
                    code: 'INVALID_TYPE',
                },
            ],
            warnings: [],
        };
    }

    const doc = overlay as Record<string, unknown>;

    // Check irOverlayVersion
    if (!doc.irOverlayVersion) {
        errors.push({
            path: 'irOverlayVersion',
            message: 'irOverlayVersion is required',
            code: 'REQUIRED_FIELD',
        });
    } else if (typeof doc.irOverlayVersion !== 'string') {
        errors.push({
            path: 'irOverlayVersion',
            message: 'irOverlayVersion must be a string',
            code: 'INVALID_TYPE',
        });
    } else if (!SUPPORTED_OVERLAY_VERSIONS.includes(doc.irOverlayVersion as OverlayVersion)) {
        errors.push({
            path: 'irOverlayVersion',
            message: `irOverlayVersion must be "0.1". Got: "${doc.irOverlayVersion}"`,
            code: 'UNSUPPORTED_VERSION',
        });
    }

    // Check name
    if (!doc.name) {
        errors.push({
            path: 'name',
            message: 'name is required',
            code: 'REQUIRED_FIELD',
        });
    } else if (typeof doc.name !== 'string') {
        errors.push({
            path: 'name',
            message: 'name must be a string',
            code: 'INVALID_TYPE',
        });
    } else if (doc.name.length === 0) {
        errors.push({
            path: 'name',
            message: 'name cannot be empty',
            code: 'INVALID_VALUE',
        });
    } else if (doc.name.length > 100) {
        errors.push({
            path: 'name',
            message: 'name must be 100 characters or less',
            code: 'INVALID_VALUE',
        });
    }

    // Check description (optional)
    if (doc.description !== undefined) {
        if (typeof doc.description !== 'string') {
            errors.push({
                path: 'description',
                message: 'description must be a string',
                code: 'INVALID_TYPE',
            });
        } else if (doc.description.length > 1000) {
            warnings.push({
                path: 'description',
                message: 'description is longer than recommended (1000 chars)',
                code: 'VALUE_TOO_LONG',
            });
        }
    }

    // Validate hideOperations
    if (doc.hideOperations !== undefined) {
        if (!Array.isArray(doc.hideOperations)) {
            errors.push({
                path: 'hideOperations',
                message: 'hideOperations must be an array',
                code: 'INVALID_TYPE',
            });
        } else {
            validateHideOperations(doc.hideOperations, errors, warnings);
        }
    }

    // Validate serverOverrides
    if (doc.serverOverrides !== undefined) {
        if (!Array.isArray(doc.serverOverrides)) {
            errors.push({
                path: 'serverOverrides',
                message: 'serverOverrides must be an array',
                code: 'INVALID_TYPE',
            });
        } else {
            validateServerOverrides(doc.serverOverrides, errors, warnings);
        }
    }

    // Validate schemaRedactions
    if (doc.schemaRedactions !== undefined) {
        if (!Array.isArray(doc.schemaRedactions)) {
            errors.push({
                path: 'schemaRedactions',
                message: 'schemaRedactions must be an array',
                code: 'INVALID_TYPE',
            });
        } else {
            validateSchemaRedactions(doc.schemaRedactions, errors, warnings);
        }
    }

    // Validate responseRedactions
    if (doc.responseRedactions !== undefined) {
        if (!Array.isArray(doc.responseRedactions)) {
            errors.push({
                path: 'responseRedactions',
                message: 'responseRedactions must be an array',
                code: 'INVALID_TYPE',
            });
        } else {
            validateResponseRedactions(doc.responseRedactions, errors, warnings);
        }
    }

    // Validate requestRedactions
    if (doc.requestRedactions !== undefined) {
        if (!Array.isArray(doc.requestRedactions)) {
            errors.push({
                path: 'requestRedactions',
                message: 'requestRedactions must be an array',
                code: 'INVALID_TYPE',
            });
        } else {
            validateRequestRedactions(doc.requestRedactions, errors, warnings);
        }
    }

    // Check for empty overlay (warning)
    const hasOperations =
        (Array.isArray(doc.hideOperations) && doc.hideOperations.length > 0) ||
        (Array.isArray(doc.serverOverrides) && doc.serverOverrides.length > 0) ||
        (Array.isArray(doc.schemaRedactions) && doc.schemaRedactions.length > 0) ||
        (Array.isArray(doc.responseRedactions) && doc.responseRedactions.length > 0) ||
        (Array.isArray(doc.requestRedactions) && doc.requestRedactions.length > 0);

    if (!hasOperations) {
        warnings.push({
            path: '',
            message: 'Overlay has no operations defined - it will have no effect',
            code: 'EMPTY_OVERLAY',
        });
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Validate hideOperations array
 */
function validateHideOperations(
    ops: unknown[],
    errors: OverlayValidationError[],
    warnings: OverlayValidationError[]
): void {
    const seenOperationIds = new Set<string>();
    const seenMethodPaths = new Set<string>();

    ops.forEach((op, index) => {
        const path = `hideOperations[${index}]`;

        if (!op || typeof op !== 'object') {
            errors.push({
                path,
                message: 'Each hide operation must be an object',
                code: 'INVALID_TYPE',
            });
            return;
        }

        const opObj = op as Record<string, unknown>;

        // Check if it's operationId-based or method+path-based
        const hasOperationId = 'operationId' in opObj;
        const hasMethod = 'method' in opObj;
        const hasPath = 'path' in opObj;

        if (hasOperationId && (hasMethod || hasPath)) {
            errors.push({
                path,
                message: 'Hide operation must use either operationId OR method+path, not both',
                code: 'INVALID_HIDE_OPERATION',
            });
            return;
        }

        if (hasOperationId) {
            // Validate operationId-based hide
            if (typeof opObj.operationId !== 'string' || opObj.operationId.length === 0) {
                errors.push({
                    path: `${path}.operationId`,
                    message: 'operationId must be a non-empty string',
                    code: 'INVALID_VALUE',
                });
            } else {
                if (seenOperationIds.has(opObj.operationId)) {
                    warnings.push({
                        path: `${path}.operationId`,
                        message: `Duplicate operationId "${opObj.operationId}" in hideOperations`,
                        code: 'DUPLICATE_VALUE',
                    });
                }
                seenOperationIds.add(opObj.operationId);
            }
        } else if (hasMethod && hasPath) {
            // Validate method+path-based hide
            if (typeof opObj.method !== 'string') {
                errors.push({
                    path: `${path}.method`,
                    message: 'method must be a string',
                    code: 'INVALID_TYPE',
                });
            } else if (!VALID_HTTP_METHODS.includes(opObj.method as (typeof VALID_HTTP_METHODS)[number])) {
                errors.push({
                    path: `${path}.method`,
                    message: `method must be one of: ${VALID_HTTP_METHODS.join(', ')}`,
                    code: 'INVALID_VALUE',
                });
            }

            if (typeof opObj.path !== 'string' || opObj.path.length === 0) {
                errors.push({
                    path: `${path}.path`,
                    message: 'path must be a non-empty string',
                    code: 'INVALID_VALUE',
                });
            } else {
                const key = `${opObj.method}:${opObj.path}`;
                if (seenMethodPaths.has(key)) {
                    warnings.push({
                        path,
                        message: `Duplicate method+path "${key}" in hideOperations`,
                        code: 'DUPLICATE_VALUE',
                    });
                }
                seenMethodPaths.add(key);
            }
        } else {
            errors.push({
                path,
                message: 'Hide operation must have either operationId or both method and path',
                code: 'MISSING_FIELDS',
            });
        }

        // Validate reason (optional)
        if (opObj.reason !== undefined && typeof opObj.reason !== 'string') {
            errors.push({
                path: `${path}.reason`,
                message: 'reason must be a string',
                code: 'INVALID_TYPE',
            });
        }
    });
}

/**
 * Validate serverOverrides array
 */
function validateServerOverrides(
    overrides: unknown[],
    errors: OverlayValidationError[],
    _warnings: OverlayValidationError[]
): void {
    overrides.forEach((override, index) => {
        const path = `serverOverrides[${index}]`;

        if (!override || typeof override !== 'object') {
            errors.push({
                path,
                message: 'Each server override must be an object',
                code: 'INVALID_TYPE',
            });
            return;
        }

        const overrideObj = override as Record<string, unknown>;

        // Check pattern
        if (!overrideObj.pattern) {
            errors.push({
                path: `${path}.pattern`,
                message: 'pattern is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (typeof overrideObj.pattern !== 'string') {
            errors.push({
                path: `${path}.pattern`,
                message: 'pattern must be a string',
                code: 'INVALID_TYPE',
            });
        }

        // Check replacement
        if (overrideObj.replacement === undefined) {
            errors.push({
                path: `${path}.replacement`,
                message: 'replacement is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (typeof overrideObj.replacement !== 'string') {
            errors.push({
                path: `${path}.replacement`,
                message: 'replacement must be a string',
                code: 'INVALID_TYPE',
            });
        }

        // Check isRegex (optional)
        if (overrideObj.isRegex !== undefined && typeof overrideObj.isRegex !== 'boolean') {
            errors.push({
                path: `${path}.isRegex`,
                message: 'isRegex must be a boolean',
                code: 'INVALID_TYPE',
            });
        }

        // Validate regex if isRegex is true
        if (overrideObj.isRegex === true && typeof overrideObj.pattern === 'string') {
            try {
                new RegExp(overrideObj.pattern);
            } catch (e) {
                errors.push({
                    path: `${path}.pattern`,
                    message: `Invalid regex pattern: ${(e as Error).message}`,
                    code: 'INVALID_REGEX',
                });
            }
        }
    });
}

/**
 * Validate schemaRedactions array
 */
function validateSchemaRedactions(
    redactions: unknown[],
    errors: OverlayValidationError[],
    warnings: OverlayValidationError[]
): void {
    const seenSchemaFields = new Map<string, Set<string>>();

    redactions.forEach((redaction, index) => {
        const path = `schemaRedactions[${index}]`;

        if (!redaction || typeof redaction !== 'object') {
            errors.push({
                path,
                message: 'Each schema redaction must be an object',
                code: 'INVALID_TYPE',
            });
            return;
        }

        const redactionObj = redaction as Record<string, unknown>;

        // Check schemaId
        if (!redactionObj.schemaId) {
            errors.push({
                path: `${path}.schemaId`,
                message: 'schemaId is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (typeof redactionObj.schemaId !== 'string') {
            errors.push({
                path: `${path}.schemaId`,
                message: 'schemaId must be a string',
                code: 'INVALID_TYPE',
            });
        }

        // Check fields
        if (!redactionObj.fields) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (!Array.isArray(redactionObj.fields)) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields must be an array',
                code: 'INVALID_TYPE',
            });
        } else if (redactionObj.fields.length === 0) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields array cannot be empty',
                code: 'INVALID_VALUE',
            });
        } else {
            // Check each field
            redactionObj.fields.forEach((field, fieldIndex) => {
                if (typeof field !== 'string' || field.length === 0) {
                    errors.push({
                        path: `${path}.fields[${fieldIndex}]`,
                        message: 'Each field must be a non-empty string',
                        code: 'INVALID_VALUE',
                    });
                }
            });

            // Check for duplicate field redactions on same schema
            if (typeof redactionObj.schemaId === 'string') {
                const schemaId = redactionObj.schemaId;
                if (!seenSchemaFields.has(schemaId)) {
                    seenSchemaFields.set(schemaId, new Set());
                }
                const fieldSet = seenSchemaFields.get(schemaId)!;

                for (const field of redactionObj.fields as string[]) {
                    if (fieldSet.has(field)) {
                        warnings.push({
                            path: `${path}.fields`,
                            message: `Duplicate field "${field}" redaction for schema "${schemaId}"`,
                            code: 'DUPLICATE_VALUE',
                        });
                    }
                    fieldSet.add(field);
                }
            }
        }

        // Validate reason (optional)
        if (redactionObj.reason !== undefined && typeof redactionObj.reason !== 'string') {
            errors.push({
                path: `${path}.reason`,
                message: 'reason must be a string',
                code: 'INVALID_TYPE',
            });
        }
    });
}

/**
 * Validate responseRedactions array
 */
function validateResponseRedactions(
    redactions: unknown[],
    errors: OverlayValidationError[],
    _warnings: OverlayValidationError[]
): void {
    redactions.forEach((redaction, index) => {
        const path = `responseRedactions[${index}]`;

        if (!redaction || typeof redaction !== 'object') {
            errors.push({
                path,
                message: 'Each response redaction must be an object',
                code: 'INVALID_TYPE',
            });
            return;
        }

        const redactionObj = redaction as Record<string, unknown>;

        // Check operationId
        if (!redactionObj.operationId) {
            errors.push({
                path: `${path}.operationId`,
                message: 'operationId is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (typeof redactionObj.operationId !== 'string') {
            errors.push({
                path: `${path}.operationId`,
                message: 'operationId must be a string',
                code: 'INVALID_TYPE',
            });
        }

        // Check statusCode (optional)
        if (redactionObj.statusCode !== undefined) {
            if (typeof redactionObj.statusCode !== 'number') {
                errors.push({
                    path: `${path}.statusCode`,
                    message: 'statusCode must be a number',
                    code: 'INVALID_TYPE',
                });
            } else if (redactionObj.statusCode < 100 || redactionObj.statusCode > 599) {
                errors.push({
                    path: `${path}.statusCode`,
                    message: 'statusCode must be between 100 and 599',
                    code: 'INVALID_VALUE',
                });
            }
        }

        // Check fields
        if (!redactionObj.fields) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (!Array.isArray(redactionObj.fields)) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields must be an array',
                code: 'INVALID_TYPE',
            });
        } else if (redactionObj.fields.length === 0) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields array cannot be empty',
                code: 'INVALID_VALUE',
            });
        } else {
            redactionObj.fields.forEach((field, fieldIndex) => {
                if (typeof field !== 'string' || field.length === 0) {
                    errors.push({
                        path: `${path}.fields[${fieldIndex}]`,
                        message: 'Each field must be a non-empty string',
                        code: 'INVALID_VALUE',
                    });
                }
            });
        }

        // Validate reason (optional)
        if (redactionObj.reason !== undefined && typeof redactionObj.reason !== 'string') {
            errors.push({
                path: `${path}.reason`,
                message: 'reason must be a string',
                code: 'INVALID_TYPE',
            });
        }
    });
}

/**
 * Validate requestRedactions array
 */
function validateRequestRedactions(
    redactions: unknown[],
    errors: OverlayValidationError[],
    _warnings: OverlayValidationError[]
): void {
    redactions.forEach((redaction, index) => {
        const path = `requestRedactions[${index}]`;

        if (!redaction || typeof redaction !== 'object') {
            errors.push({
                path,
                message: 'Each request redaction must be an object',
                code: 'INVALID_TYPE',
            });
            return;
        }

        const redactionObj = redaction as Record<string, unknown>;

        // Check operationId
        if (!redactionObj.operationId) {
            errors.push({
                path: `${path}.operationId`,
                message: 'operationId is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (typeof redactionObj.operationId !== 'string') {
            errors.push({
                path: `${path}.operationId`,
                message: 'operationId must be a string',
                code: 'INVALID_TYPE',
            });
        }

        // Check fields
        if (!redactionObj.fields) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields is required',
                code: 'REQUIRED_FIELD',
            });
        } else if (!Array.isArray(redactionObj.fields)) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields must be an array',
                code: 'INVALID_TYPE',
            });
        } else if (redactionObj.fields.length === 0) {
            errors.push({
                path: `${path}.fields`,
                message: 'fields array cannot be empty',
                code: 'INVALID_VALUE',
            });
        } else {
            redactionObj.fields.forEach((field, fieldIndex) => {
                if (typeof field !== 'string' || field.length === 0) {
                    errors.push({
                        path: `${path}.fields[${fieldIndex}]`,
                        message: 'Each field must be a non-empty string',
                        code: 'INVALID_VALUE',
                    });
                }
            });
        }

        // Validate reason (optional)
        if (redactionObj.reason !== undefined && typeof redactionObj.reason !== 'string') {
            errors.push({
                path: `${path}.reason`,
                message: 'reason must be a string',
                code: 'INVALID_TYPE',
            });
        }
    });
}

/**
 * Type guard to check if an object is a valid Overlay
 */
export function isOverlay(obj: unknown): obj is Overlay {
    const result = validateOverlay(obj);
    return result.valid;
}

/**
 * Format overlay validation errors into readable messages
 */
export function formatOverlayErrors(errors: OverlayValidationError[]): string {
    if (errors.length === 0) return '';

    return errors
        .map((e) => {
            const pathPrefix = e.path ? `[${e.path}] ` : '';
            return `${pathPrefix}${e.message}`;
        })
        .join('\n');
}
