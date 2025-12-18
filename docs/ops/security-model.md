# Security Model

This document describes the security model for the API Contract Platform (ACP), including data sanitization, sensitive data handling, and security best practices.

## Overview

ACP is designed with security-first principles:

- **Never capture sensitive data** - Authentication headers, tokens, and PII are sanitized
- **Opt-in capture only** - Evidence capture must be explicitly enabled
- **Defense in depth** - Multiple layers of protection for sensitive information
- **Minimal data retention** - Only capture what's needed for contract validation

## Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌───────────┐
│   Request   │ ──▶ │  Sanitizer   │ ──▶ │  Evidence   │ ──▶ │    Hub    │
│  (raw)      │     │  (strip PII) │     │  (safe)     │     │  (stored) │
└─────────────┘     └──────────────┘     └─────────────┘     └───────────┘
```

All data passes through the sanitizer before being written to evidence files or sent to the Hub.

## Sanitization

### Default Blocked Headers (NEVER_CAPTURE_HEADERS)

The following headers are **never** captured, regardless of configuration:

| Header          | Reason                                       |
| --------------- | -------------------------------------------- |
| `authorization` | Contains bearer tokens, API keys, basic auth |
| `cookie`        | Contains session tokens, CSRF tokens         |
| `set-cookie`    | Response cookies with session data           |
| `x-api-key`     | API authentication tokens                    |
| `x-auth-token`  | Custom auth tokens                           |
| `x-csrf-token`  | CSRF protection tokens                       |
| `x-xsrf-token`  | Alternative CSRF token header                |

These headers are stripped at the middleware level and cannot be re-enabled.

### Sanitization Profiles

ACP provides three sanitization profiles to balance security and debuggability:

#### `strict` Profile (Recommended for Production)

Maximum security - removes all potentially sensitive data:

```typescript
createEvidenceCaptureMiddleware({
  sanitizeConfig: {
    profile: 'strict',
  },
});
```

**Behavior:**

- ✅ Removes all blocked headers
- ✅ Masks all PII patterns (email, phone, SSN)
- ✅ Masks all token patterns
- ✅ Masks sensitive fields in bodies
- ✅ Truncates long string values
- ❌ No custom headers preserved

#### `balanced` Profile (Default)

Good balance for development and testing:

```typescript
createEvidenceCaptureMiddleware({
  sanitizeConfig: {
    profile: 'balanced', // This is the default
  },
});
```

**Behavior:**

- ✅ Removes blocked headers
- ✅ Masks common PII patterns
- ✅ Masks bearer tokens
- ✅ Masks sensitive fields in bodies
- ✅ Preserves content-type, accept, cache-control headers

#### `debug` Profile (Local Development Only)

Maximum visibility for debugging - **never use in production**:

```typescript
createEvidenceCaptureMiddleware({
  sanitizeConfig: {
    profile: 'debug',
  },
});
```

**Behavior:**

- ✅ Removes only explicitly blocked headers
- ⚠️ Preserves most header values
- ⚠️ Minimal PII masking
- ⚠️ May capture sensitive data

### Sensitive Field Detection

Request and response bodies are scanned for sensitive fields. These fields have their values replaced with `[REDACTED]`:

**Default Sensitive Fields:**

- `password`
- `secret`
- `token`
- `apikey` / `api_key` / `apiKey`
- `accessToken` / `access_token`
- `refreshToken` / `refresh_token`
- `privateKey` / `private_key`

**Example:**

```json
// Before sanitization
{
  "username": "john",
  "password": "secret123",
  "data": {
    "apiKey": "sk_live_abc123"
  }
}

