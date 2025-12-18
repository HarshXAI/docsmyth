# Schema Edge Cases & Support Matrix

This document describes the JSON Schema constructs supported by the API Contract Platform (ACP), their behavior, and known limitations.

## Support Matrix

### Core Types

| Feature         | IR Support | OpenAPI Output | Evidence Verify | Notes        |
| --------------- | ---------- | -------------- | --------------- | ------------ |
| `type: string`  | ✅         | ✅             | ✅              | Full support |
| `type: number`  | ✅         | ✅             | ✅              | Full support |
| `type: integer` | ✅         | ✅             | ✅              | Full support |
| `type: boolean` | ✅         | ✅             | ✅              | Full support |
| `type: null`    | ✅         | ✅             | ✅              | Full support |
| `type: object`  | ✅         | ✅             | ✅              | Full support |
| `type: array`   | ✅         | ✅             | ✅              | Full support |

### Object Features

| Feature                          | IR Support | OpenAPI Output | Evidence Verify | Notes                |
| -------------------------------- | ---------- | -------------- | --------------- | -------------------- |
| `properties`                     | ✅         | ✅             | ✅              | Full support         |
| `required`                       | ✅         | ✅             | ✅              | Full support         |
| `additionalProperties: true`     | ✅         | ✅             | ✅              | Allow any additional |
| `additionalProperties: false`    | ✅         | ✅             | ✅              | No additional        |
| `additionalProperties: {schema}` | ✅         | ✅             | ✅              | Typed additional     |
| `patternProperties`              | ⚠️         | ⚠️             | ⚠️              | Pass-through only    |
| `minProperties`                  | ⚠️         | ⚠️             | ✅              | Pass-through         |
| `maxProperties`                  | ⚠️         | ⚠️             | ✅              | Pass-through         |

### Array Features

| Feature                      | IR Support | OpenAPI Output | Evidence Verify | Notes        |
| ---------------------------- | ---------- | -------------- | --------------- | ------------ |
| `items: {schema}`            | ✅         | ✅             | ✅              | Full support |
| `items: [{schemas}]` (tuple) | ⚠️         | ⚠️             | ✅              | Pass-through |
| `minItems`                   | ⚠️         | ⚠️             | ✅              | Pass-through |
| `maxItems`                   | ⚠️         | ⚠️             | ✅              | Pass-through |
| `uniqueItems`                | ⚠️         | ⚠️             | ✅              | Pass-through |

### String Features

| Feature     | IR Support | OpenAPI Output | Evidence Verify | Notes            |
| ----------- | ---------- | -------------- | --------------- | ---------------- |
| `format`    | ✅         | ✅             | ✅              | Standard formats |
| `enum`      | ✅         | ✅             | ✅              | Full support     |
| `pattern`   | ⚠️         | ⚠️             | ✅              | Pass-through     |
| `minLength` | ⚠️         | ⚠️             | ✅              | Pass-through     |
| `maxLength` | ⚠️         | ⚠️             | ✅              | Pass-through     |

### Schema Composition

| Feature | IR Support | OpenAPI Output | Evidence Verify | Notes        |
| ------- | ---------- | -------------- | --------------- | ------------ |
| `oneOf` | ✅         | ✅             | ✅              | Full support |
| `anyOf` | ✅         | ✅             | ✅              | Full support |
| `allOf` | ✅         | ✅             | ✅              | Full support |
| `not`   | ⚠️         | ⚠️             | ✅              | Pass-through |

### Nullable

| Feature                    | IR Support | OpenAPI Output | Evidence Verify | Notes                                                |
| -------------------------- | ---------- | -------------- | --------------- | ---------------------------------------------------- |
| `nullable: true`           | ✅         | ✅\*           | ✅              | \*Converted to `type: ["string", "null"]` in OAS 3.1 |
| `type: ["string", "null"]` | ✅         | ✅             | ✅              | Direct array type                                    |

### References

| Feature               | IR Support | OpenAPI Output | Evidence Verify | Notes                                    |
| --------------------- | ---------- | -------------- | --------------- | ---------------------------------------- |
| `$ref: "schema:Name"` | ✅         | ✅             | ✅              | Converted to `#/components/schemas/Name` |
| Self-recursive refs   | ✅         | ✅             | ✅              | Preserved as $ref                        |
| Mutual recursive refs | ✅         | ✅             | ✅              | Preserved as $ref                        |

### Discriminator

| Feature                      | IR Support | OpenAPI Output | Evidence Verify | Notes                         |
| ---------------------------- | ---------- | -------------- | --------------- | ----------------------------- |
| `discriminator.propertyName` | ✅         | ✅             | ⚠️              | OpenAPI discriminator support |
| `discriminator.mapping`      | ✅         | ✅             | ⚠️              | Ajv doesn't use discriminator |

**Legend:**

- ✅ Full support
- ⚠️ Pass-through (works but not actively processed)
- ❌ Not supported

---

## Common Patterns

### Discriminated Unions

Use `oneOf` with `discriminator` for type-safe unions:

