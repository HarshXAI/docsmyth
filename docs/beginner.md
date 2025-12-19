# Docsmyth Beginner Guide

Welcome to Docsmyth! This guide shows you how to get started **without writing any contract files manually**.

> **For MERN students**: This guide is designed for you! No prior API documentation experience needed.

## 🩺 Before You Start: Doctor Check

Run the doctor command to verify your installation:

```bash
# Check your installation
pnpm dlx @docsmyth/cli@rc doctor

# Or if installed locally
docsmyth doctor
```

This will show:

- Your CLI version
- Package manager detection
- Available commands
- Recommended install commands if updates are available

---

## 🚀 Quickstart (One Command) - The "Student Button"

The fastest way to get started - just one command and you're running:

```bash
# Using pnpm (recommended)
pnpm dlx @docsmyth/cli@rc quickstart --target http://localhost:3000

# Using npx
npx -y @docsmyth/cli@rc quickstart --target http://localhost:3000
```

### What Happens

This single command will:

1. ✅ Start a recording proxy at `http://127.0.0.1:8080`
2. ✅ Launch Studio **immediately** with "Waiting for traffic..." state
3. ✅ **Live update** Studio as you make requests (no refresh needed!)
4. ✅ On `Ctrl+C`, automatically infer and save your contract

### Step-by-Step

