# CI Integration Guide

This guide explains how to integrate API Contract Platform (ACP) checks into your service's CI/CD pipeline.

## Overview

ACP provides automated contract validation that runs on every pull request and push, ensuring:

- ✅ Contract validity against the IR schema
- ✅ Successful OpenAPI compilation
- ✅ Breaking change detection
- ✅ Evidence verification (runtime matches contract)

## Quick Start

### Option 1: Copy the Workflow Template

Copy the ACP contract check workflow to your repository:

```bash
# From your service repository
mkdir -p .github/workflows
curl -o .github/workflows/acp-contract-check.yml \
  https://raw.githubusercontent.com/your-org/api-contract-platform/main/templates/github-actions/acp-contract-check.yml
```

### Option 2: Use as Reusable Workflow

Reference the workflow from your own CI:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  # Your existing jobs...
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test
  
  # Add ACP contract check
  contract-check:
    needs: test  # Run after tests (which may generate evidence)
    uses: your-org/api-contract-platform/.github/workflows/acp-contract-check.yml@main
    with:
      contract-path: ./contract/contract.ir.json
      evidence-path: ./evidence.ndjson
```

## Configuration Options

### Workflow Inputs

| Input | Description | Default | Required |
|-------|-------------|---------|----------|
| `contract-path` | Path to contract IR JSON | `./contract/contract.ir.json` | No |
| `evidence-path` | Path to evidence NDJSON (glob supported) | `./evidence.ndjson` | No |
| `hub-url` | ACP Hub URL for publishing | _(none)_ | No |
| `node-version` | Node.js version | `20` | No |
| `fail-on-breaking` | Fail on breaking changes | `true` | No |
| `skip-evidence` | Skip evidence verification | `false` | No |

### Secrets

| Secret | Description | Required |
|--------|-------------|----------|
| `hub-token` | Token for Hub authentication | No (unless publishing) |

## Workflow Stages

### 1. Validate

Validates the contract IR against the schema:

```bash
acp validate ./contract/contract.ir.json
```

**Failure indicates:**
- Missing required fields
- Invalid schema references
- Unsupported constructs

### 2. Compile

Compiles contract to OpenAPI 3.1:

```bash
acp compile ./contract/contract.ir.json --format openapi
```

**Failure indicates:**
- Complex types not supported in OpenAPI
- Invalid operation definitions
- Circular references

### 3. Diff (PRs only)

Detects breaking changes against the base branch:

```bash
acp diff base-contract.ir.json head-contract.ir.json
```

**Breaking changes include:**
- Removed endpoints
- Required fields added to request bodies
- Response schema incompatibilities
- Changed HTTP methods

### 4. Evidence Verification

Verifies runtime behavior matches the contract:

```bash
acp evidence verify ./evidence.ndjson --contract ./contract/contract.ir.json
```

**Failure indicates:**
- Implementation doesn't match contract
- Missing operations
- Schema mismatches

## Evidence Capture Setup

For evidence verification to work, you need to capture evidence during tests.

### Step 1: Enable Capture in Tests

```bash
# In your test script or CI
ACP_EVIDENCE_CAPTURE=true pnpm test
```

### Step 2: Collect Evidence Files

Evidence files are written to `./evidence.ndjson` by default. Make sure this path matches your workflow configuration.

### Step 3: Upload Evidence (Optional)

For debugging, evidence files are automatically uploaded as artifacts:

```yaml
- name: Upload evidence artifacts
  uses: actions/upload-artifact@v4
  with:
    name: evidence
    path: ./evidence.ndjson
    retention-days: 14
```

## Breaking Change Policy

### Automatic Detection

The workflow automatically detects breaking changes on PRs:

- Removed or renamed endpoints
- Changed request/response schemas
- Modified authentication requirements

### Override Options

If breaking changes are intentional:

1. **Commit Message**: Include `[breaking]` in your commit message
2. **Workflow Setting**: Set `fail-on-breaking: false` in the workflow
3. **PR Label**: Add a `breaking-change` label (requires workflow customization)

### Recommended Process

```
1. Breaking change detected in PR
2. Review the diff output in CI
3. Communicate with API consumers
4. Update version appropriately
5. Proceed with merge
```

## Hub Integration

### Publishing on Main Branch

To automatically publish contracts to the Hub:

```yaml
jobs:
  contract-check:
    uses: your-org/api-contract-platform/.github/workflows/acp-contract-check.yml@main
    with:
      hub-url: https://acp-hub.your-org.com
    secrets:
      hub-token: ${{ secrets.ACP_HUB_TOKEN }}
