import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { ContractIR } from '@docsmyth/ir-spec';
import { compileOpenApi } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const irFixturesDir = join(__dirname, '../../../fixtures/contract-ir/v0.1');
const openapiFixturesDir = join(__dirname, '../../../fixtures/openapi/v3.1');

/**
 * Validates that generated OpenAPI is valid according to spec
 */
async function validateOpenAPI(doc: unknown): Promise<void> {
  await SwaggerParser.validate(doc as object);
}

describe('@docsmyth/compiler-openapi', () => {
  describe('compileOpenApi()', () => {
    it('should compile a minimal IR to OpenAPI 3.1', async () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: {
          name: 'test-api',
          version: '1.0.0',
        },
        schemas: {},
        operations: [],
      };

      const result = compileOpenApi(ir);

      expect(result.openapi).toBe('3.1.0');
      expect(result.info.title).toBe('test-api');
      expect(result.info.version).toBe('1.0.0');
      expect(result.paths).toEqual({});

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should include servers from baseUrls', async () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: {
          name: 'test-api',
          version: '1.0.0',
          baseUrls: ['https://api.example.com', 'https://staging.example.com'],
        },
        schemas: {},
        operations: [],
      };

      const result = compileOpenApi(ir);

      expect(result.servers).toHaveLength(2);
      expect(result.servers?.[0].url).toBe('https://api.example.com');

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should convert schema references', async () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {
          Order: {
            $id: 'Order',
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
        operations: [
          {
            operationId: 'getOrder',
            method: 'GET',
            path: '/orders/{id}',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: [
              {
                statusCode: 200,
                description: 'Order found',
                schema: { $ref: 'schema:Order' },
              },
            ],
          },
        ],
      };

      const result = compileOpenApi(ir);

      expect(result.paths['/orders/{id}']?.get?.responses['200'].content).toBeDefined();
      const schema =
        result.paths['/orders/{id}']?.get?.responses['200'].content?.['application/json']?.schema;
      expect(schema).toEqual({ $ref: '#/components/schemas/Order' });

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile the minimal-http.json fixture and produce valid OpenAPI', async () => {
      const irPath = join(irFixturesDir, 'minimal-http.json');
      const ir = JSON.parse(readFileSync(irPath, 'utf-8')) as ContractIR;

      const result = compileOpenApi(ir);

      // Basic structure checks
      expect(result.openapi).toBe('3.1.0');
      expect(result.info.title).toBe(ir.service.name);
      expect(result.paths['/orders']).toBeDefined();
      expect(result.paths['/orders']?.post).toBeDefined();
      expect(result.components?.schemas).toBeDefined();

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should match expected OpenAPI fixture exactly', () => {
      const irPath = join(irFixturesDir, 'minimal-http.json');
      const ir = JSON.parse(readFileSync(irPath, 'utf-8')) as ContractIR;
      const expectedPath = join(openapiFixturesDir, 'minimal-http.json');
      const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));

      const result = compileOpenApi(ir);

      // Exact match comparison for deterministic output
      expect(JSON.stringify(result, null, 2)).toBe(JSON.stringify(expected, null, 2));
    });

    it('should handle operations with request bodies', async () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'createItem',
            method: 'POST',
            path: '/items',
            requestBody: {
              required: true,
              schema: { type: 'object', properties: { name: { type: 'string' } } },
            },
            responses: [{ statusCode: 201, description: 'Created' }],
          },
        ],
      };

      const result = compileOpenApi(ir);

      expect(result.paths['/items']?.post?.requestBody).toBeDefined();
      expect(result.paths['/items']?.post?.requestBody?.required).toBe(true);

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should produce deterministic output with sorted paths', () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          { operationId: 'z', method: 'GET', path: '/zebra', responses: [{ statusCode: 200 }] },
          { operationId: 'a', method: 'GET', path: '/alpha', responses: [{ statusCode: 200 }] },
          { operationId: 'm', method: 'GET', path: '/middle', responses: [{ statusCode: 200 }] },
        ],
      };

      const result = compileOpenApi(ir);
      const pathKeys = Object.keys(result.paths);

      expect(pathKeys).toEqual(['/alpha', '/middle', '/zebra']);
    });

    it('should produce deterministic output with stable method order', () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {},
        operations: [
          {
            operationId: 'deleteItem',
            method: 'DELETE',
            path: '/items',
            responses: [{ statusCode: 204 }],
          },
          {
            operationId: 'getItems',
            method: 'GET',
            path: '/items',
            responses: [{ statusCode: 200 }],
          },
          {
            operationId: 'createItem',
            method: 'POST',
            path: '/items',
            responses: [{ statusCode: 201 }],
          },
        ],
      };

      const result = compileOpenApi(ir);
      const methodKeys = Object.keys(result.paths['/items'] || {});

      // Methods should be in stable order: get, post, put, patch, delete, options, head
      expect(methodKeys).toEqual(['get', 'post', 'delete']);
    });

    it('should sort schemas alphabetically', () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {
          Zebra: { type: 'object' },
          Alpha: { type: 'object' },
          Middle: { type: 'object' },
        },
        operations: [],
      };

      const result = compileOpenApi(ir);
      const schemaKeys = Object.keys(result.components?.schemas || {});

      expect(schemaKeys).toEqual(['Alpha', 'Middle', 'Zebra']);
    });

    it('should inject examples when provided', async () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {
          Order: {
            $id: 'Order',
            type: 'object',
            properties: {
              id: { type: 'string' },
              customerId: { type: 'string' },
            },
          },
        },
        operations: [
          {
            operationId: 'listOrders',
            method: 'GET',
            path: '/orders',
            responses: [
              {
                statusCode: 200,
                schema: {
                  type: 'array',
                  items: { $ref: 'schema:Order' },
                },
              },
            ],
          },
        ],
      };

      const examples = {
        listOrders: {
          '200': [
            {
              summary: 'List of orders',
              value: [{ id: 'order-1', customerId: 'cust-1' }],
            },
            {
              value: [{ id: 'order-2', customerId: 'cust-2' }],
            },
          ],
        },
      };

      const result = compileOpenApi(ir, { examples });

      const getOp = result.paths['/orders']?.get;
      expect(getOp).toBeDefined();

      const responseContent = getOp?.responses['200']?.content?.['application/json'];
      expect(responseContent?.examples).toBeDefined();
      expect(responseContent?.examples?.['example-1']).toEqual({
        summary: 'List of orders',
        value: [{ id: 'order-1', customerId: 'cust-1' }],
      });
      expect(responseContent?.examples?.['example-2']).toEqual({
        value: [{ id: 'order-2', customerId: 'cust-2' }],
      });

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should handle examples for multiple status codes', async () => {
      const ir: ContractIR = {
        irVersion: '0.1',
        service: { name: 'test', version: '1.0.0' },
        schemas: {
          Order: {
            $id: 'Order',
            type: 'object',
            properties: { id: { type: 'string' } },
          },
          Error: {
            $id: 'Error',
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
        operations: [
          {
            operationId: 'getOrder',
            method: 'GET',
            path: '/orders/{id}',
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            responses: [
              { statusCode: 200, schema: { $ref: 'schema:Order' } },
              { statusCode: 404, schema: { $ref: 'schema:Error' } },
            ],
          },
        ],
      };

      const examples = {
        getOrder: {
          '200': [{ value: { id: 'order-1' } }],
          '404': [{ value: { message: 'Order not found' } }],
        },
      };

      const result = compileOpenApi(ir, { examples });

      const getOp = result.paths['/orders/{id}']?.get;
      expect(getOp?.responses['200']?.content?.['application/json']?.examples).toBeDefined();
      expect(getOp?.responses['404']?.content?.['application/json']?.examples).toBeDefined();

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });
  });

  describe('recursive schemas', () => {
    it('should compile self-recursive schema preserving $ref', async () => {
      const selfRecursiveIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'self-recursive.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(selfRecursiveIR);

      // Should have the schema defined
      expect(result.components?.schemas?.SelfRecursiveNode).toBeDefined();

      // Should preserve $ref for children items
      const schema = result.components?.schemas?.SelfRecursiveNode;
      expect(schema?.properties?.children?.items).toEqual({
        $ref: '#/components/schemas/SelfRecursiveNode',
      });

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile mutually recursive schemas preserving $ref', async () => {
      const mutualRecursiveIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'mutual-recursive.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(mutualRecursiveIR);

      // Should have both schemas defined
      expect(result.components?.schemas?.Person).toBeDefined();
      expect(result.components?.schemas?.Company).toBeDefined();

      // Person should reference Company
      const personSchema = result.components?.schemas?.Person;
      expect(personSchema?.properties?.employer).toEqual({
        $ref: '#/components/schemas/Company',
      });

      // Company should reference Person
      const companySchema = result.components?.schemas?.Company;
      expect(companySchema?.properties?.ceo).toEqual({
        $ref: '#/components/schemas/Person',
      });

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile deeply nested schemas', async () => {
      const deepNestingIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'deep-nesting.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(deepNestingIR);

      // Should have all levels defined
      for (let i = 1; i <= 10; i++) {
        expect(result.components?.schemas?.[`Level${i}`]).toBeDefined();
      }

      // Each level should reference the next
      expect(result.components?.schemas?.Level1?.properties?.level2).toEqual({
        $ref: '#/components/schemas/Level2',
      });

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });
  });

  describe('oneOf/anyOf/allOf schemas', () => {
    it('should compile discriminated union with oneOf', async () => {
      const unionTypesIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'union-types.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(unionTypesIR);

      // Pet schema should have oneOf
      const petSchema = result.components?.schemas?.Pet;
      expect(petSchema?.oneOf).toBeDefined();
      expect(petSchema?.oneOf).toHaveLength(2);
      expect(petSchema?.oneOf?.[0]).toEqual({ $ref: '#/components/schemas/Cat' });
      expect(petSchema?.oneOf?.[1]).toEqual({ $ref: '#/components/schemas/Dog' });

      // Should have discriminator
      expect(petSchema?.discriminator?.propertyName).toBe('type');
      expect(petSchema?.discriminator?.mapping?.cat).toBe('#/components/schemas/Cat');
      expect(petSchema?.discriminator?.mapping?.dog).toBe('#/components/schemas/Dog');

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile allOf composition', async () => {
      const unionTypesIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'union-types.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(unionTypesIR);

      // Person schema should have allOf
      const personSchema = result.components?.schemas?.Person;
      expect(personSchema?.allOf).toBeDefined();
      expect(personSchema?.allOf).toHaveLength(3);
      expect(personSchema?.allOf?.[0]).toEqual({ $ref: '#/components/schemas/Address' });
      expect(personSchema?.allOf?.[1]).toEqual({ $ref: '#/components/schemas/ContactInfo' });

      // Third item should be inline object
      expect((personSchema?.allOf?.[2] as { type: string })?.type).toBe('object');

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile anyOf flexible input', async () => {
      const unionTypesIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'union-types.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(unionTypesIR);

      // FlexibleInput schema should have anyOf
      const flexibleSchema = result.components?.schemas?.FlexibleInput;
      expect(flexibleSchema?.anyOf).toBeDefined();
      expect(flexibleSchema?.anyOf).toHaveLength(3);

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile nullable types using type array', async () => {
      const unionTypesIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'union-types.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(unionTypesIR);

      // NullableString should have type array
      const nullableStringSchema = result.components?.schemas?.NullableString;
      expect(nullableStringSchema?.type).toEqual(['string', 'null']);

      // NullableObject should have type array
      const nullableObjectSchema = result.components?.schemas?.NullableObject;
      expect(nullableObjectSchema?.type).toEqual(['object', 'null']);

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile array of unions', async () => {
      const unionTypesIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'union-types.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(unionTypesIR);

      // ArrayOfUnions should have items with oneOf
      const arraySchema = result.components?.schemas?.ArrayOfUnions;
      expect(arraySchema?.type).toBe('array');
      expect(arraySchema?.items?.oneOf).toBeDefined();
      expect(arraySchema?.items?.oneOf).toHaveLength(2);

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });

    it('should compile record with union values', async () => {
      const unionTypesIR = JSON.parse(
        readFileSync(join(irFixturesDir, 'union-types.json'), 'utf-8')
      ) as ContractIR;

      const result = compileOpenApi(unionTypesIR);

      // RecordWithUnion should have additionalProperties with oneOf
      const recordSchema = result.components?.schemas?.RecordWithUnion;
      expect(recordSchema?.type).toBe('object');
      expect(recordSchema?.additionalProperties?.oneOf).toBeDefined();

      // Validate OpenAPI spec
      await validateOpenAPI(result);
    });
  });
});
