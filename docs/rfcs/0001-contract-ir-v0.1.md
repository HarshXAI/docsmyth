# RFC 0001: Contract IR v0.1 Specification

| Status    | Accepted      |
| --------- | ------------- |
| Date      | 2025-12-17    |
| Authors   | Platform Team |
| Reviewers | -             |

## Summary

This RFC defines **Contract IR (Intermediate Representation) v0.1**, a canonical, language-agnostic format for representing API contracts. The IR serves as the central data model that enables multi-stack extraction and deterministic compilation to output formats like OpenAPI.

## Problem Statement

### Current Pain Points

1. **Documentation Rot**: OpenAPI specs diverge from code over time. Manual maintenance is error-prone and creates trust issues.

2. **Multi-Stack Inconsistency**: Organizations with multiple backend stacks (Node/Express, Python/FastAPI, Go/Chi, etc.) lack a unified contract representation.

3. **Tooling Lock-in**: Existing solutions often tie you to specific frameworks or output formats.

4. **Non-Deterministic Outputs**: Different tools produce different OpenAPI for the same logical contract, making diffs noisy and reviews harder.

### Why Not Just Use OpenAPI Directly?

OpenAPI is an **output format**, not an **internal representation**. Problems with using OpenAPI as IR:

- Version-specific concerns bleed into core logic
- Hard to support multiple output formats (AsyncAPI, GraphQL SDL, etc.)
- OpenAPI's structure is optimized for human readability, not programmatic manipulation
- Validation and transformation become coupled to output format quirks

## Design Decision

**We introduce Contract IR as an internal intermediate representation that compiles TO OpenAPI (and other formats in the future).**

The philosophy:

- **Don't replace OpenAPI** – compile to it deterministically
- **Abstract framework-specific patterns** – Express routes, Zod schemas, FastAPI decorators all map to the same IR
- **Enable tooling** – validation, diff, analysis operate on IR, not framework code

## Contract IR v0.1 Structure

### Root Document

```typescript
interface ContractIR {
  irVersion: '0.1'; // Versioned format
  service: ServiceInfo; // API metadata
  schemas: Record<string, JsonSchemaObject>; // Reusable data types
  operations: HttpOperation[]; // API operations
  securitySchemes?: Record<string, SecurityScheme>;
  security?: SecurityRequirement[];
  extensions?: Record<string, unknown>;
}
```

### Service Metadata

```typescript
interface ServiceInfo {
  name: string; // e.g., "orders-api"
  version: string; // Semantic version
  description?: string;
  baseUrls?: string[]; // Environment-specific
}
```

### Schemas

Schemas use a JSON Schema-like structure with `$id` for identification:

```json
{
  "CreateOrderRequest": {
    "$id": "CreateOrderRequest",
    "type": "object",
    "required": ["customerId", "items"],
    "properties": {
      "customerId": { "type": "string" },
      "items": { "type": "array", "items": { ... } }
    }
  }
}
```

### References

References use the format `schema:$id`:

```json
{
  "schema": { "$ref": "schema:CreateOrderRequest" }
}
```

This decouples from OpenAPI's `#/components/schemas/X` format, enabling compilation to different output formats.

### Operations

```typescript
interface HttpOperation {
  operationId: string; // Unique identifier
  method: HttpMethod; // GET, POST, PUT, PATCH, DELETE, etc.
  path: string; // /orders/{id}
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: HttpParameter[];
  requestBody?: HttpRequestBody;
  responses: HttpResponse[]; // Required: at least one
  security?: SecurityRequirement[];
}
```

## What's Explicitly NOT in v0.1

The following are deferred to future versions:

- ❌ AsyncAPI / WebSocket / gRPC operations
- ❌ Complex OAuth2 flows (only basic security schemes)
- ❌ Callbacks / Webhooks
- ❌ Server variables / templating
- ❌ Discriminated unions (allOf/oneOf/anyOf complexity)
- ❌ Example data

## Migration Path

v0.1 is intentionally minimal. Future versions will extend the schema additively. The `irVersion` field enables tooling to handle multiple versions.

## Implementation

See packages:

- `@docsmyth/ir-spec` – TypeScript types and validation
- `@docsmyth/ir-sdk` – Builder helpers for programmatic construction
- `@docsmyth/compiler-openapi` – IR → OpenAPI 3.1 compilation

## Open Questions

1. Should schema `$id` be auto-generated or required?
2. How to handle inline schemas vs. named references?
3. Versioning strategy for breaking changes?

## Decision

✅ **Accepted** – Proceed with Contract IR v0.1 as specified.
