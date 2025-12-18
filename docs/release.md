# Release Guide

This document describes how to release packages in the API Contract Platform monorepo.

## Overview

We use [Changesets](https://github.com/changesets/changesets) for versioning and publishing. The workflow is:

1. Make changes to packages
2. Add a changeset describing the changes
3. Merge to main
4. Changesets creates a version PR (or publishes if changesets exist)

## Prerequisites

- Node.js 20+
- pnpm 9+
- npm account with access to `@acp` scope (for publishing)

## Local Development

### Adding a Changeset

When you make a change that should be released, add a changeset:

```bash
pnpm changeset
```

This will prompt you to:

1. Select which packages have changed
2. Choose the bump type (major/minor/patch)
3. Write a summary of the changes

The changeset file will be created in `.changeset/`.

### Versioning Packages

To apply pending changesets and update versions:

```bash
pnpm version-packages
```

This updates `package.json` versions and generates/updates `CHANGELOG.md` files.

### Publishing (CI-only)

Publishing is handled automatically by CI when changes are merged to main.

For manual publishing (use with caution):

```bash
pnpm release
```

This runs:

1. `pnpm check` - lint, typecheck, test, build
2. `pnpm smoke:pack` - verify CLI works from tarball
3. `changeset publish` - publish to npm

## CI/CD Workflow

### PR Workflow

On every PR:

- Runs `pnpm check` (lint, typecheck, test, build)
- Runs `pnpm smoke:pack` (verify CLI packaging)

### Release Workflow

On push to main:

1. Runs full checks and smoke test
2. If changesets exist: creates a "Version Packages" PR
3. When version PR is merged: publishes to npm and creates GitHub releases

## Troubleshooting

### "Access token expired or revoked" during local installs

This is a local npm authentication issue and does not affect the smoke test or CI.

**To fix:**

```bash
# Log out of npm
npm logout

# Or log in again
npm login
```

The smoke test uses an unreachable registry (`http://127.0.0.1:9`) to ensure it never fetches from npm, so this warning is harmless for local development.

### Smoke test fails with network errors

The smoke test is designed to fail if any package tries to fetch from npm. This ensures:

- All internal dependencies are packed and installed from tarballs
- No accidental registry dependencies

If you see network errors, it means a package is missing from the tarball pack list. Check `PACKAGES_TO_PACK` in `scripts/smoke-pack.js`.

### Package not found after install

Ensure the package is included in:

1. `PACKAGES_TO_PACK` array in `scripts/smoke-pack.js`
2. The package's `files` field includes `dist/`
3. The package builds correctly (`pnpm build`)

## Package Publishing Checklist

Before publishing, verify each package has:

- [ ] `name` - scoped under `@acp/`
- [ ] `version` - semantic version
- [ ] `license` - MIT
- [ ] `repository` - GitHub URL with `directory` field
- [ ] `engines.node` - `>=18`
- [ ] `publishConfig.access` - `public`
- [ ] `main` - points to `./dist/index.js`
- [ ] `types` - points to `./dist/index.d.ts`
- [ ] `exports` - proper ESM exports with types
- [ ] `files` - includes `dist`, `README.md`, `LICENSE`
- [ ] `bin` (CLI only) - points to built executable

## Publishable Packages

| Package                     | Description                             |
| --------------------------- | --------------------------------------- |
| `@acp/cli`                  | Command-line interface                  |
| `@acp/ir-spec`              | Contract IR types and validation        |
| `@acp/ir-sdk`               | Builder helpers for Contract IR         |
| `@acp/compiler-openapi`     | IR to OpenAPI compiler                  |
| `@acp/evidence-sdk`         | Evidence capture and sanitization       |
| `@acp/runtime-node-express` | Express middleware for evidence capture |

## Non-publishable Packages

| Package                    | Reason                              |
| -------------------------- | ----------------------------------- |
| `@acp/express-zod-example` | Example app, marked `private: true` |

## NPM Token Setup (CI)

The release workflow requires an `NPM_TOKEN` secret in GitHub:

1. Generate an npm access token at https://www.npmjs.com/settings/tokens
2. Add it as a repository secret named `NPM_TOKEN`
3. The release workflow will use it automatically

Never commit npm tokens to the repository.
