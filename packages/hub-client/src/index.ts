/**
 * @docsmyth/hub-client
 *
 * Typed HTTP client for the API Contract Platform Hub.
 *
 * This package provides:
 * - HubClient class for all Hub API operations
 * - Typed request/response interfaces
 * - Proper error handling with custom error types
 * - Timeout and retry support
 */

// Client
export { HubClient, createHubClient } from './client.js';
export type { HubClientOptions, PublishOptions, PublishResponse } from './client.js';

// Errors
export {
    HubClientError,
    HubConnectionError,
    HubNotFoundError,
    HubConflictError,
    HubValidationError,
    HubAuthError,
    HubServerError,
} from './errors.js';

// Types
export type {
    ContractMetadata,
    ContractResponse,
    CoverageReport,
    HealthResponse,
    HubErrorResponse,
    OpenAPIDocument,
    OpenAPIOperation,
    OperationCoverage,
    OverlayInfo,
    OverlaysListResponse,
    PathItem,
    ServiceInfo,
    ServicesListResponse,
    VersionsListResponse,
} from './types.js';
