# Troubleshooting Guide

This guide covers common issues and solutions when working with the API Contract Platform.

## Quick Diagnostics

Run these commands to gather diagnostic information:

```bash
# Check CLI version
docsmyth --version

# Validate contract
docsmyth validate contract/contract.ir.json --verbose

# Check Node.js version
node --version

# Check pnpm version
pnpm --version
```

## Contract Validation Errors

### "Invalid contract: missing required field"

**Symptom:**

```
Error: Contract validation failed
  - /info/title: required field missing
```

**Solution:**
Ensure your contract has all required fields:

```json
{
  "version": "0.1",
  "info": {
    "title": "My API", // Required
    "version": "1.0.0" // Required
  },
  "operations": []
}
```

### "Unknown schema reference"

**Symptom:**

```
Error: Cannot resolve $ref: #/schemas/UnknownType
```

**Solution:**

1. Check that the referenced schema exists in the `schemas` section
2. Verify the reference path is correct (case-sensitive)

```json
{
  "schemas": {
    "User": { ... }  // Make sure this matches
  },
  "operations": [
    {
      "response": {
        "schema": { "$ref": "#/schemas/User" }  // Case must match
      }
    }
  ]
}
```

### "Invalid JSON syntax"

**Symptom:**

```
SyntaxError: Unexpected token } in JSON at position 245
```

**Solution:**

1. Check for trailing commas (not allowed in JSON)
2. Check for unquoted strings
3. Use a JSON validator or IDE with JSON support

```json
// ❌ Invalid - trailing comma
{ "name": "test", }

// ✅ Valid
{ "name": "test" }
```

## Compilation Errors

### "Unsupported schema feature"

**Symptom:**

```
Warning: Schema feature 'oneOf with discriminator' may not compile correctly
```

**Solution:**
Some advanced schema features have limited OpenAPI support. Options:

1. Simplify the schema
2. Use overlays to customize the OpenAPI output
3. Accept the warning if output is acceptable

See [Schema Support](../schema-support.md) for supported features.

### "Circular reference detected"

**Symptom:**

```
Error: Maximum call stack size exceeded
```

**Solution:**
Break circular references using lazy evaluation:

```json
// Instead of direct circular reference
{
  "schemas": {
    "Node": {
      "properties": {
        "children": {
          "type": "array",
          "items": { "$ref": "#/schemas/Node" } // This is fine
        }
      }
    }
  }
}
```

If still failing, flatten the structure or use `maxDepth` option.

## Evidence Verification Errors

### "No evidence file found"

**Symptom:**

```
Error: Evidence file not found: evidence.ndjson
```

**Solution:**

1. Enable evidence capture in your tests:
   ```bash
   ACP_EVIDENCE_CAPTURE=true pnpm test
   ```
2. Verify the output path matches your configuration
3. Check that tests actually ran and made HTTP requests

### "Operation not found in contract"

**Symptom:**

```
Evidence mismatch: Operation "GET /users/123" not found in contract
```

**Solutions:**

**Issue 1: Path parameter mismatch**

```json
// Contract uses :id syntax
{ "path": "/users/:id" }

// But implementation uses different pattern
app.get('/users/{userId}', ...)  // Won't match!
```

Fix: Use consistent path parameter syntax.

**Issue 2: Missing operation**
The endpoint exists in code but not in contract. Add it:

```json
{
  "operations": [
    {
      "operationId": "getUser",
      "method": "GET",
      "path": "/users/:id",
      ...
    }
  ]
}
```

### "Response schema mismatch"

**Symptom:**

```
Evidence mismatch: Response body doesn't match schema
  Expected: { "id": string, "name": string }
  Actual: { "id": number, "name": string }
```

**Solution:**
Update contract or implementation to match:

```json
// If ID should be number, update contract:
{
  "id": { "type": "integer" }  // was "string"
}

// Or if ID should be string, update implementation:
return { id: String(user.id), name: user.name };
```

### "Missing required response field"

**Symptom:**

```
Evidence mismatch: Required field 'createdAt' missing in response
```

**Solutions:**

1. Add the field to your response
2. Mark the field as optional in the contract:

```json
{
  "required": ["id", "name"], // Remove "createdAt" from required
  "properties": {
    "createdAt": { "type": "string" }
  }
}
```

## Hub Connection Issues

### "Connection refused"

**Symptom:**

```
Error: connect ECONNREFUSED 127.0.0.1:3000
```

**Solutions:**

1. Verify the Hub is running:
   ```bash
   curl http://localhost:3000/health
   ```
2. Check the Hub URL is correct:
   ```bash
   export ACP_HUB_URL=http://localhost:3000
   ```
3. Check firewall/network settings

### "Unauthorized"

**Symptom:**

```
Error: 401 Unauthorized
```

**Solutions:**

1. Set your Hub token:
   ```bash
   export ACP_HUB_TOKEN=your-token-here
   ```
2. Verify token is valid and not expired
3. Check token has required permissions

### "Contract not found"

**Symptom:**

```
Error: 404 Contract 'my-api' not found
```

**Solutions:**

1. Verify contract name (case-sensitive):
   ```bash
   docsmyth hub list  # See all contracts
   ```
2. Check you're connected to the right Hub instance
3. Verify you have read access to the contract

## CI/CD Issues

### "npm pack failed in smoke test"

