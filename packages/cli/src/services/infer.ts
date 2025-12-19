/**
 * Contract Inference Service
 *
 * Generates a draft Contract IR from evidence NDJSON.
 * Groups events by operationId, infers schemas from JSON samples.
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { EvidenceEvent } from '@docsmyth/evidence-sdk';
import type {
    ContractIR,
    HttpOperation,
    HttpResponse,
    JsonSchemaObject,
    HttpMethod,
    HttpParameter,
} from '@docsmyth/ir-spec';
import {
    normalizePath,
    generateOperationId,
    inferSemanticOperationId,
} from './path-normalizer.js';

/**
 * Options for contract inference
 */
export interface InferOptions {
    /** Path to evidence NDJSON file */
    evidencePath: string;
    /** Service name for the contract */
    serviceName: string;
    /** Service version */
    serviceVersion: string;
    /** Use semantic operationIds (listUsers vs "GET /users") */
    semanticOperationIds?: boolean;
}

/**
 * Grouped evidence for an operation
 */
interface OperationEvidence {
    operationId: string;
    method: string;
    pathTemplate: string;
    requests: Array<{
        body?: unknown;
        query?: Record<string, unknown>;
        params?: Record<string, string>;
    }>;
    responses: Map<number, unknown[]>; // status -> response bodies
}

/**
 * Read and parse evidence NDJSON file
 */
async function readEvidence(evidencePath: string): Promise<EvidenceEvent[]> {
    if (!existsSync(evidencePath)) {
        throw new Error(`Evidence file not found: ${evidencePath}`);
    }

    const events: EvidenceEvent[] = [];
    const fileStream = createReadStream(evidencePath, 'utf-8');
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

    let lineNumber = 0;
    for await (const line of rl) {
        lineNumber++;
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
            const event = JSON.parse(trimmed) as EvidenceEvent;
            events.push(event);
        } catch (e) {
            console.warn(`Skipping invalid JSON at line ${lineNumber}: ${e}`);
        }
    }

    return events;
}

/**
 * Group evidence events by inferred operation
 */
function groupByOperation(events: EvidenceEvent[], semanticOperationIds: boolean): Map<string, OperationEvidence> {
    const groups = new Map<string, OperationEvidence>();

    for (const event of events) {
        const method = event.request.method.toUpperCase();
        const path = event.request.path;

        // Normalize the path to get template
        const normalized = normalizePath(path);
        const pathTemplate = normalized.template;

        // Generate operationId
        let operationId: string;
        if (event.operationId && !event.operationId.startsWith('_') && !event.operationId.includes(' ')) {
            // Use existing operationId if valid
            operationId = event.operationId;
        } else if (semanticOperationIds) {
            operationId = inferSemanticOperationId(method, pathTemplate);
        } else {
            operationId = generateOperationId(method, pathTemplate);
        }

        // Create unique key
        const key = `${method} ${pathTemplate}`;

        if (!groups.has(key)) {
            groups.set(key, {
                operationId,
                method,
                pathTemplate,
                requests: [],
                responses: new Map(),
            });
        }

        const group = groups.get(key)!;

        // Collect request data
        group.requests.push({
            body: event.request.body,
            query: event.request.query,
            params: normalized.params,
        });

        // Collect response data by status
        const status = event.response.status;
        if (!group.responses.has(status)) {
            group.responses.set(status, []);
        }
        if (event.response.body !== undefined) {
            group.responses.get(status)!.push(event.response.body);
        }
    }

    return groups;
}

/**
 * Infer JSON Schema from a single value
 */
function inferSchemaFromValue(value: unknown): JsonSchemaObject {
    if (value === null) {
        return { type: 'null' };
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return {
                type: 'array',
                items: {},
            };
        }
        // Infer items schema from first few elements
        const itemSchemas = value.slice(0, 5).map(inferSchemaFromValue);
        const mergedItems = mergeSchemas(itemSchemas);
        return {
            type: 'array',
            items: mergedItems,
        };
    }

    if (typeof value === 'object') {
        const properties: Record<string, JsonSchemaObject> = {};
        const required: string[] = [];

        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            properties[key] = inferSchemaFromValue(val);
            required.push(key);
        }

        return {
            type: 'object',
            properties,
            required: required.length > 0 ? required : undefined,
            additionalProperties: true,
        };
    }

    if (typeof value === 'string') {
        // Detect common formats
        if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
            return { type: 'string', format: 'date-time' };
        }
        if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
            return { type: 'string', format: 'email' };
        }
        if (/^https?:\/\//.test(value)) {
            return { type: 'string', format: 'uri' };
        }
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
            return { type: 'string', format: 'uuid' };
        }
        return { type: 'string' };
    }

    if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            return { type: 'integer' };
        }
        return { type: 'number' };
    }

    if (typeof value === 'boolean') {
        return { type: 'boolean' };
    }

    return {};
}

