# @acp/ui-portal

Web UI for browsing API contracts, viewing diffs, and checking coverage.

## Features

- **Service Browser**: View all published services and their versions
- **OpenAPI Documentation**: Interactive documentation viewer for each contract version
- **Version Comparison**: Compare two versions and see breaking/non-breaking changes
- **Coverage Display**: View test coverage per operation when evidence is published

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- A running instance of `@acp/hub`

### Running locally

1. Start the hub:

   ```bash
   cd packages/hub
   pnpm dev
   ```

2. Start the portal:

   ```bash
   cd apps/ui-portal
   pnpm dev
   ```

3. Open http://localhost:5173

### Environment Variables

| Variable       | Description                   | Default     |
| -------------- | ----------------------------- | ----------- |
| `VITE_HUB_URL` | Hub API base URL (production) | Same origin |

In development, the Vite dev server proxies `/api/*` requests to `http://localhost:3000`.

## Building

```bash
pnpm build
```

Output is in `dist/` and can be served by any static file server.

## Testing

```bash
pnpm test
```

## Routes

| Route                                  | Description                                      |
| -------------------------------------- | ------------------------------------------------ |
| `/`                                    | Service list                                     |
| `/services/:service`                   | Version list for a service                       |
| `/services/:service/versions/:version` | Version detail with docs, coverage, and raw data |
| `/services/:service/diff`              | Compare two versions                             |

## Architecture

- **Framework**: React 18 + React Router
- **Build Tool**: Vite
- **Styling**: Plain CSS with CSS custom properties
- **Data Fetching**: `@acp/hub-client` with custom `useAsync` hook
- **Diff Engine**: `@acp/linter` runs client-side for instant diffs
