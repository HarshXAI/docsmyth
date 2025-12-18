# Retention & Storage

This document describes data retention policies, storage management, and cleanup procedures for the API Contract Platform.

## Overview

ACP manages several types of data with different retention requirements:

| Data Type | Location | Default Retention | Configurable |
|-----------|----------|-------------------|--------------|
| Evidence files | Local filesystem | Until deleted | Yes |
| CI artifacts | GitHub Actions | 7-30 days | Yes |
| Hub contracts | ACP Hub | Indefinite | Per org |
| Hub evidence | ACP Hub | 90 days | Per org |
| Audit logs | ACP Hub | 90 days | Per org |

## Evidence Files

### Local Storage

Evidence files are written as NDJSON (newline-delimited JSON) to the local filesystem:

```
./evidence.ndjson          # Default path
./evidence.ndjson.1        # Rotated file
./evidence.ndjson.2        # Older rotated file
```

**Default limits (from code):**

```typescript
// From packages/evidence-sdk/src/streaming-writer.ts
export const DEFAULT_LIMITS = {
  maxFileBytes: 100 * 1024 * 1024,     // 100 MB per file
  maxEventsPerRun: 0,                   // Unlimited per run
  maxEventsPerOperation: 1000,          // 1000 per operation
  maxEventsPerSecond: 100,              // 100 events/second
  dedupeWindowMs: 60000,                // 60 second dedupe window
};
```

### File Rotation

When an evidence file reaches `maxFileBytes` (100 MB default), it's automatically rotated:

1. Current file is renamed to `evidence.ndjson.1`
2. Previous `.1` becomes `.2`, etc.
3. New empty `evidence.ndjson` is created
4. `onRotate` callback is invoked (if configured)

**Configure rotation:**

```typescript
createEvidenceCaptureMiddleware({
  limits: {
    maxFileBytes: 50 * 1024 * 1024, // 50 MB
  },
  onRotate: (oldPath, newPath) => {
    console.log(`Rotated: ${oldPath} → ${newPath}`);
  },
});
```

### Local Cleanup

Evidence files are **not** automatically deleted. Implement cleanup based on your needs:

**Option 1: Git Ignore (Recommended)**

```gitignore
# .gitignore
evidence.ndjson*
*.evidence.ndjson
```

**Option 2: Pre-test Cleanup**

```json
{
  "scripts": {
    "pretest": "rm -f evidence.ndjson*",
    "test": "vitest"
  }
}
```

**Option 3: Age-based Cleanup Script**

```bash
#!/bin/bash
# cleanup-evidence.sh - Remove evidence files older than 7 days
find . -name "*.ndjson" -mtime +7 -delete
```

### Rate Limiting Behavior

When rate limits are hit, events are dropped (not queued):

```typescript
// Check stats to see if rate limiting occurred
const stats = writer.getStats();
console.log(`Rate limited events: ${stats.rateLimitedEvents}`);
```

## CI Artifacts

### GitHub Actions Retention

Default retention times in ACP workflows:

| Artifact | Retention | Reason |
|----------|-----------|--------|
| Validation reports | 7 days | Debug recent failures |
| OpenAPI specs | 30 days | Download for tooling |
| Evidence files | 14 days | Verify recent runs |
| Diff reports | 7 days | Review breaking changes |

**Override in workflow:**

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: evidence
    path: evidence.ndjson
    retention-days: 3  # Reduce to 3 days
```

### Storage Costs

GitHub Actions artifacts count against storage quotas:

- **Free tier**: 500 MB
- **Team**: 2 GB
- **Enterprise**: 50 GB

**Minimize storage:**

1. Reduce retention periods
2. Compress large evidence files
3. Only upload on failure
4. Use summary artifacts instead of full logs

## Hub Storage

### Contract Versions

The Hub stores all published contract versions:

```
orders-api/
├── v1.0.0/
│   ├── contract.ir.json
│   └── openapi.json
├── v1.1.0/
│   ├── contract.ir.json
│   └── openapi.json
└── latest -> v1.1.0
```

**Version retention:**
- `latest` tag always points to most recent
- All versions are retained indefinitely by default
- Admins can delete old versions via Hub UI

### Evidence in Hub

Evidence uploaded to the Hub for verification:

**Default retention: 90 days**

After 90 days:
- Evidence is automatically deleted
- Verification results remain (pass/fail status)
- Coverage metrics are preserved

**Configure retention (Hub admin):**

```yaml
# hub-config.yaml
evidence:
  retentionDays: 30  # Shorter retention
  maxSizePerContract: 500MB
