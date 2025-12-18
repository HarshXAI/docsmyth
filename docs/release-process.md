# Release Process

This document describes the complete release process for the API Contract Platform.

## Overview

The ACP monorepo uses a multi-stage release process:

1. **Development** - Feature development on feature branches
2. **Release Guard** - Automated validation before release
3. **Changesets** - Version management and changelog generation
4. **Publishing** - Automated npm publishing

## Release Guard

Before any release, the **Release Guard** workflow validates the codebase:

```bash
# Run locally to validate before pushing
./scripts/release-guard.sh
```

The release guard runs:

1. `pnpm -r build` - Build all packages
2. `pnpm -r test` - Run all tests (400+ tests)
3. `pnpm smoke:pack` - Verify CLI works as standalone package

### When Release Guard Runs

- **On version tags** (`v*`) - Full validation before publishing
- **On PRs** - Validates changes to core packages
- **Manual trigger** - For debugging via GitHub Actions UI

### Troubleshooting Failures

On failure, the workflow outputs:

- Node/npm/pnpm versions
- npm configuration
- Environment variables
- Workspace package list
- Recent git history
- Disk usage

See [CI Failure Playbook](./ci-failure-playbook.md) for common issues.

## Versioning with Changesets

We use [Changesets](https://github.com/changesets/changesets) for version management.

### Step 1: Add a Changeset

When you make a change that should be released:

```bash
pnpm changeset
```

Follow the prompts to:

1. Select changed packages
2. Choose bump type (major/minor/patch)
3. Write a summary

The changeset file is created in `.changeset/`.

**Bump type guidelines:**

| Type    | When to use                       |
| ------- | --------------------------------- |
| `major` | Breaking changes to public APIs   |
| `minor` | New features, backward-compatible |
| `patch` | Bug fixes, documentation          |

### Step 2: Version Packages

To apply pending changesets:

```bash
pnpm version-packages
```

This:

- Updates `package.json` versions
- Generates/updates `CHANGELOG.md` files
- Removes applied changeset files

### Step 3: Create Release PR

Commit the version changes and create a PR:

```bash
git add .
git commit -m "chore: version packages"
git push origin release/v0.2.0
```

## Publishing

### Automated Publishing (Recommended)

When a version PR is merged to `main`:

1. CI runs full validation
2. Changesets publishes to npm
3. GitHub releases are created

### Manual Publishing (Emergency Only)

For emergency releases:

```bash
# Ensure you're authenticated to npm
npm whoami

# Run full release
pnpm release
```

This runs:

1. `pnpm check` - Full validation
2. `pnpm smoke:pack` - Verify packaging
3. `changeset publish` - Publish to npm

## Release Checklist

Before releasing, verify:

- [ ] All tests pass locally: `pnpm test`
- [ ] Build succeeds: `pnpm build`
- [ ] Smoke test passes: `pnpm smoke:pack`
- [ ] Release guard passes: `./scripts/release-guard.sh`
- [ ] Changeset added for user-facing changes
- [ ] Documentation updated for new features
- [ ] Breaking changes documented in changeset

## Version Tags

After publishing, version tags are created automatically:

```
v0.1.0        # Main version tag
@docsmyth/cli@0.1.0 # Package-specific tags
```

## Hotfix Process

For urgent fixes to a released version:

1. Create branch from the version tag:

   ```bash
   git checkout -b hotfix/v0.1.1 v0.1.0
   ```

2. Make the fix and add changeset:

   ```bash
   pnpm changeset  # Select patch
   ```

3. Version and publish:
   ```bash
   pnpm version-packages
   pnpm release
   ```

## Package Dependencies

The release order is determined by package dependencies:

```
@docsmyth/ir-spec          # Base types, no dependencies
    ↓
@docsmyth/ir-sdk           # Depends on ir-spec
@docsmyth/compiler-openapi # Depends on ir-spec
@docsmyth/evidence-sdk     # Depends on ir-spec
@docsmyth/linter           # Depends on ir-spec
    ↓
@docsmyth/hub              # Depends on ir-spec, compiler-openapi
@docsmyth/hub-client       # Depends on ir-spec
    ↓
@docsmyth/runtime-node-express  # Depends on ir-spec, evidence-sdk
@docsmyth/capture-proxy         # Depends on evidence-sdk
    ↓
@docsmyth/cli              # Depends on most packages
    ↓
@docsmyth/ui-portal        # Depends on hub-client, ir-spec
```

Changesets handles this automatically by publishing in dependency order.

## npm Scope

All packages are published under the `@docsmyth` scope:

- Scope must be configured in npm org settings
- Maintainers need write access to the scope
- Packages are public by default

## Troubleshooting

### "Access token expired"

```bash
npm logout
npm login
```

### "Package already published"

The version already exists on npm. Increment the version:

```bash
pnpm changeset
pnpm version-packages
```

### Smoke test timeout

Check the performance thresholds in `scripts/smoke-pack.js`:

```javascript
const THRESHOLDS = {
  totalTime: 15_000, // 15s with warm cache
  registryBlocking: 5_000, // 5s for blocking test
};
```

If consistently slow, the npm cache may be cold. CI caches at `~/.acp-smoke-npm-cache`.

### Build fails in CI but works locally

1. Check Node version matches CI matrix (20, 22)
2. Run `pnpm install --frozen-lockfile` locally
3. Clear turbo cache: `rm -rf .turbo`
4. Clear node_modules: `pnpm clean && pnpm install`

## Security Considerations

- npm tokens are stored as GitHub secrets
- Two-factor auth required for npm publishing
- Changesets creates signed commits
- All packages include LICENSE file

## Monitoring

After a release:

1. Verify packages on npmjs.com
2. Check GitHub releases are created
3. Test installation: `npx @docsmyth/cli --version`
4. Monitor for issues in GitHub Issues
