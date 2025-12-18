# Express Starter Template

A production-ready Express + TypeScript API with full ACP (API Contract Platform) integration.

## Features

- 🚀 **Express + TypeScript** with Zod validation
- 📝 **Contract-first development** with Contract IR
- 🔍 **Evidence capture** for production verification
- 🛡️ **Sanitized logging** that never captures sensitive data
- 📊 **Coverage verification** against your contract

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Development Server

```bash
pnpm dev
```

This starts the server with evidence capture enabled. You'll see:

```
🔍 ACP Evidence capture ENABLED
   Evidence will be written to: ./evidence.ndjson

🚀 Server running at http://localhost:3000
   Health check: http://localhost:3000/api/health
   Products: http://localhost:3000/api/products
   Orders: http://localhost:3000/api/orders
```

### 3. Make Some API Calls

```bash
# Health check
curl http://localhost:3000/api/health

# List products
curl http://localhost:3000/api/products

# Create a product
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":29.99,"category":"electronics"}'

# Get a specific product
curl http://localhost:3000/api/products/<product-id>
```

### 4. Verify Evidence

After making API calls, verify the captured evidence matches your contract:

```bash
pnpm run evidence:verify
```

Expected output:

```
✓ Evidence verification passed
  Operations covered: 4/10 (40%)
  Total events verified: 5
```

## Contract Commands

| Command                      | Description                          |
| ---------------------------- | ------------------------------------ |
| `pnpm run contract:validate` | Validate contract.ir.json is correct |
| `pnpm run contract:compile`  | Compile to OpenAPI 3.1               |
| `pnpm run contract:publish`  | Publish to ACP Hub                   |
| `pnpm run evidence:verify`   | Verify evidence against contract     |

## Project Structure

```
.
├── contract/
│   └── contract.ir.json    # Contract IR definition
├── src/
│   ├── server.ts           # Express server + middleware setup
│   ├── routes.ts           # API routes with Zod validation
│   └── schemas.ts          # Zod schemas (request/response types)
├── scripts/
│   └── generate-contract.ts # Contract generation helper
├── evidence.ndjson         # Captured evidence (gitignored)
└── package.json
```

## Configuration

### Environment Variables

| Variable               | Default       | Description                             |
| ---------------------- | ------------- | --------------------------------------- |
| `PORT`                 | `3000`        | Server port                             |
| `NODE_ENV`             | `development` | Environment name                        |
| `ACP_EVIDENCE_ENABLED` | `0`           | Enable evidence capture (`1` = enabled) |
| `ACP_HUB_URL`          | -             | Hub URL for publishing                  |
| `ACP_HUB_TOKEN`        | -             | Hub auth token                          |

### Evidence Capture

Evidence capture is controlled by `ACP_EVIDENCE_ENABLED`:

- **Development** (`pnpm dev`): Enabled by default
- **Production** (`pnpm start`): Disabled by default

When enabled, request/response pairs are:

1. Matched to contract operations by method + path
2. Sanitized (sensitive headers/fields removed)
3. Written to `evidence.ndjson`

### Sanitization Profiles

The evidence SDK supports three profiles:

| Profile    | Use Case                               |
| ---------- | -------------------------------------- |
| `strict`   | Production - removes most headers      |
| `balanced` | Development - keeps useful headers     |
| `debug`    | Local debugging only - keeps more data |

Configure in `src/server.ts`:

```typescript
sanitizeConfig: {
  profile: 'balanced', // or 'strict' or 'debug'
}
```

**Never-captured fields** (regardless of profile):

- `Authorization` header
- `Cookie` / `Set-Cookie` headers
- `x-api-key`, `x-auth-token` headers
- Request/response body fields: `password`, `token`, `secret`, `apiKey`

## Using with ACP Hub

### Local Hub

1. Start a local hub:

```bash
cd ../../../packages/hub
pnpm dev
```

2. Publish your contract:

```bash
ACP_HUB_URL=http://localhost:4000 pnpm run contract:publish
```

### View in Portal

1. Start the UI portal:

```bash
cd ../../../apps/ui-portal
pnpm dev
```

2. Open http://localhost:5173 and browse your published contract.

## Endpoints

This starter includes 10 API endpoints:

### Health

| Method | Path          | Description  |
| ------ | ------------- | ------------ |
| GET    | `/api/health` | Health check |

### Products

| Method | Path                | Description                           |
| ------ | ------------------- | ------------------------------------- |
| GET    | `/api/products`     | List products (paginated, filterable) |
| GET    | `/api/products/:id` | Get product by ID                     |
| POST   | `/api/products`     | Create product                        |
| PUT    | `/api/products/:id` | Update product                        |
| DELETE | `/api/products/:id` | Delete product                        |

### Orders

| Method | Path                     | Description                         |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/api/orders`            | List orders (paginated, filterable) |
| GET    | `/api/orders/:id`        | Get order by ID                     |
| POST   | `/api/orders`            | Create order                        |
| PATCH  | `/api/orders/:id/status` | Update order status                 |

## Using Outside the Monorepo

When using this template in a standalone project, update `package.json` to use npm packages instead of workspace references:

```json
{
  "dependencies": {
    "@acp/runtime-node-express": "^0.1.0",
    "@acp/ir-spec": "^0.1.0"
  },
  "devDependencies": {
    "@acp/cli": "^0.1.0"
  }
}
```

## Troubleshooting

### "Contract file not found"

Ensure `contract/contract.ir.json` exists and is valid:

```bash
pnpm run contract:validate
```

### "No evidence captured"

1. Check `ACP_EVIDENCE_ENABLED=1` is set
2. Verify the contract path in `src/server.ts`
3. Make sure requests match contract paths

### "Evidence verification failed"

Run with verbose output:

```bash
acp evidence verify contract/contract.ir.json --evidence ./evidence.ndjson --verbose
```

This shows which events failed and why.

### Low coverage

Coverage is based on operations in your contract. To increase:

1. Exercise more endpoints
2. Test different response codes (200, 400, 404)
3. Include edge cases

## Next Steps

1. **Add authentication** - Implement JWT or API key auth
2. **Add database** - Replace in-memory store with PostgreSQL/MongoDB
3. **Add tests** - Unit and integration tests with Vitest
4. **Set up CI** - See `templates/github-actions/acp-contract-check.yml`
5. **Configure overlays** - Create public/internal views of your API

## License

MIT
