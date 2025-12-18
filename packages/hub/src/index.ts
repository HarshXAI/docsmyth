/**
 * @docsmyth/hub
 *
 * Contract Hub - Central storage and serving of API contracts.
 *
 * This package provides:
 * - HTTP service for contract storage and retrieval
 * - Immutable version storage with integrity verification
 * - Token-based authentication for publish operations
 * - Audit logging for all actions
 */

// Server exports
export { createApp, loadConfig, startServer, type HubConfig } from './server.js';

// Routes
export { createRouter, type RouterOptions } from './routes.js';

// Storage
export {
    FileSystemStorage,
    type FileSystemStorageOptions,
    type ContractMetadata,
    type ContractStorage,
    type StoredContract,
    type ServiceSummary,
    ConflictError,
    NotFoundError,
    computeHash,
    stableStringify,
    verifyHash,
} from './storage/index.js';

// Audit
export {
    FileAuditLogger,
    InMemoryAuditLogger,
    type AuditLogger,
    type AuditEntry,
    type AuditAction,
    type AuditResult,
    type FileAuditLoggerOptions,
} from './audit.js';

// Auth
export {
    createAuthMiddleware,
    extractBearerToken,
    type AuthConfig,
    type AuthenticatedRequest,
} from './auth.js';
