/**
 * Schema Walker Utility
 *
 * Provides safe traversal of JSON schemas with cycle detection and max depth limits.
 * Used across the ACP platform to prevent stack overflows and infinite loops
 * when processing schemas with $ref cycles or deep nesting.
 */

import type { JsonSchemaObject, Ref } from './types.js';

/**
 * Default maximum depth for schema traversal
 */
export const DEFAULT_MAX_DEPTH = 100;

/**
 * Error thrown when a cycle is detected in schema traversal
 */
export class SchemaCycleError extends Error {
    constructor(
        public readonly schemaPath: string[],
        public readonly cyclePath: string,
        public readonly operationId?: string
    ) {
        const opContext = operationId ? ` in operation '${operationId}'` : '';
        const pathStr = schemaPath.join(' -> ');
        super(
            `Cycle detected${opContext}: ${pathStr} -> ${cyclePath}. ` +
            `Consider using $ref to break the cycle or restructure the schema.`
        );
        this.name = 'SchemaCycleError';
    }
}

/**
 * Error thrown when max depth is exceeded during traversal
 */
export class SchemaDepthError extends Error {
    constructor(
        public readonly maxDepth: number,
        public readonly schemaPath: string[],
        public readonly operationId?: string
    ) {
        const opContext = operationId ? ` in operation '${operationId}'` : '';
        const pathStr = schemaPath.slice(-5).join(' -> ');
        super(
            `Maximum schema depth (${maxDepth}) exceeded${opContext} at path: ...${pathStr}. ` +
            `Consider using $ref to flatten the schema structure.`
        );
        this.name = 'SchemaDepthError';
    }
}

/**
 * Result of schema resolution
 */
export interface ResolvedSchema {
    /** The resolved schema (or undefined if ref not found) */
    schema: JsonSchemaObject | undefined;
    /** Whether this was resolved via $ref */
    wasRef: boolean;
    /** The ref path if wasRef is true */
    refPath?: string;
}

/**
 * Options for the schema walker
 */
export interface SchemaWalkerOptions {
    /** Maximum traversal depth (default: 100) */
    maxDepth?: number;
    /** Callback when a $ref is encountered */
    onRef?: (ref: string, depth: number, path: string[]) => void;
    /** Callback when entering a schema node */
    onEnter?: (schema: JsonSchemaObject, depth: number, path: string[]) => void;
    /** Callback when exiting a schema node */
    onExit?: (schema: JsonSchemaObject, depth: number, path: string[]) => void;
    /** Operation ID for error context */
    operationId?: string;
    /** Whether to throw on cycles (default: true) */
    throwOnCycle?: boolean;
    /** Whether to throw on max depth (default: true) */
    throwOnMaxDepth?: boolean;
}

/**
 * Context passed to walker callbacks
 */
export interface WalkerContext {
    /** Current traversal depth */
    depth: number;
    /** Current path as array of keys */
    path: string[];
    /** Set of visited object references (for cycle detection) */
    visitedObjects: WeakSet<object>;
    /** Set of visited $ref strings in current path (for ref cycle detection) */
    visitedRefs: Set<string>;
    /** Operation ID for error context */
    operationId?: string;
    /** Stop traversal flag */
    stop: boolean;
}

/**
 * Schema visitor function type
 */
export type SchemaVisitor = (
    schema: JsonSchemaObject | { $ref: Ref } | { $ref: string },
    context: WalkerContext
) => void;

/**
 * Create a schema walker for traversing JSON schemas safely
 *
 * @param schemas - Map of schema definitions (for resolving $refs)
 * @param options - Walker options
 * @returns A walker function that can traverse any schema
 *
 * @example
 * ```ts
 * const walker = createSchemaWalker(contract.schemas, {
 *   maxDepth: 50,
 *   operationId: 'createOrder',
 *   onRef: (ref, depth, path) => {
 *     console.log(`Found ref ${ref} at depth ${depth}`);
 *   },
 * });
 *
 * walker(mySchema, (schema, ctx) => {
 *   console.log(`Visiting schema at ${ctx.path.join('.')}`);
 * });
 * ```
 */
