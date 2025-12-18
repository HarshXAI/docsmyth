/**
 * Schema Walker Tests
 *
 * Tests for the schema walker utility including cycle detection,
 * max depth enforcement, and traversal behavior.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContractIR, JsonSchemaObject } from '../src/types.js';
import {
    createSchemaWalker,
    checkSchemaCycles,
    extractSchemaRefs,
    resolveSchemaRef,
    SchemaCycleError,
    SchemaDepthError,
} from '../src/schema-walker.js';

// Load test fixtures
const fixturesDir = resolve(__dirname, '../../../fixtures/contract-ir/v0.1');

function loadFixture(name: string): ContractIR {
    const content = readFileSync(resolve(fixturesDir, `${name}.json`), 'utf-8');
    return JSON.parse(content) as ContractIR;
}

describe('createSchemaWalker', () => {
    describe('basic traversal', () => {
        it('should visit all nodes in a simple schema', () => {
            const schemas: Record<string, JsonSchemaObject> = {
                Simple: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        age: { type: 'number' },
                    },
                },
            };

            const visited: string[] = [];
            const walker = createSchemaWalker(schemas, {});

            walker(schemas.Simple, (schema, ctx) => {
                visited.push(ctx.path.join('.'));
            });

            expect(visited).toContain('$');
            expect(visited).toContain('$.properties.age');
            expect(visited).toContain('$.properties.name');
        });

        it('should traverse array items', () => {
            const schemas: Record<string, JsonSchemaObject> = {
                WithArray: {
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                        },
                    },
                },
            };

            const visited: string[] = [];
            const walker = createSchemaWalker(schemas, {});

            walker(schemas.WithArray, (schema, ctx) => {
                visited.push(ctx.path.join('.'));
            });

            expect(visited).toContain('$.properties.items.items');
        });

        it('should traverse additionalProperties', () => {
            const schemas: Record<string, JsonSchemaObject> = {
                WithAdditional: {
                    type: 'object',
                    additionalProperties: {
                        type: 'string',
                    },
                },
            };

            const visited: string[] = [];
            const walker = createSchemaWalker(schemas, {});

            walker(schemas.WithAdditional, (schema, ctx) => {
                visited.push(ctx.path.join('.'));
            });

            expect(visited).toContain('$.additionalProperties');
        });
    });

    describe('$ref handling', () => {
        it('should resolve and traverse $ref schemas', () => {
            const schemas: Record<string, JsonSchemaObject> = {
                Address: {
                    type: 'object',
                    properties: {
                        street: { type: 'string' },
                        city: { type: 'string' },
                    },
                },
                Person: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        address: { $ref: 'schema:Address' } as unknown as JsonSchemaObject,
                    },
                },
            };

            const visited: string[] = [];
            const refs: string[] = [];
            const walker = createSchemaWalker(schemas, {
                onRef: (ref) => refs.push(ref),
            });

            walker(schemas.Person, (schema, ctx) => {
                visited.push(ctx.path.join('.'));
            });

            expect(refs).toContain('schema:Address');
            expect(visited).toContain('$.properties.address');
            expect(visited).toContain('$.properties.address.$ref(Address)');
        });
    });

    describe('self-recursive schema', () => {
        it('should handle self-recursive schemas without stack overflow', () => {
            const fixture = loadFixture('self-recursive');
            const walker = createSchemaWalker(fixture.schemas, {
                operationId: 'getTree',
                throwOnCycle: false, // Don't throw, just stop
            });

            let visitCount = 0;
            walker(fixture.schemas.SelfRecursiveNode, () => {
                visitCount++;
            });

            // Should visit nodes but stop when detecting cycle
            expect(visitCount).toBeGreaterThan(0);
            expect(visitCount).toBeLessThan(1000); // Definitely not infinite
        });

        it('should detect cycle in self-recursive schema', () => {
            const fixture = loadFixture('self-recursive');
            const result = checkSchemaCycles(
                fixture.schemas.SelfRecursiveNode,
                fixture.schemas,
                'getTree'
            );

            expect(result.hasCycle).toBe(true);
            expect(result.cyclePath).toContain('SelfRecursiveNode');
        });

        it('should throw SchemaCycleError with actionable message', () => {
            const fixture = loadFixture('self-recursive');
            const walker = createSchemaWalker(fixture.schemas, {
                operationId: 'getTree',
                throwOnCycle: true,
            });

            expect(() => {
                walker(fixture.schemas.SelfRecursiveNode, () => { });
            }).toThrow(SchemaCycleError);

            try {
                walker(fixture.schemas.SelfRecursiveNode, () => { });
            } catch (e) {
                expect(e).toBeInstanceOf(SchemaCycleError);
                const error = e as SchemaCycleError;
                expect(error.message).toContain('getTree');
                expect(error.message).toContain('Cycle detected');
                expect(error.schemaPath).toBeDefined();
            }
        });
    });

    describe('mutual recursion', () => {
        it('should handle mutual recursion between Person and Company', () => {
            const fixture = loadFixture('mutual-recursive');
            const walker = createSchemaWalker(fixture.schemas, {
                operationId: 'getPerson',
                throwOnCycle: false,
            });

            let visitCount = 0;
            walker(fixture.schemas.Person, () => {
                visitCount++;
            });

            expect(visitCount).toBeGreaterThan(0);
            expect(visitCount).toBeLessThan(1000);
        });

        it('should detect cycle in mutually recursive schemas', () => {
            const fixture = loadFixture('mutual-recursive');

            const personResult = checkSchemaCycles(
                fixture.schemas.Person,
                fixture.schemas,
                'getPerson'
            );

            const companyResult = checkSchemaCycles(
                fixture.schemas.Company,
                fixture.schemas,
                'getCompany'
            );

            expect(personResult.hasCycle).toBe(true);
            expect(companyResult.hasCycle).toBe(true);
        });
    });

    describe('deep nesting', () => {
        it('should traverse deeply nested schemas within limits', () => {
            const fixture = loadFixture('deep-nesting');
            const walker = createSchemaWalker(fixture.schemas, {
                maxDepth: 50, // Enough for 10 levels
            });

            const depths: number[] = [];
            walker(fixture.schemas.Level1, (schema, ctx) => {
                depths.push(ctx.depth);
            });

            expect(Math.max(...depths)).toBeLessThanOrEqual(50);
        });

        it('should throw SchemaDepthError when max depth exceeded', () => {
            const fixture = loadFixture('deep-nesting');
            const walker = createSchemaWalker(fixture.schemas, {
                maxDepth: 5, // Too shallow for 10 levels
                throwOnMaxDepth: true,
                operationId: 'getDeeplyNested',
            });

            expect(() => {
                walker(fixture.schemas.Level1, () => { });
            }).toThrow(SchemaDepthError);

            try {
                walker(fixture.schemas.Level1, () => { });
            } catch (e) {
                expect(e).toBeInstanceOf(SchemaDepthError);
                const error = e as SchemaDepthError;
                expect(error.message).toContain('getDeeplyNested');
                expect(error.message).toContain('Maximum schema depth');
                expect(error.maxDepth).toBe(5);
            }
        });

        it('should gracefully stop at max depth without throwing', () => {
            const fixture = loadFixture('deep-nesting');
            const walker = createSchemaWalker(fixture.schemas, {
                maxDepth: 5,
                throwOnMaxDepth: false,
            });

            const depths: number[] = [];
            walker(fixture.schemas.Level1, (schema, ctx) => {
                depths.push(ctx.depth);
            });

            expect(Math.max(...depths)).toBeLessThanOrEqual(5);
        });
    });

    describe('callbacks', () => {
        it('should call onEnter and onExit in correct order', () => {
            const schemas: Record<string, JsonSchemaObject> = {
                Test: {
                    type: 'object',
                    properties: {
                        child: {
                            type: 'object',
                            properties: {
                                value: { type: 'string' },
                            },
                        },
                    },
                },
            };

            const events: string[] = [];
            const walker = createSchemaWalker(schemas, {
                onEnter: (_, depth) => events.push(`enter:${depth}`),
                onExit: (_, depth) => events.push(`exit:${depth}`),
            });

            walker(schemas.Test, () => { });

            // Verify enter/exit pattern
            expect(events.filter((e) => e.startsWith('enter')).length).toBe(
                events.filter((e) => e.startsWith('exit')).length
            );
        });

        it('should call onRef for each reference', () => {
            const schemas: Record<string, JsonSchemaObject> = {
                A: { type: 'object', properties: { b: { $ref: 'schema:B' } as unknown as JsonSchemaObject } },
                B: { type: 'object', properties: { c: { $ref: 'schema:C' } as unknown as JsonSchemaObject } },
                C: { type: 'string' },
            };

            const refs: string[] = [];
            const walker = createSchemaWalker(schemas, {
                onRef: (ref) => refs.push(ref),
            });

            walker(schemas.A, () => { });

            expect(refs).toContain('schema:B');
            expect(refs).toContain('schema:C');
        });
    });
});

describe('resolveSchemaRef', () => {
    it('should return schema directly if not a ref', () => {
        const schema: JsonSchemaObject = { type: 'string' };
        const schemas: Record<string, JsonSchemaObject> = {};

        const result = resolveSchemaRef(schema, schemas);

        expect(result.wasRef).toBe(false);
        expect(result.schema).toEqual(schema);
    });

    it('should resolve schema: refs', () => {
        const schemas: Record<string, JsonSchemaObject> = {
            MySchema: { type: 'object' },
        };

        const result = resolveSchemaRef({ $ref: 'schema:MySchema' }, schemas);

        expect(result.wasRef).toBe(true);
        expect(result.refPath).toBe('schema:MySchema');
        expect(result.schema).toEqual(schemas.MySchema);
    });

    it('should return undefined for missing refs', () => {
        const schemas: Record<string, JsonSchemaObject> = {};

        const result = resolveSchemaRef({ $ref: 'schema:Missing' }, schemas);

        expect(result.wasRef).toBe(true);
        expect(result.schema).toBeUndefined();
    });

    it('should handle undefined input', () => {
        const result = resolveSchemaRef(undefined, {});

        expect(result.wasRef).toBe(false);
        expect(result.schema).toBeUndefined();
    });
});

describe('extractSchemaRefs', () => {
    it('should extract ref from root', () => {
        const refs = extractSchemaRefs({ $ref: 'schema:Test' });
        expect(refs).toEqual(['schema:Test']);
    });

    it('should extract refs from properties', () => {
        const schema: JsonSchemaObject = {
            type: 'object',
            properties: {
                user: { $ref: 'schema:User' } as unknown as JsonSchemaObject,
                order: { $ref: 'schema:Order' } as unknown as JsonSchemaObject,
            },
        };

        const refs = extractSchemaRefs(schema);
        expect(refs).toContain('schema:User');
        expect(refs).toContain('schema:Order');
    });

    it('should extract refs from items', () => {
        const schema: JsonSchemaObject = {
            type: 'array',
            items: { $ref: 'schema:Item' },
        };

        const refs = extractSchemaRefs(schema);
        expect(refs).toContain('schema:Item');
    });

    it('should extract refs from oneOf/anyOf/allOf', () => {
        const schema: JsonSchemaObject = {
            oneOf: [{ $ref: 'schema:A' }, { $ref: 'schema:B' }],
            anyOf: [{ $ref: 'schema:C' }],
            allOf: [{ $ref: 'schema:D' }],
        } as unknown as JsonSchemaObject;

        const refs = extractSchemaRefs(schema);
        expect(refs).toContain('schema:A');
        expect(refs).toContain('schema:B');
        expect(refs).toContain('schema:C');
        expect(refs).toContain('schema:D');
    });
});

describe('checkSchemaCycles', () => {
    it('should return hasCycle: false for acyclic schema', () => {
        const schemas: Record<string, JsonSchemaObject> = {
            A: { type: 'object', properties: { b: { $ref: 'schema:B' } as unknown as JsonSchemaObject } },
            B: { type: 'object', properties: { c: { type: 'string' } } },
        };

        const result = checkSchemaCycles(schemas.A, schemas);
        expect(result.hasCycle).toBe(false);
    });

    it('should return hasCycle: true for self-referential schema', () => {
        const schemas: Record<string, JsonSchemaObject> = {
            Node: {
                type: 'object',
                properties: {
                    children: {
                        type: 'array',
                        items: { $ref: 'schema:Node' },
                    },
                },
            },
        };

        const result = checkSchemaCycles(schemas.Node, schemas);
        expect(result.hasCycle).toBe(true);
        expect(result.error).toBeInstanceOf(SchemaCycleError);
    });

    it('should include operationId in error message', () => {
        const schemas: Record<string, JsonSchemaObject> = {
            Recursive: {
                type: 'object',
                properties: {
                    self: { $ref: 'schema:Recursive' } as unknown as JsonSchemaObject,
                },
            },
        };

        const result = checkSchemaCycles(schemas.Recursive, schemas, 'myOperation');
        expect(result.hasCycle).toBe(true);
        expect(result.error?.message).toContain('myOperation');
    });
});
