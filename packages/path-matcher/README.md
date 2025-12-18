# @acp/path-matcher

Shared path matching utilities for Contract IR path patterns. Used by both `@acp/runtime-node-express` and `@acp/capture-proxy` to ensure consistent path matching behavior.

## Installation

```bash
npm install @acp/path-matcher
# or
pnpm add @acp/path-matcher
```

## Features

- **Path format conversion**: Convert between Express (`:id`) and OpenAPI/IR (`{id}`) formats
- **Path matching**: Match request paths against IR path patterns
- **Operation matching**: Find operations from a Contract IR by method and path
- **Pre-compilation**: Compile path patterns for efficient repeated matching

## Usage

### Path Format Conversion

```typescript
import { expressPathToIrPath, irPathToExpressPath } from '@acp/path-matcher';

// Convert Express to IR format
expressPathToIrPath('/users/:id/posts/:postId');
// => '/users/{id}/posts/{postId}'

// Convert IR to Express format
irPathToExpressPath('/users/{id}/posts/{postId}');
// => '/users/:id/posts/:postId'
```

### Path Matching

```typescript
import { matchPath, normalizePath } from '@acp/path-matcher';

// Normalize paths for comparison
normalizePath('/users/'); // => '/users'
normalizePath('users'); // => '/users'

// Match paths and extract parameters
matchPath('/users/123', '/users/{id}');
// => { id: '123' }

matchPath('/users/abc/posts/xyz', '/users/{userId}/posts/{postId}');
// => { userId: 'abc', postId: 'xyz' }

matchPath('/orders/123', '/users/{id}');
// => null (no match)
```

### Pre-compiled Path Matcher

For repeated matching against the same pattern:

```typescript
import { createPathMatcher } from '@acp/path-matcher';

const matcher = createPathMatcher('/users/{userId}/posts/{postId}');
// matcher.regex: /^\/users\/([^/]+)\/posts\/([^/]+)$/
// matcher.paramNames: ['userId', 'postId']
// matcher.pattern: '/users/{userId}/posts/{postId}'
```

### Operation Matching

Match HTTP requests to Contract IR operations:

```typescript
import { createOperationMatcher, findOperation } from '@acp/path-matcher';
import type { ContractIR } from '@acp/ir-spec';

const contract: ContractIR = {
  irVersion: '0.1',
  service: { name: 'users-api', version: '1.0.0' },
  schemas: {},
  operations: [
    { operationId: 'getUser', method: 'GET', path: '/users/{id}', ... },
    { operationId: 'createUser', method: 'POST', path: '/users', ... },
  ],
};

// Create pre-compiled matcher (do once at startup)
const matcher = createOperationMatcher(contract);

// Find matching operation
const result = findOperation(matcher, 'GET', '/users/123');
// => {
//      operation: { operationId: 'getUser', method: 'GET', path: '/users/{id}', ... },
//      params: { id: '123' },
//      pathTemplate: '/users/{id}'
//    }

findOperation(matcher, 'DELETE', '/users/123');
// => null (no matching operation)
```

## API Reference

### Path Conversion

- `expressPathToIrPath(path: string): string` - Convert Express path params to IR format
- `irPathToExpressPath(path: string): string` - Convert IR path params to Express format

### Path Matching

- `normalizePath(path: string): string` - Normalize path (add leading `/`, remove trailing `/`)
- `matchPath(requestPath: string, irPath: string): Record<string, string> | null` - Match and extract params
- `createPathMatcher(irPath: string): PathMatcher` - Create compiled pattern

### Operation Matching

- `createOperationMatcher(contract: ContractIR): OperationMatcher` - Create from contract
- `findOperation(matcher: OperationMatcher, method: string, path: string): OperationMatchResult | null`

## Types

```typescript
interface PathMatcher {
  regex: RegExp;
  paramNames: string[];
  pattern: string;
}

interface OperationMatcher {
  byMethod: Map<string, Array<{ operation: HttpOperation; pathMatcher: PathMatcher }>>;
  operationCount: number;
  serviceName: string;
  serviceVersion: string;
}

interface OperationMatchResult {
  operation: HttpOperation;
  params: Record<string, string>;
  pathTemplate: string;
}
```

## License

MIT
