# Contributing: Fixture-First Workflow

When encountering a new edge case or bug, follow this fixture-first workflow to ensure proper coverage and prevent regressions.

## The Fixture-First Rule

> **Every bug fix or edge case MUST come with a fixture + test before the code change.**

This ensures:

1. The issue is reproducible
2. The fix is verified
3. Future regressions are caught

## Workflow

### 1. Reproduce with a Fixture

Before writing any fix, create a minimal fixture that demonstrates the issue.

#### For Contract IR Issues

Create a new file in `fixtures/contract-ir/v0.1/`:

```json
// fixtures/contract-ir/v0.1/issue-123-description.json
{
  "irVersion": "0.1",
  "service": {
    "name": "issue-123-test",
    "version": "1.0.0"
  },
  "schemas": {
    // Minimal schema that triggers the issue
  },
  "operations": [
    // Minimal operation that triggers the issue
  ]
}
```

#### For Evidence Issues

Create NDJSON files in `fixtures/evidence/`:

```
// fixtures/evidence/issue-123-valid.ndjson
{"evidenceVersion":"0.1","operationId":"testOp",...}

// fixtures/evidence/issue-123-invalid.ndjson
{"evidenceVersion":"0.1","operationId":"testOp",...}
```

#### For Diff Issues

Create base and head contracts in `fixtures/diff/`:

```json
// fixtures/diff/issue-123-base.json
// fixtures/diff/issue-123-head.json
```

### 2. Write a Failing Test

Add a test that uses your fixture and fails with the current code.

```typescript
// packages/[package]/test/issue-123.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Issue #123: Description of the issue', () => {
  it('should handle [edge case]', () => {
    const fixture = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../fixtures/contract-ir/v0.1/issue-123-description.json'),
        'utf-8'
      )
    );

    // Test that currently fails
    const result = processFixture(fixture);
    expect(result).toBe(expectedBehavior);
  });
});
```

### 3. Implement the Fix

Now implement your fix in the relevant package.

### 4. Verify Tests Pass

```bash
pnpm test
```

### 5. Add Snapshot Tests (If Applicable)

For deterministic outputs like OpenAPI compilation:

```typescript
it('should compile issue-123 fixture correctly', () => {
  const ir = loadFixture('issue-123-description');
  const result = compileOpenApi(ir);
  expect(result).toMatchSnapshot();
});
```

### 6. Document the Edge Case

Add the new edge case to the [Schema Support Matrix](./schema-support.md) if it affects schema handling.

## Fixture Naming Convention

```
[category]-[description].json

Examples:
- self-recursive.json           # Schema that references itself
- mutual-recursive.json         # Schemas that reference each other
- union-types.json              # oneOf/anyOf/allOf examples
- nullable-fields.json          # Various nullable patterns
- deep-nesting.json             # Deeply nested schemas
- issue-123-overflow.json       # Specific issue fix
```

## Fixture Structure

### Contract IR Fixtures

Must be valid Contract IR with:

- `irVersion: "0.1"`
- `service` with `name` and `version`
- `schemas` (can be empty `{}`)
- `operations` (can be empty `[]`)

### Evidence Fixtures

Must be valid NDJSON with one event per line:

```json
{"evidenceVersion":"0.1","operationId":"...","protocol":"http","timestamp":"...","request":{...},"response":{...}}
```

### Diff Fixtures

Pairs of files:

- `[name]-base.json` - Original contract
- `[name]-head.json` - Modified contract (with or without breaking changes)

## Example: Adding a New Schema Edge Case

Let's say we discover an issue with `anyOf` combined with `nullable`.

### Step 1: Create Fixture

```json
// fixtures/contract-ir/v0.1/anyof-nullable.json
{
  "irVersion": "0.1",
  "service": { "name": "anyof-nullable-test", "version": "1.0.0" },
  "schemas": {
    "NullableUnion": {
      "$id": "NullableUnion",
      "anyOf": [{ "type": "string" }, { "type": "number" }],
      "nullable": true
    }
  },
  "operations": [
    {
      "operationId": "getValue",
      "method": "GET",
      "path": "/value",
      "responses": [{ "statusCode": 200, "schema": { "$ref": "schema:NullableUnion" } }]
    }
  ]
}
```

### Step 2: Write Test

```typescript
// packages/compiler-openapi/test/anyof-nullable.test.ts
import { describe, it, expect } from 'vitest';
import { compileOpenApi } from '../src/index.js';

describe('anyOf with nullable', () => {
  it('should handle nullable anyOf correctly', () => {
    const fixture = loadFixture('anyof-nullable');
    const result = compileOpenApi(fixture);

    const schema = result.components?.schemas?.NullableUnion;
    // Verify the expected structure
    expect(schema?.anyOf).toBeDefined();
    // nullable should be converted to type array or wrapped
  });
});
```

### Step 3: Fix and Verify

1. Implement the fix
2. Run `pnpm test` - tests should pass
3. Commit fixture and test together with fix

## Checklist for New Edge Cases

- [ ] Minimal fixture created in appropriate `fixtures/` directory
- [ ] Fixture follows naming convention
- [ ] Fixture is valid (validate with `acp validate` if applicable)
- [ ] Test file created with descriptive name
- [ ] Test fails before fix, passes after
- [ ] Snapshot added if output is deterministic
- [ ] Documentation updated if behavior affects users
- [ ] PR includes fixture, test, and fix together

## Getting Fixtures Reviewed

When adding fixtures that represent new supported patterns:

1. Add a description comment at the top of the fixture
2. Reference the fixture in `docs/schema-support.md`
3. Include example usage in your PR description

## Questions?

- Ask in #api-contract-platform
- Check existing fixtures for patterns
- Review [Schema Support Matrix](./schema-support.md) for current coverage