export function createSchemaWalker(
    schemas: Record<string, JsonSchemaObject>,
    options: SchemaWalkerOptions = {}
): (schema: JsonSchemaObject | { $ref: Ref } | { $ref: string }, visitor: SchemaVisitor) => void {
    const {
        maxDepth = DEFAULT_MAX_DEPTH,
        onRef,
        onEnter,
        onExit,
        operationId,
        throwOnCycle = true,
        throwOnMaxDepth = true,
    } = options;

    function walk(
        schema: JsonSchemaObject | { $ref: Ref } | { $ref: string },
        visitor: SchemaVisitor,
        context: WalkerContext
    ): void {
        if (context.stop) return;

        // Check max depth
        if (context.depth > maxDepth) {
            if (throwOnMaxDepth) {
                throw new SchemaDepthError(maxDepth, context.path, operationId);
            }
            return;
        }

        // Handle $ref
        if ('$ref' in schema && typeof schema.$ref === 'string') {
            const ref = schema.$ref;
            onRef?.(ref, context.depth, context.path);

            // Check for ref cycle
            if (context.visitedRefs.has(ref)) {
                if (throwOnCycle) {
                    throw new SchemaCycleError([...context.path], ref, operationId);
                }
                return;
            }

            // Resolve ref and continue (only for schema: refs)
            if (ref.startsWith('schema:')) {
                const schemaId = ref.slice(7);
                const resolved = schemas[schemaId];
                if (resolved) {
                    const newContext: WalkerContext = {
                        ...context,
                        depth: context.depth + 1,
                        path: [...context.path, `$ref(${schemaId})`],
                        visitedRefs: new Set(context.visitedRefs).add(ref),
                        // Use a fresh visitedObjects for resolved refs - ref tracking handles cycles
                        visitedObjects: new WeakSet(),
                    };
                    walk(resolved, visitor, newContext);
                }
            }

            // Visit the ref node itself
            visitor(schema, context);
            return;
        }

        const schemaObj = schema as JsonSchemaObject;

        // Check for object cycle (same object instance)
        if (context.visitedObjects.has(schemaObj)) {
            if (throwOnCycle) {
                throw new SchemaCycleError(context.path, '(circular object reference)', operationId);
            }
            return;
        }

        // Mark as visited (WeakSet is mutated in place, no copying needed)
        context.visitedObjects.add(schemaObj);

        const newContext: WalkerContext = {
            ...context,
        };

        // Call enter callback
        onEnter?.(schemaObj, context.depth, context.path);

        // Visit this node
        visitor(schemaObj, newContext);

        if (newContext.stop) {
            context.stop = true;
            return;
        }

        // Traverse properties
        if (schemaObj.properties) {
            const sortedKeys = Object.keys(schemaObj.properties).sort();
            for (const key of sortedKeys) {
                const prop = schemaObj.properties[key];
                if (prop && typeof prop === 'object') {
                    walk(prop as JsonSchemaObject | { $ref: Ref }, visitor, {
                        ...newContext,
                        depth: context.depth + 1,
                        path: [...context.path, `properties.${key}`],
                    });
                    if (newContext.stop) break;
                }
            }
        }

        // Traverse items
        if (schemaObj.items && typeof schemaObj.items === 'object') {
            walk(schemaObj.items as JsonSchemaObject | { $ref: Ref }, visitor, {
                ...newContext,
                depth: context.depth + 1,
                path: [...context.path, 'items'],
            });
        }

        // Traverse additionalProperties
        if (schemaObj.additionalProperties && typeof schemaObj.additionalProperties === 'object') {
            walk(schemaObj.additionalProperties as JsonSchemaObject, visitor, {
                ...newContext,
                depth: context.depth + 1,
                path: [...context.path, 'additionalProperties'],
            });
        }

        // Traverse oneOf/anyOf/allOf
        for (const combiner of ['oneOf', 'anyOf', 'allOf'] as const) {
            const combinerValue = schemaObj[combiner];
            if (Array.isArray(combinerValue)) {
                combinerValue.forEach((sub, index) => {
                    if (sub && typeof sub === 'object') {
                        walk(sub as JsonSchemaObject | { $ref: Ref }, visitor, {
                            ...newContext,
                            depth: context.depth + 1,
                            path: [...context.path, `${combiner}[${index}]`],
                        });
                    }
                });
            }
        }

        // Call exit callback
        onExit?.(schemaObj, context.depth, context.path);
    }

    return (
        schema: JsonSchemaObject | { $ref: Ref } | { $ref: string },
        visitor: SchemaVisitor
    ): void => {
        const context: WalkerContext = {
            depth: 0,
            path: ['$'],
            visitedObjects: new WeakSet(),
            visitedRefs: new Set(),
            operationId,
            stop: false,
        };
        walk(schema, visitor, context);
    };
}

