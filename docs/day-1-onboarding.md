# Day 1 Onboarding Guide

Welcome to the API Contract Platform (ACP)! This guide will help you get up and running with contract-first API development.

## What is ACP?

ACP is a contract-first API development platform that helps teams:

- **Define** API contracts using a standardized Intermediate Representation (IR)
- **Validate** that implementations match their contracts
- **Detect** breaking changes before they reach production
- **Share** contracts across teams via a central Hub

## Quick Start (5 minutes)

### Step 1: Install the CLI

```bash
# Using pnpm (recommended)
pnpm add -g @docsmyth/cli

# Or using npm
npm install -g @docsmyth/cli

# Verify installation
docsmyth --version
```

### Step 2: Initialize a Contract

```bash
# Create a new contract in your project
mkdir -p contract
docsmyth init --output contract/contract.ir.json
```

This creates a minimal contract IR file:

```json
{
  "version": "0.1",
  "info": {
    "title": "My API",
    "version": "1.0.0"
  },
  "operations": []
}
```

### Step 3: Validate the Contract

```bash
docsmyth validate contract/contract.ir.json
# ✅ Contract is valid
```

### Step 4: Compile to OpenAPI

```bash
docsmyth compile contract/contract.ir.json --format openapi --output contract/openapi.json
```

You now have an OpenAPI 3.1 spec that can be used with any OpenAPI tooling!

## Core Concepts

### Contract IR (Intermediate Representation)

The Contract IR is ACP's canonical format for API contracts. It's:

- **Technology-agnostic**: Not tied to OpenAPI, GraphQL, or any specific format
- **Precise**: Captures exact API semantics without ambiguity
- **Extensible**: Supports overlays for customization

**Key components:**

- `info`: Metadata about the API (title, version, description)
- `operations`: List of API endpoints with request/response schemas
- `schemas`: Reusable schema definitions (referenced via `$ref`)

### Evidence

Evidence is runtime data captured during API execution. It proves that your implementation matches the contract:

- Captured during test runs or in staging/dev environments
- Contains sanitized request/response pairs
- Verified against the contract to detect mismatches

### Overlays

Overlays allow you to customize contracts for specific audiences:

- Add documentation for public APIs
- Remove internal endpoints from public specs
- Customize schemas per consumer

## Project Structure

Here's a typical project structure with ACP:

```
my-service/
├── contract/
│   ├── contract.ir.json      # Source of truth
│   ├── contract.openapi.json # Generated OpenAPI
│   └── overlays/
│       ├── public.overlay.json
│       └── internal.overlay.json
├── src/
│   ├── routes/
│   ├── schemas/              # Zod schemas (optional)
│   └── server.ts
├── test/
│   └── api.test.ts
├── evidence.ndjson           # Generated during tests
└── package.json
```

## Workflow Overview

### 1. Design Phase

Define your contract before writing implementation:

```json
{
  "version": "0.1",
  "info": {
    "title": "Orders API",
    "version": "1.0.0"
  },
  "operations": [
    {
      "operationId": "getOrders",
      "method": "GET",
      "path": "/orders",
      "response": {
        "statusCode": 200,
        "contentType": "application/json",
        "schema": {
          "type": "array",
          "items": { "$ref": "#/schemas/Order" }
        }
      }
    }
  ],
  "schemas": {
    "Order": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "status": { "type": "string", "enum": ["pending", "completed"] }
      },
      "required": ["id", "status"]
    }
  }
}
```

### 2. Implementation Phase

Implement your API to match the contract. Use the runtime middleware to capture evidence:

```typescript
import { createEvidenceCaptureMiddleware } from '@docsmyth/runtime-node-express';

const evidenceMiddleware = createEvidenceCaptureMiddleware({
  contractPath: './contract/contract.ir.json',
  enabled: process.env.ACP_EVIDENCE_CAPTURE === 'true',
  outputPath: './evidence.ndjson',
});

app.use(evidenceMiddleware);
```

### 3. Verification Phase

Run your tests with evidence capture, then verify:

```bash
# Run tests with evidence capture
ACP_EVIDENCE_CAPTURE=true pnpm test

# Verify evidence matches contract
docsmyth evidence verify evidence.ndjson --contract contract/contract.ir.json
```

### 4. CI Integration

Add contract checks to your CI pipeline:

```yaml
# .github/workflows/ci.yml
jobs:
  contract-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: ACP_EVIDENCE_CAPTURE=true pnpm test
      - run: docsmyth validate contract/contract.ir.json
      - run: docsmyth evidence verify evidence.ndjson --contract contract/contract.ir.json
```

### 5. Publishing Phase

Publish your contract to the Hub for team visibility:

```bash
docsmyth hub publish \
  --contract contract/contract.ir.json \
  --openapi contract/openapi.json \
  --url https://acp-hub.your-org.com
```

## CLI Reference

### Validate

```bash
docsmyth validate <contract-path> [options]

Options:
  --verbose    Show detailed validation output
  --strict     Fail on warnings (not just errors)
```

### Compile

```bash
docsmyth compile <contract-path> [options]

Options:
  --format <format>   Output format (openapi, openapi3.0)
  --output <path>     Output file path
  --overlay <path>    Apply overlay before compiling
```

### Diff

```bash
docsmyth diff <base> <head> [options]

Options:
  --format <format>   Output format (json, human, github)
  --fail-on-breaking  Exit with error on breaking changes
```

### Evidence

```bash
# Verify evidence
docsmyth evidence verify <evidence-path> --contract <contract-path>

# Check coverage
docsmyth evidence coverage <evidence-path> --contract <contract-path>
```

### Hub Commands

```bash
# Publish to hub
docsmyth hub publish --contract <path> --openapi <path>

# List contracts
docsmyth hub list

# Pull contract
docsmyth hub pull <contract-name> --output <path>
```

## Next Steps

1. **[Express Starter Template](../templates/express-starter/)** - Full example with Express, Zod, and ACP
2. **[CI Integration Guide](./ci-integration.md)** - Add contract checks to your CI
3. **[Security Model](./ops/security-model.md)** - Understand data sanitization
4. **[Schema Support](./schema-support.md)** - Supported schema features
5. **[Troubleshooting](./ops/troubleshooting.md)** - Common issues and solutions

## Getting Help

- **Documentation**: Browse the `/docs` directory
- **Issues**: File bugs or feature requests in GitHub
- **Slack**: Join `#api-contracts` for questions and discussion
- **Office Hours**: Weekly Q&A sessions (check calendar)

## Key Defaults Reference

| Setting            | Default                                              | Description                   |
| ------------------ | ---------------------------------------------------- | ----------------------------- |
| Evidence file size | 100 MB                                               | Max file size before rotation |
| Rate limit         | 100 events/sec                                       | Evidence capture throttle     |
| Dedupe window      | 60 seconds                                           | Deduplication time window     |
| Sanitized headers  | `authorization`, `cookie`, `set-cookie`, `x-api-key` | Never captured                |
| Masked fields      | `password`, `secret`, `token`, `apikey`              | Redacted in bodies            |

---

_Welcome to ACP! Start with `acp init` and you'll have a validated contract in minutes._
