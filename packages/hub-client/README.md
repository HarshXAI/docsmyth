# @acp/hub-client

Typed HTTP client for the API Contract Platform Hub.

## Installation

```bash
pnpm add @acp/hub-client
```

## Usage

```typescript
import { createHubClient, HubNotFoundError } from '@acp/hub-client';

const client = createHubClient({
  baseUrl: 'http://localhost:3000',
  token: 'optional-auth-token', // For publish operations
  timeout: 30000,
});

// Health check
const isUp = await client.isHealthy();

// List all services
const { services } = await client.listServices();

// List versions for a service
const { versions } = await client.listVersions('orders-api');

// Get a specific contract
const contract = await client.getContract('orders-api', '1.0.0');
console.log(contract.ir);
console.log(contract.metadata);

// Get OpenAPI document
const openApi = await client.getOpenApi('orders-api', '1.0.0');

// Get latest version
const latest = await client.getLatest('orders-api');

// Publish a contract
const result = await client.publish({
  serviceName: 'orders-api',
  version: '1.1.0',
  ir: contractIR,
  description: 'Added new endpoints',
});

// Get coverage artifact
try {
  const coverage = await client.getCoverage('orders-api', '1.0.0');
  console.log(`Coverage: ${coverage.summary.coveragePercent}%`);
} catch (err) {
  if (err instanceof HubNotFoundError) {
    console.log('No coverage published');
  }
}

// Get contracts for diffing
const { base, head } = await client.getContractsForDiff('orders-api', '1.0.0', '1.1.0');
```

## Error Handling

The client throws typed errors for different scenarios:

```typescript
import {
  HubClientError, // Base error class
  HubConnectionError, // Network/timeout errors
  HubNotFoundError, // 404 - Resource not found
  HubConflictError, // 409 - Version already exists
  HubValidationError, // 400 - Invalid request
  HubAuthError, // 401 - Authentication failed
  HubServerError, // 5xx - Server errors
} from '@acp/hub-client';

try {
  await client.getContract('unknown', '1.0.0');
} catch (err) {
  if (err instanceof HubConnectionError) {
    console.log('Hub is down, retry later');
  } else if (err instanceof HubNotFoundError) {
    console.log('Contract not found');
  } else if (err instanceof HubClientError) {
    console.log(`Error ${err.statusCode}: ${err.message}`);
  }
}
```

## API Reference

### `createHubClient(options)`

Creates a new client instance.

**Options:**

- `baseUrl` (string, required): Hub API base URL
- `token` (string, optional): Bearer token for authenticated operations
- `timeout` (number, optional): Request timeout in ms (default: 30000)
- `fetch` (function, optional): Custom fetch implementation

### Methods

| Method                                     | Description                       |
| ------------------------------------------ | --------------------------------- |
| `health()`                                 | Get hub health status             |
| `isHealthy()`                              | Check if hub is reachable         |
| `listServices()`                           | List all services                 |
| `listVersions(service)`                    | List versions for a service       |
| `getLatest(service)`                       | Get latest contract for a service |
| `getContract(service, version)`            | Get a specific contract version   |
| `getOpenApi(service, version)`             | Get OpenAPI document              |
| `publish(options)`                         | Publish a new contract version    |
| `getArtifact(service, version, name)`      | Get a named artifact              |
| `getCoverage(service, version)`            | Get coverage report               |
| `getContractsForDiff(service, base, head)` | Fetch two contracts for diffing   |
