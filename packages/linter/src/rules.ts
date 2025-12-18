/**
 * @acp/linter - Breaking change detection rules (v1)
 *
 * This module implements the v1 ruleset for detecting breaking changes
 * between two Contract IR documents.
 */

import type { ContractIR, HttpOperation, JsonSchemaObject, Ref } from '@acp/ir-spec';
import type { DiffFinding, DiffLocation, RuleId } from './types.js';

/**
 * Create a finding helper
 */
function createFinding(
    ruleId: RuleId,
    severity: 'breaking' | 'non-breaking',
    location: DiffLocation,
    message: string,
    recommendation?: string,
    previousValue?: unknown,
    currentValue?: unknown
): DiffFinding {
    return {
        ruleId,
        severity,
        location,
        message,
        ...(recommendation && { recommendation }),
        ...(previousValue !== undefined && { previousValue }),
        ...(currentValue !== undefined && { currentValue }),
    };
}

/**
 * Get operation key for matching (method + path)
 */
function getOperationKey(op: HttpOperation): string {
    return `${op.method.toUpperCase()}:${op.path}`;
}

/**
 * Build a map of operations by their key
 */
function buildOperationMap(operations: HttpOperation[]): Map<string, HttpOperation> {
    const map = new Map<string, HttpOperation>();
    for (const op of operations) {
        map.set(getOperationKey(op), op);
    }
    return map;
}

/**
 * BC001: Check for removed endpoints
 */
export function checkEndpointRemoved(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        if (!headOps.has(key)) {
            findings.push(
                createFinding(
                    'BC001_ENDPOINT_REMOVED',
                    'breaking',
                    {
                        method: baseOp.method,
                        path: baseOp.path,
                        operationId: baseOp.operationId,
                    },
                    `Endpoint ${baseOp.method} ${baseOp.path} (operationId: ${baseOp.operationId}) was removed`,
                    'If you need to remove this endpoint, consider deprecating it first and providing a migration path for consumers.',
                    { method: baseOp.method, path: baseOp.path, operationId: baseOp.operationId },
                    undefined
                )
            );
        }
    }

    return findings;
}

/**
 * BC002: Check for operationId changes
 */
export function checkOperationIdChanged(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        const headOp = headOps.get(key);

        if (headOp && headOp.operationId !== baseOp.operationId) {
            findings.push(
                createFinding(
                    'BC002_OPERATION_ID_CHANGED',
                    'breaking',
                    {
                        method: baseOp.method,
                        path: baseOp.path,
                        operationId: baseOp.operationId,
                    },
                    `operationId changed from "${baseOp.operationId}" to "${headOp.operationId}" for ${baseOp.method} ${baseOp.path}`,
                    'operationId is often used by code generators and client SDKs. Consider keeping the original operationId or versioning the API.',
                    baseOp.operationId,
                    headOp.operationId
                )
            );
        }
    }

    return findings;
}

/**
 * Get required fields from a schema
 */
function getRequiredFields(schema: JsonSchemaObject | { $ref: Ref } | undefined): Set<string> {
    if (!schema || '$ref' in schema) {
        return new Set();
    }
    return new Set(schema.required || []);
}

/**
 * Resolve a schema reference to the actual schema
 */
function resolveSchema(
    schemaOrRef: JsonSchemaObject | { $ref: Ref } | undefined,
    schemas: Record<string, JsonSchemaObject>
): JsonSchemaObject | undefined {
    if (!schemaOrRef) return undefined;
    if ('$ref' in schemaOrRef) {
        // Parse "schema:SomeName" format
        const ref = schemaOrRef.$ref as string;
        if (ref.startsWith('schema:')) {
            const schemaName = ref.substring(7);
            return schemas[schemaName];
        }
        return undefined;
    }
    return schemaOrRef;
}

/**
 * BC010: Check for required fields added to request
 */
