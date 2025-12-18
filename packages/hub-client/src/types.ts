/**
 * @acp/hub-client - Types for Hub API responses
 */

import type { ContractIR } from '@acp/ir-spec';

/**
 * Metadata for a stored contract version
 */
export interface ContractMetadata {
    /** Service name (e.g., "orders-api") */
    serviceName: string;

    /** Semantic version (e.g., "1.0.0") */
    version: string;

    /** SHA-256 hash of the IR payload for integrity verification */
    irHash: string;

    /** ISO 8601 timestamp of when the contract was published */
    publishedAt: string;

    /** SHA-256 hash of the compiled OpenAPI document (if available) */
    openApiHash?: string;

    /** Optional description from the publisher */
    description?: string;

    /** List of artifact names attached to this version */
    artifacts?: string[];
}

/**
 * Response from GET /v1/services
 */
export interface ServicesListResponse {
    services: ServiceInfo[];
}

/**
 * Basic service info in the services list
 */
export interface ServiceInfo {
    serviceName: string;
    latestVersion: string;
    versionCount: number;
    lastUpdated: string;
}

/**
 * Response from GET /v1/services/:service/contracts
 */
export interface VersionsListResponse {
    serviceName: string;
    versions: ContractMetadata[];
}

/**
 * Response from GET /v1/services/:service/contracts/:version
 */
export interface ContractResponse {
    metadata: ContractMetadata;
    ir: ContractIR;
    openApiUrl: string;
}

/**
 * Response from GET /healthz
 */
export interface HealthResponse {
    status: 'ok' | 'error';
    timestamp: string;
}

/**
 * Error response from Hub
 */
export interface HubErrorResponse {
    error: string;
    message: string;
    validationErrors?: Array<{ message: string; path?: string }>;
}

/**
 * Coverage report for a contract version
 */
export interface CoverageReport {
    /** Version of the coverage report format */
    version: '1.0';

    /** Timestamp when coverage was generated */
    generatedAt: string;

    /** Contract information */
    contract: {
        serviceName?: string;
        version?: string;
    };

    /** Coverage summary */
    summary: {
        totalOperations: number;
        coveredOperations: number;
        coveragePercent: number;
    };

    /** Per-operation coverage */
    operations: OperationCoverage[];
}

/**
 * Coverage info for a single operation
 */
export interface OperationCoverage {
    operationId: string;
    method: string;
    path: string;
    covered: boolean;
    exampleCount: number;
}

/**
 * OpenAPI 3.1 document (minimal typing for renderer)
 */
export interface OpenAPIDocument {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    paths?: Record<string, PathItem>;
    components?: {
        schemas?: Record<string, unknown>;
        securitySchemes?: Record<string, unknown>;
    };
    tags?: Array<{
        name: string;
        description?: string;
    }>;
}

/**
 * OpenAPI path item
 */
export interface PathItem {
    get?: OpenAPIOperation;
    post?: OpenAPIOperation;
    put?: OpenAPIOperation;
    patch?: OpenAPIOperation;
    delete?: OpenAPIOperation;
    options?: OpenAPIOperation;
    head?: OpenAPIOperation;
    trace?: OpenAPIOperation;
}

/**
 * OpenAPI operation
 */
export interface OpenAPIOperation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Array<{
        name: string;
        in: 'query' | 'path' | 'header' | 'cookie';
        required?: boolean;
        schema?: unknown;
        description?: string;
    }>;
    requestBody?: {
        required?: boolean;
        content?: Record<string, { schema?: unknown; example?: unknown }>;
        description?: string;
    };
    responses?: Record<
        string,
        {
            description?: string;
            content?: Record<string, { schema?: unknown; example?: unknown }>;
        }
    >;
    security?: Array<Record<string, string[]>>;
    deprecated?: boolean;
}

/**
 * Overlay list response
 */
export interface OverlaysListResponse {
    serviceName: string;
    version: string;
    overlays: OverlayInfo[];
}

/**
 * Basic overlay info in the overlays list
 */
export interface OverlayInfo {
    /** Artifact name (e.g., "overlay.public.json") */
    artifactName: string;
    /** Overlay name extracted from artifact name (e.g., "public") */
    name: string;
}