1. **Start quickstart** - Run the command above
2. **Open Studio** - It auto-opens in your browser (or go to http://127.0.0.1:8787)
3. **Send requests through the proxy**:

```bash
curl http://127.0.0.1:8080/users
curl http://127.0.0.1:8080/users/123
curl -X POST http://127.0.0.1:8080/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
```

4. **Watch Studio update live** - Operations appear as you make requests!
5. **Press `Ctrl+C`** - Contract is saved and next steps are printed

### Screenshot: Waiting State

When you first start, Studio shows the "Waiting for traffic..." banner:

```
╭─────────────────────────────────────────────────────────────────────╮
│  🔴 Live │ Waiting for traffic...                                   │
│                                                                      │
│  Send requests through the recording proxy to see operations here   │
╰─────────────────────────────────────────────────────────────────────╯
```

### Screenshot: Live Updates

After making requests, Studio updates in real-time:

```
╭─────────────────────────────────────────────────────────────────────╮
│  🟢 Live │ 5 events, 3 operations                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Contract          │ Evidence          │ Coverage │ Issues         │
├────────────────────┴───────────────────┴──────────┴────────────────┤
│  Operations:                                                        │
│  ├─ GET /users           → listUsers                                │
│  ├─ GET /users/{param1}  → getUser                                  │
│  └─ POST /users          → createUser                               │
╰─────────────────────────────────────────────────────────────────────╯
```

### After Ctrl+C

You'll see exact commands to continue:

```
╭─────────────────────────────────────────────────────────────────────╮
│  🎉 Done! Your contract has been saved.                             │
│                                                                      │
│  ▶ Next commands (copy & paste):                                    │
│                                                                      │
│  # View your contract in Studio (with evidence replay)              │
│  docsmyth studio --contract service-3000.contract.json              │
│      --evidence /tmp/docsmyth.evidence.ndjson                       │
│                                                                      │
│  # Run proxy with contract validation (strict mode)                 │
│  docsmyth proxy --contract service-3000.contract.json               │
│      --target http://localhost:3000                                 │
│                                                                      │
│  # Compile to OpenAPI                                               │
│  docsmyth compile service-3000.contract.json -o ./openapi           │
╰─────────────────────────────────────────────────────────────────────╯
```

### Quickstart Options

| Option                  | Default                               | Description           |
| ----------------------- | ------------------------------------- | --------------------- |
| `--target <url>`        | _required_                            | Your backend URL      |
| `--listen <address>`    | `127.0.0.1:8080`                      | Proxy listen address  |
| `--evidence-out <path>` | `/tmp/docsmyth.evidence.ndjson`       | Evidence file         |
| `--contract-out <path>` | `./contracts/<service>.contract.json` | Contract output       |
| `--studio-port <port>`  | `8787`                                | Studio port           |
| `--no-studio`           |                                       | Skip launching Studio |
| `--verbose`             |                                       | Show detailed logs    |

---

## 📹 Record Mode (Manual Flow)

If you prefer more control, use the three-step flow:

### Step 1: Record Traffic

```bash
docsmyth record \
  --target http://localhost:3000 \
  --listen 127.0.0.1:8080 \
  --out ./evidence.ndjson
```

**What this does:**

- Starts a proxy that forwards all requests to your backend
- Captures every request/response as evidence
- Infers operation IDs from the paths (e.g., `GET /users/{param1}`)

**Example session:**

```bash
# Terminal 1: Start recording
docsmyth record --target http://localhost:3000 --out ./evidence.ndjson

# Terminal 2: Make requests through proxy
curl http://127.0.0.1:8080/users
curl http://127.0.0.1:8080/users/42
curl -X POST http://127.0.0.1:8080/users -d '{"name":"Bob"}'
curl -X DELETE http://127.0.0.1:8080/users/42

# Terminal 1: Press Ctrl+C to stop
```

### Step 2: Infer Contract

Convert your captured evidence into a Contract IR:

```bash
docsmyth infer \
  --evidence ./evidence.ndjson \
  --out ./contracts/my-api.contract.json \
  --service my-api \
  --version 1.0.0
```

**What this does:**

- Groups requests by method + path pattern
- Generates semantic operation IDs (`listUsers`, `getUser`, `createUser`, etc.)
- Infers JSON schemas from request/response bodies
- Creates a valid Contract IR file

### Step 3: View in Studio

```bash
docsmyth studio \
  --contract ./contracts/my-api.contract.json \
  --evidence ./evidence.ndjson
```

Or just view evidence without a contract (inference mode with live updates):

```bash
docsmyth studio --evidence ./evidence.ndjson
```

---

## 🔧 Troubleshooting

### Version Mismatches

If you see weird behavior, you might have version mismatches:

```bash
# Check what you're running
docsmyth doctor

# Common issue: pnpm exec uses old local version
# Solution: use pnpm dlx for latest
pnpm dlx @docsmyth/cli@rc quickstart --target http://localhost:3000
```

### "Evidence file not found"

Make sure the evidence file exists. For record mode, make some requests first.

### "Contract file is empty/invalid JSON"

Your contract file might be corrupted. Re-run:

```bash
docsmyth infer --evidence ./evidence.ndjson --out ./contract.json --service my-api
```

### Cannot find module @docsmyth/studio

Studio is bundled with the CLI. Use the rc tag:

```bash
pnpm dlx @docsmyth/cli@rc studio --evidence ./evidence.ndjson
```

---

## 🎯 Workflows for Different Needs

### New Project (No API Yet)

1. Design your API in Studio
2. Export the contract
3. Implement your backend
4. Use `docsmyth proxy` to validate against your contract

### Existing API (Document What You Have)

```bash
# Record your existing API
docsmyth quickstart --target http://localhost:3000

# Make representative requests through the proxy
# Watch Studio update live
# Press Ctrl+C when done

# Your contract is saved!
```

### Continuous Development

```bash
# Run proxy with contract validation
docsmyth proxy \
  --contract ./contract.json \
  --target http://localhost:3000 \
  --capture \
  --out ./evidence.ndjson

# Compile to OpenAPI
docsmyth compile ./contract.json -o ./openapi

# View coverage
docsmyth studio --contract ./contract.json --evidence ./evidence.ndjson
```

---

## 📋 Command Reference

### `docsmyth doctor`

Check your installation and environment.

```bash
docsmyth doctor [--verbose]
```

### `docsmyth quickstart`

One-command beginner flow with live Studio updates.

```bash
docsmyth quickstart --target <url> [options]
```

### `docsmyth record`

Record HTTP traffic without a contract.

```bash
docsmyth record --target <url> [options]
```

| Option               | Default                | Description          |
| -------------------- | ---------------------- | -------------------- |
| `--target <url>`     | _required_             | Your backend URL     |
| `--listen <address>` | `127.0.0.1:8080`       | Proxy listen address |
| `--out <path>`       | `/tmp/evidence.ndjson` | Evidence output file |
| `--verbose`          |                        | Detailed logging     |

### `docsmyth infer`

Generate Contract IR from evidence.

```bash
docsmyth infer --evidence <path> --out <path> [options]
```

| Option                | Default      | Description          |
| --------------------- | ------------ | -------------------- |
| `--evidence <path>`   | _required_   | Evidence NDJSON file |
| `--out <path>`        | _required_   | Contract output file |
| `--service <name>`    | `my-service` | Service name         |
| `--version <version>` | `0.0.1`      | Service version      |

### `docsmyth studio`

Launch Studio web UI.

```bash
# With contract
docsmyth studio --contract <path> [--evidence <path>]

# Evidence-only (inference mode with live updates)
docsmyth studio --evidence <path>
```

| Option              | Default     | Description          |
| ------------------- | ----------- | -------------------- |
| `--contract <path>` |             | Contract IR file     |
| `--evidence <path>` |             | Evidence NDJSON file |
| `--port <number>`   | `8787`      | Server port          |
| `--host <address>`  | `127.0.0.1` | Server host          |
| `--no-open`         |             | Don't open browser   |

---

## 🔧 Path Normalization

When recording, Docsmyth automatically detects dynamic path segments:

| Request Path                                  | Normalized Template                 |
| --------------------------------------------- | ----------------------------------- |
| `/users/123`                                  | `/users/{param1}`                   |
| `/users/550e8400-e29b-41d4-a716-446655440000` | `/users/{param1}`                   |
| `/posts/abc123/comments/456`                  | `/posts/{param1}/comments/{param2}` |

**Detected as parameters:**

- Pure numbers: `123`, `456789`
- UUIDs: `550e8400-e29b-41d4-a716-446655440000`
- MongoDB ObjectIds: `507f1f77bcf86cd799439011`
- Short IDs with mixed alphanumeric: `abc123`, `post-x9y2`

---

## 💡 Tips

### Better Operation IDs

Docsmyth infers semantic operation IDs based on REST conventions:

| Method | Path              | Inferred ID  |
| ------ | ----------------- | ------------ |
| GET    | `/users`          | `listUsers`  |
| GET    | `/users/{param1}` | `getUser`    |
| POST   | `/users`          | `createUser` |
| PUT    | `/users/{param1}` | `updateUser` |
| DELETE | `/users/{param1}` | `deleteUser` |

### Schema Inference

Request/response bodies are analyzed to infer JSON schemas:

- Strings are detected (with format hints for email, date-time, URI, UUID)
- Numbers vs integers are distinguished
- Arrays infer their item types
- Objects get all properties merged across samples
- `additionalProperties: true` is set by default for flexibility

### Editing Contracts

After inference, you can:

1. Rename operations for clarity
2. Add descriptions and summaries
3. Tighten schemas (remove `additionalProperties`)
4. Add security definitions
5. Configure base URLs

Use Studio or edit the JSON directly.

---

## 📚 Next Steps

1. **[Studio Guide](./studio.md)** - Learn Studio's features
2. **[Schema Support](./schema-support.md)** - JSON Schema deep dive
3. **[Contributing](./contributing-fixtures.md)** - Add test fixtures
4. **[RFC: Contract IR](./rfcs/0001-contract-ir-v0.1.md)** - Technical spec
