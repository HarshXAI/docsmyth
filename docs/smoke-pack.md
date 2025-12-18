# Smoke Pack Testing

The `pnpm smoke:pack` command is a comprehensive smoke test that validates the @acp packages work correctly when installed from tarballs in an isolated environment. This simulates what end users experience when installing from npm.

## What It Tests

| Step                 | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| 1. Build             | Compiles all workspace packages                               |
| 2. Pack              | Creates tarballs for all @acp packages                        |
| 3. Install           | Installs tarballs in an isolated test project                 |
| 4. Verify Tarballs   | Confirms packages came from tarballs, not npm registry        |
| 5. Verify Resolution | Tests ESM imports and CJS require work correctly              |
| 6. Verify Schema     | Confirms schema files are included and loadable               |
| 7. Registry Blocking | Negative test: confirms @acp scope cannot fetch from registry |
| 8. CLI Commands      | Runs `acp --help`, `acp compile`, etc.                        |

## Running Locally

### Warm Cache (Fast, Default)

```bash
pnpm smoke:pack
```

Uses `~/.acp-smoke-npm-cache` for npm's cache. After the first run, external dependencies are cached and subsequent runs are fast (~6-15s).

### Cold Cache (Full Isolation)

```bash
ACP_SMOKE_ISOLATED_CACHE=1 pnpm smoke:pack
```

Uses a fresh temp cache every run. Slower (~30-60s) but proves full isolation works. Use this to debug cache-related issues.

## Performance Thresholds

The smoke test has timing tripwires that fail if exceeded:

| Metric            | Threshold | What It Catches                                       |
| ----------------- | --------- | ----------------------------------------------------- |
| Total time        | 15s       | Cold cache, network timeouts, broken fast-fail config |
| Registry blocking | 5s        | Fast-fail npm config removed, port 9 not working      |

These thresholds assume a warm cache. If you're running with `ACP_SMOKE_ISOLATED_CACHE=1`, times will be higher.

## CI Caching

The CI workflow (`.github/workflows/smoke-pack.yml`) caches:

1. **pnpm store** - via `actions/setup-node` with `cache: 'pnpm'`
2. **turbo cache** - `.turbo` directory
3. **smoke npm cache** - `~/.acp-smoke-npm-cache`

This ensures CI runs stay under the timing thresholds after the first run.

## Debugging Failures

### Install Slow (>5s)

**Symptoms:** Total time exceeds threshold, install stage is slow.

**Likely causes:**

- npm cache is cold (first run or cache evicted)
- External packages are slow to fetch

**Fixes:**

- Check `~/.acp-smoke-npm-cache` exists
- Verify CI is caching this directory
- Check network/proxy settings

### Registry Blocking Slow (>5s)

**Symptoms:** Registry blocking stage exceeds 5s threshold.

**Likely causes:**

- `@acp:registry` doesn't point to `http://127.0.0.1:9`
- `fetch-retries` is not set to 0
- `network-timeout` is too high
- Proxy/firewall intercepting localhost

**Fixes:**

1. Check `.npmrc` content in the test project:
   ```
   @acp:registry=http://127.0.0.1:9
   fetch-retries=0
   fetch-retry-mintimeout=100
   fetch-retry-maxtimeout=1000
   network-timeout=3000
   ```
2. Verify `NPM_CONFIG_USERCONFIG` points to the isolated `.npmrc`
3. Confirm port 9 (discard protocol) is not bound to a real service

### Tarball Provenance Mismatch

**Symptoms:** Error says package was fetched from registry instead of tarball.

**Likely causes:**

- `@acp:registry` blocking failed
- Package name mismatch between tarball and install

**Fixes:**

- Check the `.npmrc` `@acp:registry` setting
- Verify `npm ls --json` shows `file:` protocol for @acp packages
- Check `package-lock.json` for `resolved` URLs

### Schema Load Failure

**Symptoms:** Schema file not found in installed package.

**Likely causes:**

- `schemas/` directory not included in package

**Fixes:**

- Check `packages/ir-spec/package.json` has `"files": ["dist", "schemas"]`
- Run `pnpm pack` manually and extract to verify contents

### CLI Command Failure

**Symptoms:** `acp --help` or `acp compile` fails.

**Likely causes:**

- Missing dependencies
- Broken ESM/CJS exports
- Schema validation issues

**Fixes:**

- Check the full error output
- Verify `exports` map in package.json is correct
- Test locally with `node --input-type=module -e "import('@acp/cli')"`

## Environment Variables

| Variable                   | Default | Description                                   |
| -------------------------- | ------- | --------------------------------------------- |
| `ACP_SMOKE_ISOLATED_CACHE` | unset   | Set to `1` to use a fresh temp cache each run |

## Technical Details

### Why Port 9?

Port 9 is the ["discard" protocol](https://en.wikipedia.org/wiki/Discard_Protocol) - it's guaranteed to reject connections immediately with `ECONNREFUSED`. This makes the negative test (attempting to install from blocked registry) fail in ~100ms instead of waiting for network timeouts (~70s).

### Why 127.0.0.1 Instead of localhost?

Using explicit `127.0.0.1` (IPv4) avoids DNS resolution variability. On some systems, `localhost` resolves to `::1` (IPv6), which may behave differently.

### Isolated .npmrc

The test creates a temporary `.npmrc` in the test project that:

- Uses public npm registry for external deps (ajv, commander, etc.)
- Blocks `@acp` scope with `@acp:registry=http://127.0.0.1:9`
- Disables audit/fund for cleaner output
- Sets reduced retry/timeout for fast failure

This isolates the test from the developer's global `~/.npmrc`.

## File Locations

| File                               | Purpose                                   |
| ---------------------------------- | ----------------------------------------- |
| `scripts/smoke-pack.js`            | Main smoke test script                    |
| `.github/workflows/smoke-pack.yml` | CI workflow with matrix                   |
| `~/.acp-smoke-npm-cache`           | Warm cache directory (stable across runs) |