**Symptom:**

```
Smoke test failed: npm pack returned non-zero exit code
```

**Solutions:**

1. Check all packages build successfully:
   ```bash
   pnpm build
   ```
2. Verify package.json files are valid
3. Check for missing files in package includes

### "Turbo cache miss causing slow builds"

**Symptom:**
CI builds taking longer than expected, cache not being used.

**Solutions:**

1. Verify turbo.json hash inputs:
   ```json
   {
     "pipeline": {
       "build": {
         "inputs": ["src/**", "tsconfig.json"]
       }
     }
   }
   ```
2. Check cache key in workflow matches
3. Verify TURBO_TOKEN is set for remote caching

### "Breaking change detected but expected"

**Symptom:**

```
Error: Breaking changes detected - workflow failed
```

**Solutions:**

1. Add `[breaking]` to commit message
2. Set `fail-on-breaking: false` in workflow
3. Review changes and update version appropriately

## Evidence Capture Issues

### "Evidence file growing too large"

**Symptom:**
Evidence files consuming excessive disk space.

**Solutions:**

1. Configure file size limits:
   ```typescript
   createEvidenceCaptureMiddleware({
     limits: {
       maxFileBytes: 50 * 1024 * 1024, // 50 MB
       maxEventsPerOperation: 100,
     },
   });
   ```
2. Enable deduplication:
   ```typescript
   createEvidenceCaptureMiddleware({
     limits: {
       dedupeWindowMs: 60000, // 60 seconds
     },
     enableDedupe: true,
   });
   ```
3. Clean up before test runs:
   ```bash
   rm -f evidence.ndjson*
   ```

### "Rate limited events"

**Symptom:**
Stats show many rate-limited events:

```
Stats: { written: 100, rateLimitedEvents: 5000 }
```

**Solutions:**

1. This is working as designed - rate limiting prevents runaway capture
2. If you need more events, increase the limit:
   ```typescript
   limits: {
     maxEventsPerSecond: 200,  // Increase from default 100
   }
   ```
3. Consider if you really need that many samples

### "Sensitive data in evidence"

**Symptom:**
Evidence file contains data that should be redacted.

**Solutions:**

1. Use stricter sanitization profile:
   ```typescript
   sanitizeConfig: {
     profile: 'strict',
   }
   ```
2. Add custom sensitive fields:
   ```typescript
   sanitizeConfig: {
     sensitiveFields: ['ssn', 'taxId', 'accountNumber'],
   }
   ```
3. Add custom patterns:
   ```typescript
   sanitizeConfig: {
     maskPatterns: [/ACCT-\d{12}/g],
   }
   ```

**Default blocked headers:**

- `authorization`
- `cookie`
- `set-cookie`
- `x-api-key`
- `x-auth-token`
- `x-csrf-token`
- `x-xsrf-token`

These are always removed and cannot be captured.

## TypeScript Issues

### "Cannot find module '@docsmyth/...'"

**Symptom:**

```
Cannot find module '@docsmyth/cli' or its corresponding type declarations
```

**Solutions:**

1. Install the package:
   ```bash
   pnpm add @docsmyth/cli
   ```
2. Check tsconfig.json includes node_modules:
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "NodeNext"
     }
   }
   ```
3. Run `pnpm install` to refresh lockfile

### "Type mismatch with Zod schemas"

**Symptom:**
TypeScript errors when using Zod-inferred types.

**Solution:**
Ensure consistent type inference:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

// Use z.infer for type
type User = z.infer<typeof UserSchema>;

// Now types match
const user: User = UserSchema.parse(data);
```

## Performance Issues

### "Slow contract validation"

**Symptom:**
Validation taking > 1 second.

**Solutions:**

1. Large contracts with many schemas can be slow - this is normal
2. Cache validation results in CI
3. Split large contracts into smaller services

### "High memory usage during capture"

**Symptom:**
Memory usage increases during evidence capture.

**Solutions:**

1. Use streaming writer (default) - don't buffer in memory
2. Configure appropriate limits:
   ```typescript
   limits: {
     maxEventsPerRun: 10000,
     maxFileBytes: 100 * 1024 * 1024,
   }
   ```
3. Enable deduplication to reduce writes

## Getting Help

If you can't resolve an issue:

1. **Check documentation**: Browse `/docs` for guides
2. **Search issues**: Check GitHub issues for similar problems
3. **Reproduce**: Create a minimal reproduction case
4. **Ask**: Post in #api-contracts Slack channel
5. **File issue**: Open a GitHub issue with:
   - ACP version (`acp --version`)
   - Node.js version (`node --version`)
   - Full error message
   - Minimal reproduction steps

## Diagnostic Commands

```bash
# Full system diagnostic
docsmyth doctor

# Verbose validation
docsmyth validate contract.ir.json --verbose --debug

# Check Hub connectivity
docsmyth hub ping

# Evidence file stats
docsmyth evidence stats evidence.ndjson

# List available commands
docsmyth --help
```

## Related Documentation

- [Day 1 Onboarding](../day-1-onboarding.md) - Getting started
- [Security Model](./security-model.md) - Sanitization settings
- [Retention & Storage](./retention-storage.md) - Storage management
- [CI Integration](../ci-integration.md) - CI/CD setup
- [Schema Support](../schema-support.md) - Supported features