export function checkRequestRequiredAdded(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        const headOp = headOps.get(key);
        if (!headOp) continue;

        // Check request body
        const baseSchema = resolveSchema(baseOp.requestBody?.schema, base.schemas);
        const headSchema = resolveSchema(headOp.requestBody?.schema, head.schemas);

        if (headSchema) {
            const baseRequired = getRequiredFields(baseSchema);
            const headRequired = getRequiredFields(headSchema);

            for (const field of headRequired) {
                if (!baseRequired.has(field)) {
                    findings.push(
                        createFinding(
                            'BC010_REQUEST_REQUIRED_ADDED',
                            'breaking',
                            {
                                method: baseOp.method,
                                path: baseOp.path,
                                operationId: baseOp.operationId,
                                jsonPath: `requestBody.schema.required`,
                            },
                            `Field "${field}" became required in request body for ${baseOp.method} ${baseOp.path}`,
                            'Making a field required is a breaking change for existing clients. Consider making it optional with a default value.',
                            Array.from(baseRequired),
                            Array.from(headRequired)
                        )
                    );
                }
            }
        }

        // Check query/path/header parameters
        const baseParams = new Map((baseOp.parameters || []).map((p) => [`${p.in}:${p.name}`, p]));
        const headParams = headOp.parameters || [];

        for (const headParam of headParams) {
            const paramKey = `${headParam.in}:${headParam.name}`;
            const baseParam = baseParams.get(paramKey);

            // New required parameter
            if (headParam.required && (!baseParam || !baseParam.required)) {
                const wasOptionalBefore = baseParam && !baseParam.required;
                findings.push(
                    createFinding(
                        'BC010_REQUEST_REQUIRED_ADDED',
                        'breaking',
                        {
                            method: baseOp.method,
                            path: baseOp.path,
                            operationId: baseOp.operationId,
                            jsonPath: `parameters[${headParam.in}:${headParam.name}].required`,
                        },
                        wasOptionalBefore
                            ? `Parameter "${headParam.name}" (${headParam.in}) became required for ${baseOp.method} ${baseOp.path}`
                            : `New required parameter "${headParam.name}" (${headParam.in}) added to ${baseOp.method} ${baseOp.path}`,
                        'Adding required parameters breaks existing clients. Consider making the parameter optional with a default value.',
                        baseParam?.required ?? false,
                        headParam.required
                    )
                );
            }
        }
    }

    return findings;
}

/**
 * BC011: Check for type narrowing
 * This is a simplified check for v1 - we check for obvious narrowing cases
 */
export function checkTypeNarrowed(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        const headOp = headOps.get(key);
        if (!headOp) continue;

        // Check request body schema
        const baseSchema = resolveSchema(baseOp.requestBody?.schema, base.schemas);
        const headSchema = resolveSchema(headOp.requestBody?.schema, head.schemas);

        if (baseSchema && headSchema) {
            const typeFindings = checkSchemaTypeNarrowing(
                baseSchema,
                headSchema,
                {
                    method: baseOp.method,
                    path: baseOp.path,
                    operationId: baseOp.operationId,
                },
                'requestBody.schema',
                'request'
            );
            findings.push(...typeFindings);
        }
    }

    return findings;
}

/**
 * Check for type narrowing in schemas
 */
