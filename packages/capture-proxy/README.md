# @acp/capture-proxy

Language-agnostic HTTP sidecar proxy for evidence capture. Works with any HTTP service behind it and emits evidence events mapped to Contract IR operationIds.

## Installation

```bash
npm install @acp/capture-proxy
# or
pnpm add @acp/capture-proxy
```

## Features

- **Language-agnostic**: Works with any HTTP service (Python, Go, Ruby, Java, etc.)
- **Automatic operation mapping**: Matches requests to Contract IR operations
- **Evidence sanitization**: Removes sensitive headers (Authorization, Cookie, etc.)
- **Body truncation**: Configurable max body size with truncation for large payloads
- **Rate limiting**: Prevents evidence explosion with configurable rate limits
- **Hub integration**: Load contracts from the ACP Hub or local files
- **Health endpoint**: Built-in `/_acp/health` endpoint for monitoring

## CLI Usage

The proxy can be started via the ACP CLI:

```bash
# Using a local contract file
acp proxy --target http://localhost:3000 --contract ./contract-ir.json --capture

# Using a contract from the Hub
acp proxy --target http://localhost:3000 \
  --hub-url http://hub.example.com \
  --service my-api \
  --version latest \
  --capture

# Full options
acp proxy \
  --listen 0.0.0.0:8080 \
  --target http://localhost:3000 \
  --contract ./contract-ir.json \
  --capture \
  --out ./evidence.ndjson \
  --max-body-bytes 65536 \
  --event-rate-limit 100 \
  --verbose
```

## Environment Variables

All CLI options can be set via environment variables:

| Variable               | CLI Option           | Description                              |
| ---------------------- | -------------------- | ---------------------------------------- |
| `ACP_PROXY_LISTEN`     | `--listen`           | Listen address (default: `0.0.0.0:8080`) |
| `ACP_PROXY_TARGET_URL` | `--target`           | Upstream target URL                      |
| `ACP_HUB_URL`          | `--hub-url`          | Hub URL for contract loading             |
| `ACP_HUB_TOKEN`        | `--hub-token`        | Hub authentication token                 |
| `ACP_SERVICE`          | `--service`          | Service name for Hub                     |
| `ACP_VERSION`          | `--version`          | Contract version (default: `latest`)     |
| `ACP_CAPTURE`          | `--capture`          | Enable capture (`1` or `true`)           |
| `ACP_EVIDENCE_OUT`     | `--out`              | Evidence output path                     |
| `ACP_MAX_BODY_BYTES`   | `--max-body-bytes`   | Max body size before truncation          |
| `ACP_EVENT_RATE_LIMIT` | `--event-rate-limit` | Events per second limit                  |

## Programmatic Usage

```typescript
import { startProxy, type ProxyConfig } from '@acp/capture-proxy';

const config: ProxyConfig = {
  listen: '0.0.0.0:8080',
  targetUrl: 'http://localhost:3000',
  captureEnabled: true,
  contractSource: { type: 'file', path: './contract-ir.json' },
  evidenceOutputPath: './evidence.ndjson',
  maxBodyBytes: 65536,
  eventRateLimit: 100,
  logLevel: 'info',
};

const server = await startProxy(config);

console.log(`Proxy listening on ${server.getListenAddress()}`);

// Get health status
const health = server.getHealth();
console.log(`Events captured: ${health.capture.eventsWritten}`);

// Stop the proxy
await server.stop();
```

## Health Endpoint

The proxy exposes a health endpoint at `/_acp/health` that returns:

```json
{
  "status": "ok",
  "proxy": {
    "listening": true,
    "listenAddress": "0.0.0.0:8080",
    "targetUrl": "http://localhost:3000"
  },
  "contract": {
    "loaded": true,
    "serviceName": "orders-api",
    "serviceVersion": "1.0.0",
    "operationCount": 5
  },
  "capture": {
    "enabled": true,
    "eventsWritten": 42,
    "eventsDropped": 0
  },
  "uptime": 3600
}
```

## Docker Usage

```dockerfile
FROM node:20-alpine

RUN npm install -g @acp/cli

ENV ACP_PROXY_LISTEN=0.0.0.0:8080
ENV ACP_CAPTURE=1

EXPOSE 8080

ENTRYPOINT ["acp", "proxy"]
```

```yaml
# docker-compose.yml
services:
  my-api:
    build: .
    ports:
      - '3000:3000'

  capture-proxy:
    image: acp-proxy
    ports:
      - '8080:8080'
    environment:
      - ACP_PROXY_TARGET_URL=http://my-api:3000
      - ACP_HUB_URL=http://hub:3456
      - ACP_SERVICE=my-api
      - ACP_CAPTURE=1
    volumes:
      - ./evidence:/app/evidence
```

## Evidence Format

Evidence is emitted as NDJSON (newline-delimited JSON):

```json
{
  "evidenceVersion": "0.1",
  "operationId": "createOrder",
  "protocol": "http",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "traceId": "acp-abc123",
  "request": {
    "method": "POST",
    "path": "/orders",
    "headers": { "content-type": "application/json" },
    "body": { "customerId": "cust-1" }
  },
  "response": {
    "status": 201,
    "headers": { "content-type": "application/json" },
    "body": { "id": "ord-123" }
  }
}
```

## Comparison with @acp/runtime-node-express

| Feature               | @acp/capture-proxy         | @acp/runtime-node-express |
| --------------------- | -------------------------- | ------------------------- |
| Integration           | Sidecar (any language)     | Express middleware        |
| Setup                 | Zero code changes          | Requires middleware       |
| Performance           | Slight latency (proxy hop) | In-process (minimal)      |
| Access to app context | No                         | Yes (trace IDs, etc.)     |
| Best for              | Legacy apps, polyglot      | Express/Node.js apps      |

## License

MIT
