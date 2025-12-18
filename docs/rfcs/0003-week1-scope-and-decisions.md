# RFC 0003: Week 1 Scope and Decisions

| Status    | Accepted      |
| --------- | ------------- |
| Date      | 2025-12-17    |
| Authors   | Platform Team |
| Reviewers | -             |

## Summary

This RFC documents the scope boundaries and key decisions for Week 1 of the API Contract Platform project. Week 1 focuses on **foundational scaffolding** – the repo structure, tooling, types, and documentation that enable rapid development in subsequent weeks.

## Goals for Week 1

### Must Have ✅

1. **Production-grade monorepo structure**
   - pnpm workspaces + Turborepo
   - Proper TypeScript configuration (ESM, strict mode)
   - Linting (ESLint) and formatting (Prettier)
   - CI pipeline (GitHub Actions)

2. **Package scaffolding** (stubs that compile)
   - `@acp/ir-spec` – Types + validation stub
   - `@acp/ir-sdk` – Builder helpers
   - `@acp/compiler-openapi` – IR → OpenAPI stub
   - `@acp/cli` – Command stubs (validate, compile)

3. **Fixture-driven development setup**
   - Canonical IR example (`minimal-http.json`)
   - Expected OpenAPI output
   - Test scaffolding that loads fixtures

4. **Documentation foundation**
   - RFCs for IR v0.1 and Evidence Model
   - MIT License, CODEOWNERS

### Nice to Have 🎯

- README with getting started guide
- Contributing guidelines
- ADR (Architecture Decision Records) template

### Explicitly Deferred ❌

1. **Full IR validation** – Week 1 has basic structural checks; JSON Schema validation in Week 2
2. **Express+Zod extraction** – Example app exists but no extraction logic
3. **Evidence capture** – RFC written but implementation deferred
4. **YAML output** – CLI stubs only support JSON in Week 1
5. **Multiple frameworks** – Only Express+Zod placeholder; FastAPI, etc. are future
6. **Publishing to npm** – Local development only in Week 1

## Key Technical Decisions

### 1. ESM-First

**Decision**: Use ES Modules (`"type": "module"`) throughout.

**Rationale**:

- Node 20+ has excellent ESM support
- Aligns with modern ecosystem direction
- Enables top-level await, cleaner imports

**Trade-off**: Some older packages may need special handling.

### 2. Turborepo for Task Orchestration

**Decision**: Use Turborepo (not Nx, not Lerna).

**Rationale**:

- Simpler configuration than Nx
- Better caching than Lerna
- Works great with pnpm workspaces
- No lock-in to additional tooling

### 3. vitest for Testing

**Decision**: Use vitest instead of Jest.

**Rationale**:

- Native ESM support without hacks
- Vite-based = fast
- Jest-compatible API for familiarity
- Better TypeScript integration

### 4. Commander for CLI

**Decision**: Use `commander` for CLI argument parsing.

**Rationale**:

- Battle-tested, minimal dependencies
- Good TypeScript types
- Sufficient for our needs
- Can swap later if needed

### 5. Schema References as Strings

**Decision**: Use `"schema:$id"` format for references, not OpenAPI-style `"#/components/..."`.

**Rationale**:

- Decouples IR from OpenAPI structure
- Enables compilation to other formats
- Clear prefix indicates reference type
- Easy to parse and validate

### 6. Workspace Package Naming

**Decision**: Use `@acp/` scope for all packages.

**Rationale**:

- Clear namespace
- `acp` = API Contract Platform
- Easy to grep, easy to import
- Reserved for potential npm publishing

## Package Responsibilities

| Package                 | Week 1 Scope                              | Future Scope                        |
| ----------------------- | ----------------------------------------- | ----------------------------------- |
| `@acp/ir-spec`          | Types, basic validate()                   | Full JSON Schema validation         |
| `@acp/ir-sdk`           | ref(), makeService(), makeHttpOperation() | Schema builders, operation builders |
| `@acp/compiler-openapi` | Basic compilation stub                    | Full compilation, optimizations     |
| `@acp/cli`              | validate, compile stubs                   | extract, diff, generate commands    |

## Fixture Files

Week 1 establishes the fixture-driven development pattern:

```
fixtures/
├── contract-ir/
│   └── v0.1/
│       └── minimal-http.json    # Canonical example
└── openapi/
    └── v3.1/
        └── minimal-http.json    # Expected output
```

Tests load these fixtures and verify:

1. IR fixtures pass validation
2. Compiled output matches expected OpenAPI structure

## CI Pipeline

Week 1 CI checks:

```yaml
- pnpm install (with caching)
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build
```

Matrix: Node 20 and 22.

## What Success Looks Like

By end of Week 1:

```bash
# All pass
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# CLI works
pnpm acp validate fixtures/contract-ir/v0.1/minimal-http.json
# ✓ Contract IR is valid

pnpm acp compile fixtures/contract-ir/v0.1/minimal-http.json --out ./output
# ✓ Compiled to: output/minimal-http.openapi.json
```

## Week 2 Preview

With Week 1 foundation in place, Week 2 focuses on:

1. Full JSON Schema-based IR validation
2. Express+Zod extraction (basic AST parsing)
3. Evidence model implementation
4. Improved CLI output formatting
5. YAML output support

## Decision

✅ **Accepted** – Proceed with Week 1 scope as defined. Any scope creep is explicitly rejected in favor of solid foundations.

## Related

- RFC 0001: Contract IR v0.1
- RFC 0002: Evidence Model v0.1