function checkSchemaTypeNarrowing(
    baseSchema: JsonSchemaObject,
    headSchema: JsonSchemaObject,
    location: DiffLocation,
    jsonPath: string,
    context: 'request' | 'response'
): DiffFinding[] {
    const findings: DiffFinding[] = [];

    // Check type changes
    if (baseSchema.type && headSchema.type && baseSchema.type !== headSchema.type) {
        // For requests, narrowing input types is breaking
        // For responses, widening output types is breaking
        const isBreaking =
            context === 'request'
                ? true // Any type change in request could break clients
                : true; // Any type change in response could break clients

        if (isBreaking) {
            findings.push(
                createFinding(
                    'BC011_TYPE_NARROWED',
                    'breaking',
                    { ...location, jsonPath: `${jsonPath}.type` },
                    `Type changed from "${baseSchema.type}" to "${headSchema.type}" at ${jsonPath}`,
                    'Type changes can break existing clients. Consider creating a new version of the API.',
                    baseSchema.type,
                    headSchema.type
                )
            );
        }
    }

    // Check maxLength reduction (for request, this is breaking)
    if (
        context === 'request' &&
        typeof baseSchema.maxLength === 'number' &&
        typeof headSchema.maxLength === 'number' &&
        headSchema.maxLength < baseSchema.maxLength
    ) {
        findings.push(
            createFinding(
                'BC011_TYPE_NARROWED',
                'breaking',
                { ...location, jsonPath: `${jsonPath}.maxLength` },
                `maxLength reduced from ${baseSchema.maxLength} to ${headSchema.maxLength} at ${jsonPath}`,
                'Reducing maxLength can reject previously valid requests. Consider keeping the original limit.',
                baseSchema.maxLength,
                headSchema.maxLength
            )
        );
    }

    // Check minimum increased (for request, this is breaking)
    if (
        context === 'request' &&
        typeof baseSchema.minimum === 'number' &&
        typeof headSchema.minimum === 'number' &&
        headSchema.minimum > baseSchema.minimum
    ) {
        findings.push(
            createFinding(
                'BC011_TYPE_NARROWED',
                'breaking',
                { ...location, jsonPath: `${jsonPath}.minimum` },
                `minimum increased from ${baseSchema.minimum} to ${headSchema.minimum} at ${jsonPath}`,
                'Increasing minimum can reject previously valid requests. Consider keeping the original limit.',
                baseSchema.minimum,
                headSchema.minimum
            )
        );
    }

    // Check maximum decreased (for request, this is breaking)
    if (
        context === 'request' &&
        typeof baseSchema.maximum === 'number' &&
        typeof headSchema.maximum === 'number' &&
        headSchema.maximum < baseSchema.maximum
    ) {
        findings.push(
            createFinding(
                'BC011_TYPE_NARROWED',
                'breaking',
                { ...location, jsonPath: `${jsonPath}.maximum` },
                `maximum decreased from ${baseSchema.maximum} to ${headSchema.maximum} at ${jsonPath}`,
                'Decreasing maximum can reject previously valid requests. Consider keeping the original limit.',
                baseSchema.maximum,
                headSchema.maximum
            )
        );
    }

    // Check pattern added (for request, this is breaking)
    if (context === 'request' && !baseSchema.pattern && headSchema.pattern) {
        findings.push(
            createFinding(
                'BC011_TYPE_NARROWED',
                'breaking',
                { ...location, jsonPath: `${jsonPath}.pattern` },
                `New pattern constraint "${headSchema.pattern}" added at ${jsonPath}`,
                'Adding a pattern can reject previously valid requests. Consider making it optional or providing a migration path.',
                undefined,
                headSchema.pattern
            )
        );
    }

    // Recursively check properties
    if (baseSchema.properties && headSchema.properties) {
        for (const propName of Object.keys(headSchema.properties)) {
            const baseProp = baseSchema.properties[propName];
            const headProp = headSchema.properties[propName];

            if (baseProp && headProp && !('$ref' in baseProp) && !('$ref' in headProp)) {
                const propFindings = checkSchemaTypeNarrowing(
                    baseProp,
                    headProp,
                    location,
                    `${jsonPath}.properties.${propName}`,
                    context
                );
                findings.push(...propFindings);
            }
        }
    }

    return findings;
}

/**
 * BC012: Check for enum values removed
 */
export function checkEnumNarrowed(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        const headOp = headOps.get(key);
        if (!headOp) continue;

        // Check request body schema
        const baseSchema = resolveSchema(baseOp.requestBody?.schema, base.schemas);
        const headSchema = resolveSchema(headOp.requestBody?.schema, head.schemas);

        if (baseSchema && headSchema) {
            const enumFindings = checkSchemaEnumNarrowing(
                baseSchema,
                headSchema,
                {
                    method: baseOp.method,
                    path: baseOp.path,
                    operationId: baseOp.operationId,
                },
                'requestBody.schema'
            );
            findings.push(...enumFindings);
        }

        // Check response schemas
        const baseResponses = new Map(baseOp.responses.map((r) => [r.statusCode, r]));
        for (const headResponse of headOp.responses) {
            const baseResponse = baseResponses.get(headResponse.statusCode);
            if (!baseResponse) continue;

            const baseRespSchema = resolveSchema(baseResponse.schema, base.schemas);
            const headRespSchema = resolveSchema(headResponse.schema, head.schemas);

            if (baseRespSchema && headRespSchema) {
                const enumFindings = checkSchemaEnumNarrowing(
                    baseRespSchema,
                    headRespSchema,
                    {
                        method: baseOp.method,
                        path: baseOp.path,
                        operationId: baseOp.operationId,
                    },
                    `responses.${headResponse.statusCode}.schema`
                );
                findings.push(...enumFindings);
            }
        }
    }

    return findings;
}