```json
{
  "schemas": {
    "Cat": {
      "$id": "Cat",
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["cat"] },
        "meow": { "type": "boolean" }
      },
      "required": ["type"]
    },
    "Dog": {
      "$id": "Dog",
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["dog"] },
        "bark": { "type": "boolean" }
      },
      "required": ["type"]
    },
    "Pet": {
      "$id": "Pet",
      "oneOf": [{ "$ref": "schema:Cat" }, { "$ref": "schema:Dog" }],
      "discriminator": {
        "propertyName": "type",
        "mapping": {
          "cat": "schema:Cat",
          "dog": "schema:Dog"
        }
      }
    }
  }
}
```

### Composition with allOf

Use `allOf` to compose multiple schemas:

```json
{
  "schemas": {
    "Timestamps": {
      "$id": "Timestamps",
      "type": "object",
      "properties": {
        "createdAt": { "type": "string", "format": "date-time" },
        "updatedAt": { "type": "string", "format": "date-time" }
      }
    },
    "User": {
      "$id": "User",
      "allOf": [
        { "$ref": "schema:Timestamps" },
        {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "email": { "type": "string", "format": "email" }
          },
          "required": ["id", "email"]
        }
      ]
    }
  }
}
```

### Nullable Fields

For optional fields that can be null:

```json
{
  "properties": {
    "nickname": {
      "type": "string",
      "nullable": true
    }
  }
}
```

Or using type array (OpenAPI 3.1 style):

```json
{
  "properties": {
    "nickname": {
      "type": ["string", "null"]
    }
  }
}
```

### Self-Recursive Schemas

For tree structures:

```json
{
  "schemas": {
    "TreeNode": {
      "$id": "TreeNode",
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "children": {
          "type": "array",
          "items": { "$ref": "schema:TreeNode" }
        }
      }
    }
  }
}
```

### Records/Maps

For string-keyed maps:

```json
{
  "schemas": {
    "StringMap": {
      "$id": "StringMap",
      "type": "object",
      "additionalProperties": { "type": "string" }
    },
    "UserMap": {
      "$id": "UserMap",
      "type": "object",
      "additionalProperties": { "$ref": "schema:User" }
    }
  }
}
```

---

## Recursion Policy

### Supported Recursive Patterns

1. **Self-reference via $ref**

   ```json
   { "items": { "$ref": "schema:SameSchema" } }
   ```

2. **Mutual recursion via $ref**
   ```json
   // A references B, B references A
   { "$ref": "schema:SchemaA" } // in SchemaB
   { "$ref": "schema:SchemaB" } // in SchemaA
   ```

### Behavior

- **Compilation**: $refs are preserved, not inlined. No infinite loops.
- **Diff checking**: Cycle-safe traversal with visited tracking.
- **Evidence verification**: Ajv handles cycles natively.

### Limits

- **Max depth**: 100 levels by default (configurable via `--max-depth`)
- **Cycle detection**: Throws `SchemaCycleError` with actionable message

### Error Messages

Errors include:

- Operation ID (when available)
- Schema path showing the traversal
- Suggested fix

Example:

```
SchemaCycleError: Cycle detected in operation 'getTree':
  $ -> properties.children -> items -> $ref(TreeNode) -> schema:TreeNode
Consider using $ref to break the cycle or restructure the schema.
```

---

## Evidence Limits

### Default Limits

| Limit                | Default   | Env Variable                   |
| -------------------- | --------- | ------------------------------ |
| Max file size        | 100 MB    | `ACP_MAX_FILE_BYTES`           |
| Events per run       | Unlimited | `ACP_MAX_EVENTS_PER_RUN`       |
| Events per operation | 1000      | `ACP_MAX_EVENTS_PER_OPERATION` |
| Events per second    | 100       | `ACP_MAX_EVENTS_PER_SECOND`    |

### Behaviors

- **File rotation**: When `maxFileBytes` is reached, creates `evidence.1.ndjson`, `evidence.2.ndjson`, etc.
- **Rate limiting**: Drops events silently, logs warning every 100 drops
- **Operation limits**: Per-operation cap prevents one noisy endpoint from dominating
- **Deduplication**: Optional, uses hash of `operationId + request + response`

---

## Sanitizer Profiles

| Profile    | Use Case     | Headers Kept        | PII Masking | Token Masking |
| ---------- | ------------ | ------------------- | ----------- | ------------- |
| `strict`   | Production   | Only `content-type` | ✅          | ✅            |
| `balanced` | Staging/Test | Common debugging    | ✅          | ✅            |
| `debug`    | Local dev    | Many (not auth)     | ✅          | ✅            |

**Never captured** (any profile):

- `Authorization`
- `Cookie` / `Set-Cookie`
- `X-API-Key`
- `X-Auth-Token`
- `Proxy-Authorization`

---

## Known Limitations

1. **Tuple validation**: Array tuples (`items: [...]`) pass through but aren't actively validated
2. **patternProperties**: Supported by Ajv but not actively used in IR processing
3. **Conditional schemas**: `if/then/else` not actively supported
4. **$defs**: Internal definitions not actively processed (use top-level schemas)
5. **External $refs**: Only `schema:Name` refs supported, not external URLs
