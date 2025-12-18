/**
 * @acp/hub-client - Typed HTTP client for the Contract Hub
 *
 * Provides a typed interface for all Hub API endpoints with proper
 * error handling, timeouts, and retry support.
 */

import type { ContractIR } from '@acp/ir-spec';
import {
    HubClientError,
    HubConnectionError,
    HubNotFoundError,
    HubConflictError,
    HubValidationError,
    HubAuthError,
    HubServerError,
} from './errors.js';
import type {
    ContractMetadata,
    ContractResponse,
    CoverageReport,
    HealthResponse,
    HubErrorResponse,
    OpenAPIDocument,
    OverlaysListResponse,
    ServicesListResponse,
    VersionsListResponse,
} from './types.js';

/**
 * Options for creating a HubClient
 */
export interface HubClientOptions {
    /** Base URL of the hub (e.g., "http://localhost:3000") */
    baseUrl: string;

    /** Optional authorization token for authenticated requests */
    token?: string;

    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;

    /** Custom fetch implementation (for testing) */
    fetch?: typeof globalThis.fetch;
}

/**
 * Options for publish operation
 */
export interface PublishOptions {
    /** Service name */
    serviceName: string;

    /** Semantic version */
    version: string;

    /** Contract IR document */
    ir: ContractIR;

    /** Pre-compiled OpenAPI (optional) */
    openApi?: unknown;

    /** Optional description */
    description?: string;
}

/**
 * Response from publish operation
 */
export interface PublishResponse {
    success: boolean;
    metadata: ContractMetadata;
}

/**
 * Typed HTTP client for the Contract Hub API
 */
export class HubClient {
    private readonly baseUrl: string;
    private readonly token?: string;
    private readonly timeout: number;
    private readonly fetchFn: typeof globalThis.fetch;

    constructor(options: HubClientOptions) {
        // Remove trailing slash from baseUrl
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.token = options.token;
        this.timeout = options.timeout ?? 30000;
        this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    }