```

### Setting Up Hub Token

1. Generate a token in the Hub UI
2. Add to your repository secrets as `ACP_HUB_TOKEN`
3. Reference in the workflow

## Caching Strategy

The workflow uses multiple caches for performance:

### pnpm Store Cache

```yaml
- uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
```

### Artifacts for Cross-Job Data

- Validation reports (7 days)
- OpenAPI specs (30 days)
- Evidence files (14 days)
- Diff reports (7 days)

## Troubleshooting

### Validation Failures

```
Error: Contract validation failed
```

**Debug locally:**
```bash
acp validate ./contract/contract.ir.json --verbose
```

**Common fixes:**
- Check for missing required fields in contract
- Verify schema references exist
- Review IR spec documentation

### Compilation Failures

```
Error: OpenAPI compilation failed
```

**Debug locally:**
```bash
acp compile ./contract/contract.ir.json --format openapi --verbose
```

**Common fixes:**
- Simplify complex union types
- Fix circular schema references
- Check for unsupported media types

### Evidence Verification Failures

```
Error: Evidence verification failed
```

**Debug locally:**
```bash
# Regenerate evidence
ACP_EVIDENCE_CAPTURE=true pnpm test

# Verify with verbose output
acp evidence verify ./evidence.ndjson --contract ./contract/contract.ir.json --verbose

# Check coverage
acp evidence coverage ./evidence.ndjson --contract ./contract/contract.ir.json
```

**Common fixes:**
- Update contract to match implementation
- Add missing test cases
- Fix response schema definitions

### Breaking Change Detection

```
Error: Breaking changes detected
```

**Review the changes:**
```bash
acp diff base.ir.json head.ir.json --format human
```

**Resolution options:**
1. Revert the breaking change
2. Add backward compatibility
3. Proceed with version bump (and update fail-on-breaking)

## Example: Full Service CI

Here's a complete CI setup for a service using ACP:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - name: Run tests with evidence capture
        run: pnpm test
        env:
          ACP_EVIDENCE_CAPTURE: true
      - name: Upload evidence
        uses: actions/upload-artifact@v4
        with:
          name: evidence
          path: ./evidence.ndjson

  contract-check:
    needs: test
    uses: your-org/api-contract-platform/.github/workflows/acp-contract-check.yml@main
    with:
      contract-path: ./contract/contract.ir.json
      evidence-path: ./evidence.ndjson
      hub-url: ${{ github.ref == 'refs/heads/main' && 'https://acp-hub.your-org.com' || '' }}
    secrets:
      hub-token: ${{ secrets.ACP_HUB_TOKEN }}

  deploy:
    needs: [lint, test, contract-check]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... deployment steps
```

## Local Development

### Pre-commit Hook

Add contract validation to your pre-commit hooks:

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Validate contract before commit
if [ -f "contract/contract.ir.json" ]; then
  pnpm acp validate contract/contract.ir.json
fi
```

### Watch Mode

For development, run validation on file changes:

```bash
# Using nodemon
npx nodemon --watch contract --ext json --exec "acp validate contract/contract.ir.json"
```

## FAQ

### Q: How do I skip evidence verification?

Set `skip-evidence: true` in the workflow inputs:

```yaml
with:
  skip-evidence: true
```

### Q: Can I use multiple evidence files?

Yes, use a glob pattern:

```yaml
with:
  evidence-path: './test/**/*.evidence.ndjson'
```

### Q: How long are artifacts retained?

- Validation reports: 7 days
- OpenAPI specs: 30 days
- Evidence files: 14 days
- Diff reports: 7 days

### Q: Can I run this locally?

Yes! Install the CLI and run the same commands:

```bash
pnpm add -g @acp/cli
acp validate ./contract/contract.ir.json
acp compile ./contract/contract.ir.json --format openapi
acp diff old.ir.json new.ir.json
acp evidence verify ./evidence.ndjson --contract ./contract/contract.ir.json
```

## Resources

- [ACP Documentation](../README.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Schema Support](./schema-support.md)
- [Release Process](./release-process.md)
- [Day 1 Onboarding](./day-1-onboarding.md)