/**
 * Check for enum narrowing in schemas
 */
function checkSchemaEnumNarrowing(
    baseSchema: JsonSchemaObject,
    headSchema: JsonSchemaObject,
    location: DiffLocation,
    jsonPath: string
): DiffFinding[] {
    const findings: DiffFinding[] = [];

    // Check enum values removed
    if (baseSchema.enum && headSchema.enum) {
        const baseEnumSet = new Set(baseSchema.enum.map((v) => JSON.stringify(v)));
        const removedValues: unknown[] = [];

        for (const value of baseSchema.enum) {
            if (!baseEnumSet.has(JSON.stringify(value))) continue;
            const headEnumSet = new Set(headSchema.enum.map((v) => JSON.stringify(v)));
            if (!headEnumSet.has(JSON.stringify(value))) {
                removedValues.push(value);
            }
        }

        if (removedValues.length > 0) {
            findings.push(
                createFinding(
                    'BC012_ENUM_NARROWED',
                    'breaking',
                    { ...location, jsonPath: `${jsonPath}.enum` },
                    `Enum values removed at ${jsonPath}: ${removedValues.map((v) => JSON.stringify(v)).join(', ')}`,
                    'Removing enum values can break clients sending those values. Consider deprecating values instead.',
                    baseSchema.enum,
                    headSchema.enum
                )
            );
        }
    }

    // Recursively check properties
    if (baseSchema.properties && headSchema.properties) {
        for (const propName of Object.keys(baseSchema.properties)) {
            const baseProp = baseSchema.properties[propName];
            const headProp = headSchema.properties[propName];

            if (baseProp && headProp && !('$ref' in baseProp) && !('$ref' in headProp)) {
                const propFindings = checkSchemaEnumNarrowing(
                    baseProp,
                    headProp,
                    location,
                    `${jsonPath}.properties.${propName}`
                );
                findings.push(...propFindings);
            }
        }
    }

    return findings;
}

/**
 * BC020: Check for response status codes removed
 */
export function checkResponseStatusRemoved(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        const headOp = headOps.get(key);
        if (!headOp) continue;

        const headStatusCodes = new Set(headOp.responses.map((r) => r.statusCode));

        for (const baseResponse of baseOp.responses) {
            if (!headStatusCodes.has(baseResponse.statusCode)) {
                findings.push(
                    createFinding(
                        'BC020_RESPONSE_STATUS_REMOVED',
                        'breaking',
                        {
                            method: baseOp.method,
                            path: baseOp.path,
                            operationId: baseOp.operationId,
                            jsonPath: `responses.${baseResponse.statusCode}`,
                        },
                        `Response status code ${baseResponse.statusCode} was removed from ${baseOp.method} ${baseOp.path}`,
                        'Removing documented response status codes can break clients that handle those statuses. Consider keeping the status code documented.',
                        baseResponse.statusCode,
                        undefined
                    )
                );
            }
        }
    }

    return findings;
}

/**
 * BC021: Check for response schema narrowing
 */