    /**
     * Make an authenticated request with timeout
     */
    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE',
        path: string,
        body?: unknown
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await this.fetchFn(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            // Handle different status codes
            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType?.includes('application/json')) {
                    return (await response.json()) as T;
                }
                return {} as T;
            }

            // Parse error response
            let errorResponse: HubErrorResponse | undefined;
            try {
                errorResponse = (await response.json()) as HubErrorResponse;
            } catch {
                // Response might not be JSON
            }

            const message = errorResponse?.message ?? `HTTP ${response.status}`;

            switch (response.status) {
                case 400:
                    throw new HubValidationError(message, errorResponse);
                case 401:
                    throw new HubAuthError(message, errorResponse);
                case 404:
                    throw new HubNotFoundError(message, errorResponse);
                case 409:
                    throw new HubConflictError(
                        message,
                        errorResponse as HubErrorResponse & { existingHash?: string }
                    );
                default:
                    if (response.status >= 500) {
                        throw new HubServerError(message, response.status, errorResponse);
                    }
                    throw new HubClientError(message, response.status, errorResponse);
            }
        } catch (error) {
            clearTimeout(timeoutId);

            // Re-throw our custom errors
            if (error instanceof HubClientError) {
                throw error;
            }

            // Handle fetch errors (network, timeout, etc.)
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new HubConnectionError(`Request timeout after ${this.timeout}ms`, error);
                }
                throw new HubConnectionError(`Connection failed: ${error.message}`, error);
            }

            throw new HubConnectionError('Unknown connection error');
        }
    }

    // ============================================================
    // Health
    // ============================================================

    /**
     * Check hub health status
     */
    async health(): Promise<HealthResponse> {
        return this.request<HealthResponse>('GET', '/healthz');
    }

    /**
     * Check if hub is reachable
     */
    async isHealthy(): Promise<boolean> {
        try {
            const health = await this.health();
            return health.status === 'ok';
        } catch {
            return false;
        }
    }

    // ============================================================
    // Services
    // ============================================================

    /**
     * List all services
     */
    async listServices(): Promise<ServicesListResponse> {
        return this.request<ServicesListResponse>('GET', '/v1/services');
    }

    // ============================================================
    // Contracts
    // ============================================================

    /**
     * List all versions for a service
     */
    async listVersions(serviceName: string): Promise<VersionsListResponse> {
        return this.request<VersionsListResponse>(
            'GET',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts`
        );
    }

    /**
     * Get the latest contract version for a service
     */
    async getLatest(serviceName: string): Promise<ContractResponse> {
        return this.request<ContractResponse>(
            'GET',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts/latest`
        );
    }

    /**
     * Get a specific contract version
     */
    async getContract(serviceName: string, version: string): Promise<ContractResponse> {
        return this.request<ContractResponse>(
            'GET',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts/${encodeURIComponent(version)}`
        );
    }

    /**
     * Get the OpenAPI document for a specific version
     */
    async getOpenApi(serviceName: string, version: string): Promise<OpenAPIDocument> {
        return this.request<OpenAPIDocument>(
            'GET',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts/${encodeURIComponent(version)}/openapi`
        );
    }

    /**
     * Publish a new contract version
     */
    async publish(options: PublishOptions): Promise<PublishResponse> {
        return this.request<PublishResponse>(
            'POST',
            `/v1/services/${encodeURIComponent(options.serviceName)}/contracts`,
            {
                version: options.version,
                ir: options.ir,
                openApi: options.openApi,
                description: options.description,
            }
        );
    }

    // ============================================================
    // Artifacts
    // ============================================================

    /**
     * Get a named artifact for a specific version
     */
    async getArtifact<T = unknown>(
        serviceName: string,
        version: string,
        artifactName: string
    ): Promise<T> {
        return this.request<T>(
            'GET',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts/${encodeURIComponent(version)}/artifacts/${encodeURIComponent(artifactName)}`
        );
    }

    /**
     * Get coverage report for a specific version
     */
    async getCoverage(serviceName: string, version: string): Promise<CoverageReport> {
        return this.getArtifact<CoverageReport>(serviceName, version, 'coverage.json');
    }

    // ============================================================
    // Diff (client-side using @acp/linter)
    // ============================================================

    /**
     * Get contracts for diffing (returns both contracts)
     */
    async getContractsForDiff(
        serviceName: string,
        baseVersion: string,
        headVersion: string
    ): Promise<{ base: ContractResponse; head: ContractResponse }> {
        const [base, head] = await Promise.all([
            this.getContract(serviceName, baseVersion),
            this.getContract(serviceName, headVersion),
        ]);
        return { base, head };
    }

    // ============================================================
    // Overlays
    // ============================================================

    /**
     * List all overlays for a specific version
     */
    async listOverlays(serviceName: string, version: string): Promise<OverlaysListResponse> {
        return this.request<OverlaysListResponse>(
            'GET',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts/${encodeURIComponent(version)}/overlays`
        );
    }

    /**
     * Get a specific overlay by name
     */
    async getOverlay<T = unknown>(
        serviceName: string,
        version: string,
        overlayName: string
    ): Promise<T> {
        return this.request<T>(
            'GET',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts/${encodeURIComponent(version)}/overlays/${encodeURIComponent(overlayName)}`
        );
    }

    /**
     * Publish an overlay for a specific version
     */
    async publishOverlay(
        serviceName: string,
        version: string,
        overlayName: string,
        overlay: unknown
    ): Promise<{ success: boolean; message: string }> {
        const artifactName = `overlay.${overlayName}.json`;
        return this.request<{ success: boolean; message: string }>(
            'POST',
            `/v1/services/${encodeURIComponent(serviceName)}/contracts/${encodeURIComponent(version)}/artifacts/${encodeURIComponent(artifactName)}`,
            overlay
        );
    }
}

/**
 * Create a new HubClient instance
 */
export function createHubClient(options: HubClientOptions): HubClient {
    return new HubClient(options);
}