/**
 * Merge multiple schemas into one (union of properties)
 */
function mergeSchemas(schemas: JsonSchemaObject[]): JsonSchemaObject {
    if (schemas.length === 0) {
        return {};
    }

    if (schemas.length === 1) {
        return schemas[0];
    }

    // Check if all schemas have the same type
    const types = new Set(schemas.map((s) => s.type));

    if (types.size === 1) {
        const type = schemas[0].type;

        if (type === 'object') {
            // Merge object properties
            const allProperties = new Map<string, JsonSchemaObject[]>();
            const propertyPresence = new Map<string, number>();

            for (const schema of schemas) {
                if (schema.properties) {
                    for (const [key, prop] of Object.entries(schema.properties)) {
                        if (!allProperties.has(key)) {
                            allProperties.set(key, []);
                            propertyPresence.set(key, 0);
                        }
                        allProperties.get(key)!.push(prop as JsonSchemaObject);
                        propertyPresence.set(key, (propertyPresence.get(key) || 0) + 1);
                    }
                }
            }

            const mergedProperties: Record<string, JsonSchemaObject> = {};
            const required: string[] = [];

            for (const [key, props] of allProperties) {
                mergedProperties[key] = mergeSchemas(props);
                // Only required if present in ALL samples
                if (propertyPresence.get(key) === schemas.length) {
                    required.push(key);
                }
            }

            return {
                type: 'object',
                properties: mergedProperties,
                required: required.length > 0 ? required : undefined,
                additionalProperties: true,
            };
        }

        if (type === 'array') {
            // Merge array item schemas
            const itemSchemas = schemas
                .filter((s) => s.items && typeof s.items === 'object')
                .map((s) => s.items as JsonSchemaObject);

            return {
                type: 'array',
                items: itemSchemas.length > 0 ? mergeSchemas(itemSchemas) : {},
            };
        }
    }

    // Mixed types - just return a permissive schema
    return {
        additionalProperties: true,
    };
}

/**
 * Extract path parameters from a path template
 */
function extractPathParams(pathTemplate: string): HttpParameter[] {
    const params: HttpParameter[] = [];
    const regex = /\{([^}]+)\}/g;
    let match;

    while ((match = regex.exec(pathTemplate)) !== null) {
        params.push({
            name: match[1],
            in: 'path',
            required: true,
            schema: { type: 'string' },
        });
    }

    return params;
}

/**
 * Infer a Contract IR from evidence events
 */
export async function inferContract(options: InferOptions): Promise<ContractIR> {
    const { evidencePath, serviceName, serviceVersion, semanticOperationIds = true } = options;

    // Read evidence
    const events = await readEvidence(evidencePath);

    // If no events, return minimal valid contract
    if (events.length === 0) {
        return {
            irVersion: '0.1',
            service: {
                name: serviceName,
                version: serviceVersion,
            },
            schemas: {},
            operations: [],
        };
    }

    // Group by operation
    const groups = groupByOperation(events, semanticOperationIds);

    // Build operations and collect schemas
    const operations: HttpOperation[] = [];
    const schemas: Record<string, JsonSchemaObject> = {};
    const usedOperationIds = new Set<string>();

    for (const [, group] of groups) {
        let { operationId } = group;

        // Ensure unique operationId
        let uniqueId = operationId;
        let counter = 1;
        while (usedOperationIds.has(uniqueId)) {
            uniqueId = `${operationId}${counter}`;
            counter++;
        }
        operationId = uniqueId;
        usedOperationIds.add(operationId);

        // Infer request body schema
        let requestBodySchema: JsonSchemaObject | undefined;
        const requestBodies = group.requests
            .map((r) => r.body)
            .filter((b) => b !== undefined && b !== null);

        if (requestBodies.length > 0) {
            const bodySchemas = requestBodies.map(inferSchemaFromValue);
            requestBodySchema = mergeSchemas(bodySchemas);

            // Store in schemas if it's an object
            if (requestBodySchema.type === 'object') {
                const schemaName = `${operationId}Request`;
                schemas[schemaName] = { $id: schemaName, ...requestBodySchema };
            }
        }

        // Infer response schemas
        const responses: HttpResponse[] = [];
        for (const [status, bodies] of group.responses) {
            const bodySchemas = bodies.map(inferSchemaFromValue);
            const mergedSchema = mergeSchemas(bodySchemas);

            // Store named schema for complex responses
            let responseSchema: { $ref: `schema:${string}` } | JsonSchemaObject;
            if (mergedSchema.type === 'object' || mergedSchema.type === 'array') {
                const schemaName = `${operationId}Response${status}`;
                schemas[schemaName] = { $id: schemaName, ...mergedSchema };
                responseSchema = { $ref: `schema:${schemaName}` };
            } else {
                responseSchema = mergedSchema;
            }

            responses.push({
                statusCode: status,
                contentType: 'application/json',
                schema: responseSchema,
            });
        }

        // Sort responses by status code
        responses.sort((a, b) => a.statusCode - b.statusCode);

        // Extract path parameters
        const pathParams = extractPathParams(group.pathTemplate);

        // Build operation
        const operation: HttpOperation = {
            operationId,
            method: group.method as HttpMethod,
            path: group.pathTemplate,
            parameters: pathParams.length > 0 ? pathParams : undefined,
            responses: responses.length > 0 ? responses : [{ statusCode: 200 }],
        };

        // Add request body if present
        if (requestBodySchema) {
            const schemaName = `${operationId}Request`;
            operation.requestBody = {
                required: true,
                contentType: 'application/json',
                schema: schemas[schemaName] ? { $ref: `schema:${schemaName}` } : requestBodySchema,
            };
        }

        operations.push(operation);
    }

    // Sort operations by path then method
    operations.sort((a, b) => {
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        return a.method.localeCompare(b.method);
    });

    // Build contract
    const contract: ContractIR = {
        irVersion: '0.1',
        service: {
            name: serviceName,
            version: serviceVersion,
        },
        schemas,
        operations,
    };

    return contract;
}