export function checkResponseSchemaNarrowed(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        const headOp = headOps.get(key);
        if (!headOp) continue;

        const baseResponses = new Map(baseOp.responses.map((r) => [r.statusCode, r]));

        for (const headResponse of headOp.responses) {
            const baseResponse = baseResponses.get(headResponse.statusCode);
            if (!baseResponse) continue;

            const baseSchema = resolveSchema(baseResponse.schema, base.schemas);
            const headSchema = resolveSchema(headResponse.schema, head.schemas);

            if (baseSchema && headSchema) {
                // Check for removed properties in response
                const removedProps = checkRemovedProperties(baseSchema, headSchema);
                for (const propPath of removedProps) {
                    findings.push(
                        createFinding(
                            'BC021_RESPONSE_SCHEMA_NARROWED',
                            'breaking',
                            {
                                method: baseOp.method,
                                path: baseOp.path,
                                operationId: baseOp.operationId,
                                jsonPath: `responses.${headResponse.statusCode}.schema.${propPath}`,
                            },
                            `Property "${propPath}" was removed from response schema for ${baseOp.method} ${baseOp.path} (status ${headResponse.statusCode})`,
                            'Removing response properties can break clients that depend on them. Consider deprecating properties instead.',
                            propPath,
                            undefined
                        )
                    );
                }
            }
        }
    }

    return findings;
}

/**
 * Check for removed properties in schema
 */
function checkRemovedProperties(
    baseSchema: JsonSchemaObject,
    headSchema: JsonSchemaObject,
    prefix = ''
): string[] {
    const removed: string[] = [];

    if (baseSchema.properties) {
        const headProps = new Set(Object.keys(headSchema.properties || {}));

        for (const propName of Object.keys(baseSchema.properties)) {
            const fullPath = prefix ? `${prefix}.${propName}` : propName;

            if (!headProps.has(propName)) {
                removed.push(fullPath);
            } else {
                // Recursively check nested properties
                const baseProp = baseSchema.properties[propName];
                const headProp = headSchema.properties![propName];

                if (baseProp && headProp && !('$ref' in baseProp) && !('$ref' in headProp)) {
                    removed.push(...checkRemovedProperties(baseProp, headProp, fullPath));
                }
            }
        }
    }

    return removed;
}

/**
 * NC001: Check for description changes (non-breaking)
 */
export function checkDescriptionChanged(base: ContractIR, head: ContractIR): DiffFinding[] {
    const findings: DiffFinding[] = [];
    const headOps = buildOperationMap(head.operations);

    for (const baseOp of base.operations) {
        const key = getOperationKey(baseOp);
        const headOp = headOps.get(key);
        if (!headOp) continue;

        // Check summary change
        if (baseOp.summary !== headOp.summary && (baseOp.summary || headOp.summary)) {
            findings.push(
                createFinding(
                    'NC001_DESCRIPTION_CHANGED',
                    'non-breaking',
                    {
                        method: baseOp.method,
                        path: baseOp.path,
                        operationId: baseOp.operationId,
                        jsonPath: 'summary',
                    },
                    `Summary changed for ${baseOp.method} ${baseOp.path}`,
                    undefined,
                    baseOp.summary,
                    headOp.summary
                )
            );
        }

        // Check description change
        if (baseOp.description !== headOp.description && (baseOp.description || headOp.description)) {
            findings.push(
                createFinding(
                    'NC001_DESCRIPTION_CHANGED',
                    'non-breaking',
                    {
                        method: baseOp.method,
                        path: baseOp.path,
                        operationId: baseOp.operationId,
                        jsonPath: 'description',
                    },
                    `Description changed for ${baseOp.method} ${baseOp.path}`,
                    undefined,
                    baseOp.description,
                    headOp.description
                )
            );
        }

        // Check tags change
        const baseTags = JSON.stringify(baseOp.tags || []);
        const headTags = JSON.stringify(headOp.tags || []);
        if (baseTags !== headTags) {
            findings.push(
                createFinding(
                    'NC001_DESCRIPTION_CHANGED',
                    'non-breaking',
                    {
                        method: baseOp.method,
                        path: baseOp.path,
                        operationId: baseOp.operationId,
                        jsonPath: 'tags',
                    },
                    `Tags changed for ${baseOp.method} ${baseOp.path}`,
                    undefined,
                    baseOp.tags,
                    headOp.tags
                )
            );
        }
    }

    return findings;
}

/**
 * All v1 rule checkers
 */
export const v1Rules = [
    checkEndpointRemoved,
    checkOperationIdChanged,
    checkRequestRequiredAdded,
    checkTypeNarrowed,
    checkEnumNarrowed,
    checkResponseStatusRemoved,
    checkResponseSchemaNarrowed,
    checkDescriptionChanged,
];
