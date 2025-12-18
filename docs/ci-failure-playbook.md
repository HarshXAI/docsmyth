# CI Failure Playbook

This playbook helps you diagnose and fix common CI failures related to the API Contract Platform.

## Quick Reference

| Error Code                     | Description                       | Jump To                                 |
| ------------------------------ | --------------------------------- | --------------------------------------- |
| `VALIDATION_FAILED`            | Contract IR validation error      | [Validation Errors](#validation-errors) |
| `BC001_ENDPOINT_REMOVED`       | Breaking: Endpoint removed        | [Breaking Changes](#breaking-changes)   |
| `BC002_OPERATION_ID_CHANGED`   | Breaking: Operation ID changed    | [Breaking Changes](#breaking-changes)   |
| `BC003_REQUIRED_FIELD_ADDED`   | Breaking: Required field added    | [Breaking Changes](#breaking-changes)   |
| `BC004_RESPONSE_REMOVED`       | Breaking: Response status removed | [Breaking Changes](#breaking-changes)   |
| `SCHEMA_CYCLE_ERROR`           | Recursive schema cycle detected   | [Schema Errors](#schema-errors)         |
| `SCHEMA_DEPTH_ERROR`           | Schema nesting too deep           | [Schema Errors](#schema-errors)         |
| `EVIDENCE_VERIFICATION_FAILED` | Evidence doesn't match contract   | [Evidence Errors](#evidence-errors)     |

---

## Validation Errors

### `REQUIRED_FIELD` - Missing required field

**Example:**

```
Error: irVersion is required
  at path: irVersion
```

**Fix:** Add the missing field to your contract:

```json
{
  "irVersion": "0.1",
  ...
}
```

### `UNSUPPORTED_VERSION` - Invalid IR version

**Example:**

```
Error: irVersion must be "0.1". Got: "1.0"
```

**Fix:** Use a supported IR version:

```json
{
  "irVersion": "0.1"
}
```

### `DUPLICATE_OPERATION_ID` - Non-unique operation IDs

**Example:**

```
Error: Duplicate operationId: getUser
```

**Fix:** Ensure each operation has a unique `operationId`:

```json
{
  "operations": [
    { "operationId": "getUserById", ... },
    { "operationId": "getUserByEmail", ... }
  ]
}
```

---

## Breaking Changes

### General Approach

When a breaking change is detected:

1. **Evaluate if the change is necessary**
   - Can you make the change backward-compatible?
   - Can you add a new operation instead of modifying the existing one?

2. **If breaking change is required:**
   - Document the change in your changelog
   - Communicate to API consumers
   - Consider deprecation period
   - Coordinate deployment with consumers

3. **To bypass for intentional breaking changes:**
   ```bash
   npx acp diff base.json head.json --allow-breaking
   ```

### BC001: Endpoint Removed

**Example:**

```
BREAKING: Endpoint DELETE /users/{id} (operationId: deleteUser) was removed
```

**Options:**

- **Restore the endpoint** if removal was accidental
- **Deprecate first** using the `deprecated: true` flag, then remove in next major version
- **Add a replacement** endpoint before removing

### BC002: Operation ID Changed

**Example:**

```
BREAKING: operationId changed from "getUser" to "fetchUser" for GET /users/{id}
```

**Why it breaks:** Client SDKs often use operation IDs for method names.

**Fix:** Keep the original operation ID, or:

1. Add a new operation with the new ID
2. Deprecate the old operation
3. Remove after migration period

### BC003: Required Field Added

**Example:**

```
BREAKING: Required field "email" added to request body for POST /users
```

**Options:**

- **Make field optional** with a default value
- **Add as separate operation** with new path (e.g., `/v2/users`)

### BC004: Response Removed

**Example:**

```
BREAKING: Response status 404 removed from GET /users/{id}
```

**Why it breaks:** Clients may be handling this status code.

**Fix:** Restore the response definition:

```json
{
  "responses": [
    { "statusCode": 200, "schema": { "$ref": "schema:User" } },
    { "statusCode": 404, "schema": { "$ref": "schema:NotFoundError" } }
  ]
}
```

---

## Schema Errors

### SCHEMA_CYCLE_ERROR

**Example:**

```
SchemaCycleError: Cycle detected in operation 'getUser':
  $ -> properties.friends -> items -> $ref(User) -> properties.friends -> schema:User
```

**This is usually OK!** Recursive schemas are valid and supported. The error only occurs if:

- The cycle causes infinite traversal (shouldn't happen with proper $ref handling)
- Custom schema processing doesn't handle cycles

**If you see this error during compilation:**

1. Ensure you're using `$ref` for recursive references, not inline schemas
2. Check your IR for accidentally duplicated inline schemas

**Correct pattern:**

```json
{
  "schemas": {
    "User": {
      "$id": "User",
      "type": "object",
      "properties": {
        "friends": {
          "type": "array",
          "items": { "$ref": "schema:User" }
        }
      }
    }
  }
}
```

### SCHEMA_DEPTH_ERROR

**Example:**

```
SchemaDepthError: Maximum schema depth (100) exceeded in operation 'getData'
```

**Possible causes:**

1. Extremely deeply nested inline schemas
2. Missing `$ref` for complex types
3. Configuration issue

**Fixes:**

1. **Use $ref for complex types:**

   ```json
   // Instead of deep inline nesting
   { "properties": { "level1": { "properties": { "level2": { ... } } } } }

   // Use refs
   { "properties": { "level1": { "$ref": "schema:Level1" } } }
   ```

2. **Increase max depth if needed:**
   ```bash
   npx acp compile contract.json --max-depth 200
   ```

---

## Evidence Errors

### Unknown operation

**Example:**

```
Error at event 5: Unknown operation: getUserProfile
```

**Cause:** Evidence contains operation ID not in contract.

**Fixes:**

1. Add the operation to your contract
2. Fix the operation ID in your runtime tagging
3. Exclude unknown operations from verification:
   ```bash
   npx acp evidence verify evidence.ndjson --contract contract.json --skip-unknown
   ```

### Schema validation failed

**Example:**

```
Error at event 12 (getUser): Response body validation failed
  - /email: must match format "email"
```

**Cause:** Actual API response doesn't match contract schema.

**Options:**

1. **Fix the API** to return conforming data
2. **Update the contract** if the schema was incorrect
3. **Add test fixtures** for edge cases

### Rate limit exceeded

**Example:**

```
Warning: Rate limit exceeded, 150 events dropped
```

**Cause:** Evidence capture is dropping events due to rate limiting.

**Fixes:**

1. Increase rate limit:
   ```bash
   ACP_MAX_EVENTS_PER_SECOND=500 npm test
   ```
2. Use deduplication to reduce event count:
   ```bash
   ACP_ENABLE_DEDUPE=true npm test
   ```

---

## Getting Help

### Collect Debug Info

Before asking for help, collect:

```bash
# 1. ACP version
npx acp --version

# 2. Validation output
npx acp validate contract.json --verbose

# 3. Diff output
npx acp diff base.json head.json --verbose

# 4. Evidence stats
npx acp evidence stats evidence.ndjson
```

### Contact

- Slack: #api-contract-platform
- Create an issue with the debug info above
