/**
 * Audit Logger
 *
 * Append-only logging for all publish/pull actions.
 * Uses NDJSON format for easy parsing and streaming.
 * NEVER logs tokens or sensitive credentials.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Audit log entry types
 */
export type AuditAction =
    | 'publish'
    | 'pull'
    | 'pull_openapi'
    | 'list_versions'
    | 'list_services'
    | 'pull_artifact'
    | 'publish_artifact'
    | 'list_overlays'
    | 'pull_overlay';

/**
 * Result of an audited action
 */
export type AuditResult = 'success' | 'error' | 'conflict' | 'not_found' | 'unauthorized';

/**
 * Audit log entry structure
 */
export interface AuditEntry {
    /** Unique request identifier */
    requestId: string;

    /** ISO 8601 timestamp */
    timestamp: string;

    /** The action performed */
    action: AuditAction;

    /** Result of the action */
    result: AuditResult;

    /** Service name (optional for list_services) */
    serviceName?: string;

    /** Version (if applicable) */
    version?: string;

    /** Error message (if result is error) */
    error?: string;

    /** Client IP address */
    clientIp?: string;

    /** User agent */
    userAgent?: string;
}

/**
 * Audit logger interface
 */
export interface AuditLogger {
    /**
     * Log an audit entry
     */
    log(entry: Omit<AuditEntry, 'requestId' | 'timestamp'>): void;

    /**
     * Generate a new request ID
     */
    generateRequestId(): string;
}

/**
 * Options for FileAuditLogger
 */
export interface FileAuditLoggerOptions {
    /** Path to the audit log file */
    logPath: string;
}

/**
 * File-based audit logger using NDJSON format
 */
export class FileAuditLogger implements AuditLogger {
    private readonly logPath: string;

    constructor(options: FileAuditLoggerOptions) {
        this.logPath = options.logPath;
        this.ensureLogFile();
    }

    /**
     * Ensure the log file directory exists
     */
    private ensureLogFile(): void {
        const dir = dirname(this.logPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Generate a new request ID
     */
    generateRequestId(): string {
        return randomUUID();
    }

    /**
     * Log an audit entry
     */
    log(entry: Omit<AuditEntry, 'requestId' | 'timestamp'>): void {
        const fullEntry: AuditEntry = {
            requestId: this.generateRequestId(),
            timestamp: new Date().toISOString(),
            ...entry,
        };

        // Append to log file as NDJSON (each entry is a single line)
        const line = JSON.stringify(fullEntry) + '\n';
        appendFileSync(this.logPath, line, 'utf8');
    }
}

/**
 * In-memory audit logger for testing
 */
export class InMemoryAuditLogger implements AuditLogger {
    public readonly entries: AuditEntry[] = [];

    generateRequestId(): string {
        return `test-${this.entries.length + 1}`;
    }

    log(entry: Omit<AuditEntry, 'requestId' | 'timestamp'>): void {
        this.entries.push({
            requestId: this.generateRequestId(),
            timestamp: new Date().toISOString(),
            ...entry,
        });
    }

    /**
     * Clear all entries (for testing)
     */
    clear(): void {
        this.entries.length = 0;
    }
}