```

### Overlay Storage

Overlays are stored alongside contracts:

```
orders-api/
├── contract.ir.json
├── openapi.json
└── overlays/
    ├── public.overlay.json
    └── partner.overlay.json
```

Overlays follow the same retention as contracts (indefinite).

## Audit Logs

### Log Retention

All Hub operations are logged:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "action": "publish_contract",
  "actor": "ci-bot",
  "resource": "orders-api",
  "version": "1.0.0",
  "ip": "192.168.1.100"
}
```

**Default retention: 90 days**

After 90 days, logs are automatically purged.

### Compliance Considerations

For regulated environments:

- Export logs before expiration
- Configure longer retention via Hub settings
- Use external log aggregation (e.g., Splunk, Datadog)

## Storage Architecture

### Hub Filesystem Layout

```
/var/acp-hub/
├── contracts/
│   └── {org}/
│       └── {contract-name}/
│           └── {version}/
│               ├── contract.ir.json
│               ├── openapi.json
│               └── overlays/
├── evidence/
│   └── {org}/
│       └── {contract-name}/
│           └── {date}/
│               └── evidence-{id}.ndjson
├── audit/
│   └── {year}/
│       └── {month}/
│           └── audit-{date}.ndjson
└── cache/
    └── compiled/
```

### Database Storage

The Hub uses SQLite by default:

```
/var/acp-hub/
├── hub.db              # Main database
├── hub.db-wal          # Write-ahead log
└── hub.db-shm          # Shared memory
```

**Backup recommendation:**

```bash
# Daily backup
sqlite3 hub.db ".backup /backup/hub-$(date +%Y%m%d).db"
```

## Cleanup Procedures

### Manual Evidence Cleanup

```bash
# Remove all local evidence files
rm -f evidence.ndjson*

# Remove evidence older than N days
find . -name "*.ndjson" -mtime +7 -delete
```

### Hub Cleanup (Admin)

```bash
# List old contracts
acp hub list --before 2024-01-01

# Delete specific version
acp hub delete orders-api --version 0.9.0

# Prune evidence (90+ days old)
acp hub admin prune-evidence
```

### CI Cleanup

GitHub automatically cleans artifacts after retention period. No manual action needed.

## Monitoring

### Disk Usage Alerts

Monitor evidence file growth:

```bash
# Check evidence file sizes
du -sh evidence.ndjson*

# Watch for large files
watch -n 60 'ls -lh evidence.ndjson*'
```

### Hub Storage Dashboard

The Hub UI provides storage metrics:

- Total contracts stored
- Evidence storage used
- Storage by organization
- Growth trends

### Recommended Alerts

| Metric | Warning | Critical |
|--------|---------|----------|
| Local evidence size | > 500 MB | > 1 GB |
| Hub storage per org | > 5 GB | > 10 GB |
| Audit log size | > 1 GB | > 2 GB |
| Rate limited events | > 100/hour | > 1000/hour |

## Best Practices

### Development

1. Clean evidence before each test run
2. Use short retention in CI (7 days)
3. Don't commit evidence files

### Production

1. Never enable evidence capture
2. Use capture-proxy for temporary debugging
3. Clean up proxy evidence immediately after use

### Hub

1. Delete unused contract versions quarterly
2. Monitor storage growth monthly
3. Export audit logs before expiration
4. Configure retention per org policy

## Related Documentation

- [Security Model](./security-model.md) - Data sanitization
- [Troubleshooting](./troubleshooting.md) - Storage issues
- [CI Integration](../ci-integration.md) - Artifact management
