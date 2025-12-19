# Docsmyth Studio

Docsmyth Studio is a modern web UI for exploring API contracts, evidence, coverage, and issues. It provides a first-class developer experience for understanding and debugging your API contracts.

## Features

- **Contract Explorer**: Browse endpoints, schemas, and examples from your Contract IR
- **Evidence Timeline**: View HTTP request/response captures with verdict analysis
- **Coverage Heatmap**: Visualize which endpoints are covered by evidence
- **Issues & Drift Detection**: Identify breaking changes, missing evidence, and schema violations
- **OpenAPI Compiler**: Export your contract to OpenAPI 3.1 format

## Quick Start

```bash
# Launch studio with a contract file
docsmyth studio --contract ./output/orders-contract.openapi.json

# Include evidence for coverage and issues analysis
docsmyth studio --contract ./contract.json --evidence ./evidence.ndjson

# Custom port and host
docsmyth studio --contract ./contract.json --port 9000 --host 0.0.0.0
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--contract <path>` | Path to Contract IR JSON file (required) | - |
| `--evidence <path>` | Path to Evidence NDJSON file | - |
| `--port <number>` | Server port | 8787 |
| `--host <address>` | Server host | 127.0.0.1 |
| `--no-open` | Don't open browser automatically | false |

## Standalone Binary

You can also run studio directly without the CLI:

```bash
npx docsmyth-studio --contract ./contract.json
```

## API Endpoints

Studio exposes a REST API for programmatic access:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/contract` | GET | Get the loaded contract |
| `/api/contract/summary` | GET | Get contract summary statistics |
| `/api/evidence` | GET | Get evidence events (paginated) |
| `/api/evidence/stats` | GET | Get evidence statistics |
| `/api/coverage` | GET | Get coverage analysis |
| `/api/issues` | GET | Get detected issues |
| `/api/compile` | POST | Compile to OpenAPI format |

### Pagination

The `/api/evidence` endpoint supports pagination:

```bash
curl "http://localhost:8787/api/evidence?offset=0&limit=50"
```

### Compile Options

```bash
curl -X POST "http://localhost:8787/api/compile" \
  -H "Content-Type: application/json" \
  -d '{"format": "json", "includeExamples": true}'
```

## Web UI

The Studio web interface provides four main tabs:

### Contract Tab

Browse your API contract with:
- Endpoint list with methods, paths, and status codes
- Request/response schema visualization
- Example payloads
- Validation rules and constraints

### Evidence Tab

Explore captured HTTP traffic:
- Chronological timeline of requests
- Verdict badges (pass/fail/warning)
- Request/response details
- Filter by operation, verdict, or time range

### Coverage Tab

Visualize API coverage:
- Heatmap showing covered vs uncovered endpoints
- Status code coverage per operation
- Schema field coverage analysis
- Coverage percentage metrics

### Issues Tab

Identify contract problems:
- Breaking changes between versions
- Missing evidence for required operations
- Schema validation failures
- Drift detection from evidence

## Development

### Building

```bash
# Build the server and web app
pnpm build

# Run in development mode
pnpm dev
```

### Testing

```bash
# Run unit tests
pnpm test

# Run with coverage
pnpm test --coverage
```

## Architecture

```
packages/studio/
├── src/
│   ├── server.ts        # Fastify server setup
│   ├── bin.ts           # Standalone CLI entry
│   ├── types.ts         # Shared type definitions
│   ├── api/             # Route handlers
│   │   ├── contract.ts
│   │   ├── evidence.ts
│   │   ├── coverage.ts
│   │   ├── issues.ts
│   │   └── compile.ts
│   └── services/        # Business logic
│       ├── contract-service.ts
│       ├── evidence-service.ts
│       ├── coverage-service.ts
│       ├── issues-service.ts
│       └── compile-service.ts
└── web/                 # React web application
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   └── lib/
    └── public/
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `STUDIO_PORT` | Server port (default: 8787) |
| `STUDIO_HOST` | Server host (default: 127.0.0.1) |

## Related

- [Contract IR Spec](../packages/ir-spec/README.md)
- [Evidence SDK](../packages/evidence-sdk/README.md)
- [Compiler OpenAPI](../packages/compiler-openapi/README.md)