// After sanitization
{
  "username": "john",
  "password": "[REDACTED]",
  "data": {
    "apiKey": "[REDACTED]"
  }
}
```

### PII Masking Patterns

Common PII patterns are automatically detected and masked:

| Pattern       | Example                   | Masked As    |
| ------------- | ------------------------- | ------------ |
| Email         | `user@example.com`        | `[REDACTED]` |
| US Phone      | `555-123-4567`            | `[REDACTED]` |
| US SSN        | `123-45-6789`             | `[REDACTED]` |
| Bearer Token  | `Bearer eyJhbG...`        | `[REDACTED]` |
| JWT           | `eyJhbG...xyz.abc`        | `[REDACTED]` |
| Long API Keys | `sk_live_abc123def456...` | `[REDACTED]` |

### Custom Sanitization

You can extend the default sanitization:

```typescript
createEvidenceCaptureMiddleware({
  sanitizeConfig: {
    profile: 'balanced',
    // Additional headers to block
    denylistHeaders: ['x-internal-auth', 'x-service-token'],
    // Additional fields to mask
    sensitiveFields: ['ssn', 'taxId', 'bankAccount'],
    // Custom patterns to mask
    maskPatterns: [
      /ACCT-\d{12}/g, // Account numbers
      /MRN-\d{8}/g, // Medical record numbers
    ],
  },
});
```

## Rate Limiting

To prevent excessive data capture (which could indicate a security issue), ACP enforces rate limits:

| Limit                   | Default       | Purpose                    |
| ----------------------- | ------------- | -------------------------- |
| `maxEventsPerSecond`    | 100           | Prevent runaway capture    |
| `maxEventsPerOperation` | 1000          | Limit per-endpoint capture |
| `maxEventsPerRun`       | 0 (unlimited) | Limit per test run         |
| `maxFileBytes`          | 100 MB        | Prevent disk exhaustion    |

**Configuration:**

```typescript
createEvidenceCaptureMiddleware({
  limits: {
    maxEventsPerSecond: 50, // More conservative
    maxEventsPerOperation: 100, // Fewer samples needed
  },
});
```

## Access Control

### Hub Authentication

The ACP Hub requires authentication for all write operations:

```bash
# Set token via environment variable
export ACP_HUB_TOKEN="your-token-here"

# Or pass directly
docsmyth hub publish --token "your-token-here" ...
```

**Token Security:**

- Tokens are never logged or captured in evidence
- Tokens should be stored in CI secrets, not in code
- Rotate tokens regularly (recommended: every 90 days)

### Hub Authorization

| Operation         | Required Permission               |
| ----------------- | --------------------------------- |
| Read contracts    | None (public) or `read` (private) |
| Publish contracts | `write`                           |
| Delete contracts  | `admin`                           |
| Manage overlays   | `write`                           |
| View audit logs   | `audit`                           |

## Audit Logging

All Hub operations are logged for security audit:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "action": "publish_contract",
  "actor": "ci-bot",
  "resource": "orders-api",
  "ip": "192.168.1.100",
  "userAgent": "acp-cli/1.0.0"
}
```

Audit logs are retained for 90 days by default.

## Environment Recommendations

### Development Environment

```typescript
const config = {
  enabled: process.env.ACP_EVIDENCE_CAPTURE === 'true',
  sanitizeConfig: { profile: 'balanced' },
  outputPath: './evidence.ndjson',
};
```

- Enable capture via environment variable
- Use `balanced` profile for useful debugging
- Write to local file only

### CI/CD Environment

```bash
# GitHub Actions example
env:
  ACP_EVIDENCE_CAPTURE: true
  ACP_SANITIZE_PROFILE: balanced
```

- Always enable capture in test jobs
- Use `balanced` or `strict` profile
- Upload evidence as artifacts (short retention)

### Production Environment

```typescript
const config = {
  // NEVER enable in production
  enabled: false,
};
```

- **Never enable evidence capture in production**
- If debugging is needed, use a staging environment
- Consider using the capture-proxy for temporary debugging

## Security Checklist

Before deploying:

- [ ] Evidence capture is disabled in production config
- [ ] Sanitization profile is `strict` or `balanced`
- [ ] Custom sensitive fields are configured for your domain
- [ ] Hub tokens are stored in secrets, not code
- [ ] Audit logging is enabled on the Hub
- [ ] Evidence files are not committed to version control
- [ ] CI artifacts have appropriate retention policies

## Incident Response

### If Sensitive Data is Captured

1. **Stop** - Disable evidence capture immediately
2. **Delete** - Remove affected evidence files
3. **Rotate** - Rotate any exposed credentials
4. **Review** - Check sanitization configuration
5. **Document** - Log the incident per your security policy

### Reporting Security Issues

Report security vulnerabilities privately:

- **Email**: security@your-org.com
- **Do not** open public GitHub issues for security bugs
- Include steps to reproduce and impact assessment

## Related Documentation

- [Retention & Storage](./retention-storage.md) - Data lifecycle management
- [Troubleshooting](./troubleshooting.md) - Common security-related issues
- [CI Integration](../ci-integration.md) - Secure CI setup
