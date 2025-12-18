# @acp/hub

Contract Hub - Central storage and serving of API contracts for the API Contract Platform.

## Overview

The Contract Hub provides a centralized HTTP service for storing and serving API contracts. It ensures:

- **Immutability**: Once a contract version is published, it cannot be overwritten
- **Integrity**: All contracts are hashed with SHA-256 for verification
- **Audit Logging**: All publish/pull actions are logged for compliance
- **Token Authentication**: Configurable auth for publish operations

## Quick Start

### Running the Hub

```bash
# From the repo root
pnpm build

# Start the hub server
pnpm --filter @acp/hub start

# Or with environment configuration
ACP_HUB_TOKEN=your-secret-token \
ACP_HUB_PORT=3456 \
ACP_HUB_DATA_DIR=./data \
pnpm --filter @acp/hub start
```

### Publishing a Contract

```bash
acp publish ./my-contract.ir.json \
  --hub http://localhost:3456 \
  --service my-api \
  --version 1.0.0 \
  --token your-secret-token
```

### Pulling a Contract

```bash
acp pull \
  --hub http://localhost:3456 \
  --service my-api \
  --version 1.0.0 \
  --out ./contracts
```

## Environment Variables

| Variable                     | Description                      | Default          |
| ---------------------------- | -------------------------------- | ---------------- |
| `ACP_HUB_TOKEN`              | Token for publish authentication | `null` (no auth) |
| `ACP_HUB_PORT`               | Port to listen on                | `3456`           |
| `ACP_HUB_DATA_DIR`           | Directory for contract storage   | `.acp-hub-data`  |
| `ACP_HUB_READS_REQUIRE_AUTH` | Require auth for read operations | `0` (false)      |

## HTTP API

### Health Check

```
GET /healthz
```

Returns health status. No authentication required.

### Publish Contract

```
POST /v1/services/:service/contracts
Authorization: Bearer <token>

{
  "version": "1.0.0",
  "ir": { ... },
  "openApi": { ... }  // Optional - will be compiled if not provided
}
```

Publishes a new immutable contract version. Returns 409 Conflict if the version already exists.

### Get Latest Contract

```
GET /v1/services/:service/contracts/latest
```

Returns the most recently published version of a contract.

### Get Specific Version

```
GET /v1/services/:service/contracts/:version
```

Returns a specific version of a contract.

### Get OpenAPI Spec

```
GET /v1/services/:service/contracts/:version/openapi
```

Returns the compiled OpenAPI 3.1 specification for a contract version.

### List Versions

```
GET /v1/services/:service/contracts
```

Lists all published versions for a service.

## Storage

Contracts are stored on the filesystem with the following structure:

```
.acp-hub-data/
├── index.json              # Master index of all contracts
├── audit.ndjson            # Append-only audit log
└── services/
    └── my-api/
        └── 1.0.0/
            ├── ir.json         # Contract IR
            ├── openapi.json    # Compiled OpenAPI
            └── metadata.json   # Version metadata
```

## Security

- **Publish Authentication**: Requires Bearer token when `ACP_HUB_TOKEN` is set
- **Constant-Time Token Comparison**: Prevents timing attacks
- **Path Sanitization**: Prevents path traversal attacks
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection

## Audit Logging

All actions are logged in NDJSON format:

```json
{
  "requestId": "abc-123",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "action": "publish",
  "result": "success",
  "serviceName": "my-api",
  "version": "1.0.0"
}
```

Tokens are **never** logged.

## Development

```bash
# Run tests
pnpm --filter @acp/hub test

# Type check
pnpm --filter @acp/hub typecheck

# Build
pnpm --filter @acp/hub build
```

## License

MIT