/**
 * Resolve a schema reference
 *
 * @param schemaOrRef - Schema or $ref object
 * @param schemas - Map of all schemas
 * @returns Resolved schema information
 */
export function resolveSchemaRef(
    schemaOrRef: JsonSchemaObject | { $ref: Ref } | { $ref: string } | undefined,
    schemas: Record<string, JsonSchemaObject>
): ResolvedSchema {
    if (!schemaOrRef) {
        return { schema: undefined, wasRef: false };
    }

    if ('$ref' in schemaOrRef && typeof schemaOrRef.$ref === 'string') {
        const ref = schemaOrRef.$ref;
        if (ref.startsWith('schema:')) {
            const schemaId = ref.slice(7);
            return {
                schema: schemas[schemaId],
                wasRef: true,
                refPath: ref,
            };
        }
        return { schema: undefined, wasRef: true, refPath: ref };
    }

    return { schema: schemaOrRef as JsonSchemaObject, wasRef: false };
}

/**
 * Check if a schema contains cycles (via $ref or object identity)
 *
 * @param schema - Schema to check
 * @param schemas - Map of all schemas
 * @param operationId - Optional operation ID for error context
 * @returns Object with hasCycle boolean and optional error details
 */
export function checkSchemaCycles(
    schema: JsonSchemaObject | { $ref: Ref } | { $ref: string },
    schemas: Record<string, JsonSchemaObject>,
    operationId?: string
): { hasCycle: boolean; cyclePath?: string; error?: SchemaCycleError } {
    // Use throwOnCycle: true so the walker throws when it finds a cycle
    const walker = createSchemaWalker(schemas, {
        operationId,
        throwOnCycle: true,
        throwOnMaxDepth: false,
        maxDepth: 1000, // High limit just for cycle checking
    });

    try {
        walker(schema, () => {
            // Just traverse, walker will throw on cycle
        });
    } catch (e) {
        if (e instanceof SchemaCycleError) {
            return { hasCycle: true, cyclePath: e.cyclePath, error: e };
        }
        throw e;
    }

    return { hasCycle: false };
}

/**
 * Get all schema references from a schema (non-recursive, just immediate refs)
 *
 * @param schema - Schema to extract refs from
 * @returns Array of ref strings found
 */
export function extractSchemaRefs(
    schema: JsonSchemaObject | { $ref: Ref } | { $ref: string }
): string[] {
    const refs: string[] = [];

    if ('$ref' in schema && typeof schema.$ref === 'string') {
        refs.push(schema.$ref);
        return refs;
    }

    const schemaObj = schema as JsonSchemaObject;

    // Check properties
    if (schemaObj.properties) {
        for (const prop of Object.values(schemaObj.properties)) {
            if (prop && '$ref' in prop && typeof prop.$ref === 'string') {
                refs.push(prop.$ref);
            }
        }
    }

    // Check items
    if (schemaObj.items && '$ref' in schemaObj.items && typeof schemaObj.items.$ref === 'string') {
        refs.push(schemaObj.items.$ref);
    }

    // Check additionalProperties
    if (
        schemaObj.additionalProperties &&
        typeof schemaObj.additionalProperties === 'object' &&
        '$ref' in schemaObj.additionalProperties &&
        typeof schemaObj.additionalProperties.$ref === 'string'
    ) {
        refs.push(schemaObj.additionalProperties.$ref);
    }

    // Check oneOf/anyOf/allOf
    for (const combiner of ['oneOf', 'anyOf', 'allOf'] as const) {
        const combinerValue = schemaObj[combiner];
        if (Array.isArray(combinerValue)) {
            for (const sub of combinerValue) {
                if (sub && '$ref' in sub && typeof sub.$ref === 'string') {
                    refs.push(sub.$ref);
                }
            }
        }
    }

    return refs;
}
