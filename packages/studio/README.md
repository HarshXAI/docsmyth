# @docsmyth/studio

Docsmyth Studio - A first-class UI for API contract exploration and evidence visualization.

## Features

- **Contract Explorer**: Browse and search your API operations, schemas, and security definitions
- **Evidence Timeline**: View and search captured API request/response pairs
- **Coverage Heatmap**: Visualize which operations and status codes have evidence coverage
- **Issues Dashboard**: View contract violations, drift, and invalid evidence
- **Contract Wizard**: Initialize a new Contract IR file with a minimal valid skeleton

## Installation

```bash
npm install -g @docsmyth/studio
# or
npx @docsmyth/studio --help
```

## Usage

### Standalone CLI

```bash
# Start studio with a contract file
docsmyth-studio --contract ./path/to/contract.json

# Start with evidence file
docsmyth-studio --contract ./contract.json --evidence ./evidence.ndjson

# Specify port and host
docsmyth-studio --contract ./contract.json --port 8080 --host 0.0.0.0

# Don't open browser automatically
docsmyth-studio --contract ./contract.json --no-open
```

### Via Docsmyth CLI

```bash
docsmyth studio --contract ./contract.json --evidence ./evidence.ndjson
```

### Programmatic API

```typescript
import { startStudio } from '@docsmyth/studio';

await startStudio({
  contractPath: './path/to/contract.json',
  evidencePath: './path/to/evidence.ndjson',
  port: 8787,
  host: '127.0.0.1',
  open: true,
});
```

## API Endpoints

The studio server provides the following API endpoints:

### Contract

- `GET /api/contract` - Read contract file
- `POST /api/contract/init` - Initialize a new contract file
- `POST /api/contract/validate` - Validate contract against IR spec

### Compile

- `POST /api/compile` - Compile contract to OpenAPI (preview)

### Evidence

- `GET /api/evidence/summary` - Get evidence statistics
- `GET /api/evidence/events` - List events (paginated, filterable)
- `GET /api/evidence/event/:index` - Get single event by index
- `POST /api/evidence/verify` - Verify evidence against contract

### Coverage

- `GET /api/coverage` - Get coverage statistics per operation

### Issues

- `GET /api/issues` - Get grouped issues (invalid evidence, drift, etc.)

## Development

```bash
# Install dependencies
pnpm install

# Build everything
pnpm build

# Run in development mode
pnpm dev
```

## License

MIT
