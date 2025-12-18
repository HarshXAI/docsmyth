# Pilot Onboarding Guide

This guide helps teams onboard to the API Contract Platform (ACP) for their pilot services.

## Prerequisites

Before starting, ensure you have:

- [ ] Node.js 18+ installed
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] Access to your service's codebase
- [ ] Your service running locally (for evidence capture)

## Quick Start

### 1. Install the CLI

```bash
pnpm add -D @acp/cli
```

### 2. Create Your Contract IR

Create a `contract.json` file in your project root:

```json
{
  "irVersion": "0.1",
  "service": {
    "name": "your-service-name",
    "version": "1.0.0",
    "description": "Your service description",
    "baseUrls": ["http://localhost:3000"]
  },
  "schemas": {
    "YourSchema": {
      "$id": "YourSchema",
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" }
      },
      "required": ["id"]
    }
  },
  "operations": [
    {
      "operationId": "getResource",
      "method": "GET",
      "path": "/resources/{id}",
      "parameters": [
        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
      ],
      "responses": [{ "statusCode": 200, "schema": { "$ref": "schema:YourSchema" } }]
    }
  ]
}
```

### 3. Validate Your Contract

```bash
npx acp validate contract.json
```

### 4. Compile to OpenAPI

```bash
npx acp compile contract.json -o openapi.json
```

### 5. Set Up Evidence Capture

#### Option A: Express Middleware (Recommended for Node.js)

```typescript
import { createEvidenceMiddleware } from '@acp/runtime-node-express';

const evidence = createEvidenceMiddleware({
  contractPath: './contract.json',
  outputPath: './evidence.ndjson',
  profile: 'balanced', // 'strict' | 'balanced' | 'debug'
});

app.use(evidence);
```

#### Option B: Capture Proxy (Any Technology)

```bash
npx acp proxy --target http://localhost:3000 --contract contract.json --output evidence.ndjson
```

### 6. Run Your Tests

Execute your test suite while evidence capture is active.

### 7. Verify Evidence

```bash
npx acp evidence verify evidence.ndjson --contract contract.json
```

### 8. Add to CI

Add the diff check to your CI pipeline:

```yaml
# .github/workflows/contract.yml
name: Contract Check
on: [pull_request]

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install

      - name: Validate contract
        run: npx acp validate contract.json

      - name: Check for breaking changes
        run: |
          git show origin/main:contract.json > base-contract.json
          npx acp diff base-contract.json contract.json
```

## Checklist

### Before Pilot

- [ ] Contract IR created and validated
- [ ] OpenAPI spec generated and reviewed
- [ ] Evidence capture configured (middleware or proxy)
- [ ] Initial evidence captured from test runs
- [ ] Evidence verified against contract
- [ ] CI pipeline configured with contract validation
- [ ] CI pipeline configured with breaking change detection

### During Pilot

- [ ] Team trained on Contract IR format
- [ ] Process for updating contracts established
- [ ] Breaking change workflow documented
- [ ] Evidence capture running in staging/dev

### After Pilot

- [ ] Collect feedback on workflow
- [ ] Document any edge cases encountered
- [ ] Report issues to ACP team

## Configuration

### Environment Variables

| Variable                 | Description                   | Default             |
| ------------------------ | ----------------------------- | ------------------- |
| `ACP_SANITIZER_PROFILE`  | Sanitization profile          | `balanced`          |
| `ACP_EVIDENCE_OUTPUT`    | Evidence output path          | `./evidence.ndjson` |
| `ACP_MAX_EVENTS_PER_RUN` | Max events per run            | `0` (unlimited)     |
| `ACP_MAX_FILE_BYTES`     | Max file size before rotation | `104857600` (100MB) |

### Sanitizer Profiles

| Profile    | Use Case                   | Headers Captured           |
| ---------- | -------------------------- | -------------------------- |
| `strict`   | Production, sensitive data | Only `content-type`        |
| `balanced` | Staging, testing           | Common debugging headers   |
| `debug`    | Local development          | Many headers (except auth) |

**Important**: All profiles enforce never-capture rules for security headers like `Authorization`, `Cookie`, and `x-api-key`.

## Troubleshooting

See [CI Failure Playbook](./ci-failure-playbook.md) for common issues and solutions.

## Support

- Slack: #api-contract-platform
- Email: acp-team@example.com
- Issues: https://github.com/your-org/api-contract-platform/issues
