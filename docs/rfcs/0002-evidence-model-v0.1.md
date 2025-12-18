# RFC 0002: Evidence Model v0.1

| Status    | Proposed      |
| --------- | ------------- |
| Date      | 2025-12-17    |
| Authors   | Platform Team |
| Reviewers | -             |

## Summary

This RFC defines the **Evidence Model** – a companion data structure to Contract IR that captures **evidence** of how contracts were derived from source code and runtime observations. The evidence model enables traceability, debugging, and trust in generated contracts.

## Problem Statement

### Why Evidence Matters

When a tool generates an API contract, users need to understand:

1. **Where did this come from?** – Which source file, function, decorator produced this operation?
2. **Is it accurate?** – Can I trust that `POST /orders` really returns a 201?
3. **What changed?** – If the contract differs from last time, why?

Without evidence:

- Users treat generated contracts as black boxes
- Debugging incorrect contracts requires deep tooling knowledge
- No audit trail for compliance-sensitive APIs

### Use Cases

1. **Developer Debugging**: "Why is this field marked required?" → Evidence shows `CreateOrderSchema` has `z.string().min(1)` at `src/orders.ts:45`

2. **CI Validation**: Evidence can be validated against runtime traffic – if evidence claims `201` response, but production shows `200`, flag it.

3. **Contract Evolution**: Evidence diffs show whether a contract change was due to code refactoring vs. actual API changes.

## Design Decision

The Evidence Model is **separate from Contract IR**:

```
Source Code  →  Extractor  →  Contract IR  +  Evidence
                                    ↓              ↓
                               OpenAPI       Debug/Audit
```

This separation ensures:

- Contract IR remains clean and portable
- Evidence is optional (can be stripped for production)
- Different extractors produce consistent IR but varied evidence

## Evidence Model v0.1 Structure

### Evidence Document

```typescript
interface EvidenceDocument {
  evidenceVersion: '0.1';
  generatedAt: string; // ISO timestamp
  generator: GeneratorInfo;
  sourceFiles: SourceFileEvidence[];
  schemaEvidence: Record<string, SchemaEvidence>;
  operationEvidence: Record<string, OperationEvidence>;
}
```

### Source File Evidence

```typescript
interface SourceFileEvidence {
  path: string; // Relative to project root
  hash: string; // Content hash for change detection
  language: string; // "typescript", "python", etc.
  framework?: string; // "express", "fastapi", etc.
}
```

### Schema Evidence

```typescript
interface SchemaEvidence {
  schemaId: string; // Matches schemas[$id] in IR
  sources: SourceLocation[];
  derivedFrom?: {
    type: 'zod' | 'json-schema' | 'pydantic' | 'manual';
    expression?: string; // e.g., "z.object({ ... })"
  };
}
```

### Operation Evidence

```typescript
interface OperationEvidence {
  operationId: string;
  sources: SourceLocation[];
  routeDefinition?: {
    method: string;
    path: string;
    file: string;
    line: number;
  };
  handlerFunction?: {
    name: string;
    file: string;
    line: number;
  };
}
```

### Source Location

```typescript
interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  snippet?: string; // Contextual code snippet
}
```

## Privacy & Security Defaults

**Critical**: Evidence MUST NOT capture sensitive data by default.

### Strict Privacy Rules

1. **No Auth Headers**: Evidence must not capture `Authorization`, `Cookie`, `X-API-Key` values
2. **No Request Bodies**: Only schema references, not actual data
3. **No PII**: Even in snippets, mask anything that looks like email, phone, SSN
4. **Hash Secrets**: If environment variables are referenced, show names not values

### Evidence Masking

```typescript
interface EvidenceMaskingConfig {
  maskPatterns: RegExp[]; // e.g., [/Bearer .+/g, /password/i]
  allowedHeaders: string[]; // Whitelist for header names
  stripSnippets: boolean; // Remove code snippets entirely
  hashSourcePaths: boolean; // For extreme privacy
}
```

Default config:

```typescript
const DEFAULT_MASKING: EvidenceMaskingConfig = {
  maskPatterns: [
    /Bearer\s+\S+/g,
    /Basic\s+\S+/g,
    /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
    /secret["']?\s*[:=]\s*["']?[^"'\s]+/gi,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // emails
  ],
  allowedHeaders: ['Content-Type', 'Accept', 'X-Request-ID'],
  stripSnippets: false,
  hashSourcePaths: false,
};
```

## Runtime Evidence Capture (Week 3 Addition)

In addition to static source-based evidence, v0.1 now supports **runtime evidence capture** for Express applications.

### EvidenceEvent Structure

```typescript
interface EvidenceEvent {
  evidenceVersion: '0.1';
  operationId: string;
  protocol: 'http';
  timestamp: string; // ISO timestamp
  traceId?: string;
  request: {
    method: string;
    path: string;
    query?: Record<string, unknown>;
    params?: Record<string, string>;
    headers?: Record<string, string>; // sanitized
    body?: unknown;
  };
  response: {
    status: number;
    headers?: Record<string, string>; // sanitized
    body?: unknown;
  };
}
```

### Evidence Bundle

Multiple events can be bundled:

```typescript
interface EvidenceBundle {
  evidenceVersion: '0.1';
  createdAt: string;
  serviceName?: string;
  serviceVersion?: string;
  events: EvidenceEvent[];
}
```

### Express Middleware Usage

```typescript
import { evidenceCapture } from '@docsmyth/runtime-node-express';

app.use(
  evidenceCapture({
    contractPath: './contract-ir.json',
    enabled: process.env.NODE_ENV !== 'production',
    outputPath: '.acp/evidence.ndjson',
  })
);
```

### CLI Verification

```bash
docsmyth evidence verify ./evidence.ndjson --contract ./contract-ir.json
```

## What's NOT in v0.1

- ❌ Test coverage correlation
- ❌ Dependency graph of schemas
- ❌ Change history / git blame integration
- ❌ Hub service for evidence aggregation
- ❌ Non-Express runtimes (FastAPI, Chi, etc.)

## Implementation Notes

Evidence generation is **extractor-specific**:

- Express+Zod extractor produces TypeScript AST-based evidence
- FastAPI extractor produces Python decorator-based evidence
- **Express runtime middleware** captures request/response pairs in dev/test

Evidence consumption is **universal**:

- CLI can verify evidence against Contract IR schemas
- CI can validate evidence and fail on schema violations
- Verified examples can be injected into OpenAPI output

## Decision

✅ **Accepted** – Runtime evidence capture implemented in Week 3 for Express.

## Related

- RFC 0001: Contract IR v0.1
- RFC 0003: Week 1 Scope and Decisions