/**
 * Infer contract from in-memory evidence events
 * (Used by studio for live inference)
 */
export function inferContractFromEvents(
    events: EvidenceEvent[],
    serviceName: string = 'inferred-service',
    serviceVersion: string = '0.0.1'
): ContractIR {
    if (events.length === 0) {
        return {
            irVersion: '0.1',
            service: { name: serviceName, version: serviceVersion },
            schemas: {},
            operations: [],
        };
    }

    const groups = groupByOperation(events, true);

    const operations: HttpOperation[] = [];
    const schemas: Record<string, JsonSchemaObject> = {};
    const usedOperationIds = new Set<string>();

    for (const [, group] of groups) {
        let { operationId } = group;

        let uniqueId = operationId;
        let counter = 1;
        while (usedOperationIds.has(uniqueId)) {
            uniqueId = `${operationId}${counter}`;
            counter++;
        }
        operationId = uniqueId;
        usedOperationIds.add(operationId);

        let requestBodySchema: JsonSchemaObject | undefined;
        const requestBodies = group.requests
            .map((r) => r.body)
            .filter((b) => b !== undefined && b !== null);

        if (requestBodies.length > 0) {
            const bodySchemas = requestBodies.map(inferSchemaFromValue);
            requestBodySchema = mergeSchemas(bodySchemas);
            if (requestBodySchema.type === 'object') {
                const schemaName = `${operationId}Request`;
                schemas[schemaName] = { $id: schemaName, ...requestBodySchema };
            }
        }

        const responses: HttpResponse[] = [];
        for (const [status, bodies] of group.responses) {
            const bodySchemas = bodies.map(inferSchemaFromValue);
            const mergedSchema = mergeSchemas(bodySchemas);

            let responseSchema: { $ref: `schema:${string}` } | JsonSchemaObject;
            if (mergedSchema.type === 'object' || mergedSchema.type === 'array') {
                const schemaName = `${operationId}Response${status}`;
                schemas[schemaName] = { $id: schemaName, ...mergedSchema };
                responseSchema = { $ref: `schema:${schemaName}` };
            } else {
                responseSchema = mergedSchema;
            }

            responses.push({
                statusCode: status,
                contentType: 'application/json',
                schema: responseSchema,
            });
        }

        responses.sort((a, b) => a.statusCode - b.statusCode);

        const pathParams = extractPathParams(group.pathTemplate);

        const operation: HttpOperation = {
            operationId,
            method: group.method as HttpMethod,
            path: group.pathTemplate,
            parameters: pathParams.length > 0 ? pathParams : undefined,
            responses: responses.length > 0 ? responses : [{ statusCode: 200 }],
        };

        if (requestBodySchema) {
            const schemaName = `${operationId}Request`;
            operation.requestBody = {
                required: true,
                contentType: 'application/json',
                schema: schemas[schemaName] ? { $ref: `schema:${schemaName}` } : requestBodySchema,
            };
        }

        operations.push(operation);
    }

    operations.sort((a, b) => {
        const pathCompare = a.path.localeCompare(b.path);
        if (pathCompare !== 0) return pathCompare;
        return a.method.localeCompare(b.method);
    });

    return {
        irVersion: '0.1',
        service: { name: serviceName, version: serviceVersion },
        schemas,
        operations,
    };
}
