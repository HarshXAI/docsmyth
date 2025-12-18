/**
 * Contract Hub Storage Types
 *
 * Defines the core types for contract storage and metadata.
 */

import type { ContractIR } from '@docsmyth/ir-spec';

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
}

/**
 * A complete stored contract with IR, metadata, and optional OpenAPI
 */
export interface StoredContract {
    metadata: ContractMetadata;
    ir: ContractIR;
    openApi?: unknown;
}

/**
 * Result of a publish operation
 */
export interface PublishResult {
    success: boolean;
    metadata: ContractMetadata;
}

/**
 * Summary info for a service (used in service list)
 */
export interface ServiceSummary {
    serviceName: string;
    latestVersion: string;
    versionCount: number;
    lastUpdated: string;
}

/**
 * Storage interface for contract persistence
 */
export interface ContractStorage {
    /**
     * Publish a new contract version.
     * Returns the metadata if successful.
     * Throws ConflictError if (serviceName, version) already exists.
     */
    publish(
        serviceName: string,
        version: string,
        ir: ContractIR,
        openApi?: unknown,
        description?: string
    ): Promise<ContractMetadata>;

    /**
     * Get a specific contract version.
     * Returns null if not found.
     */
    get(serviceName: string, version: string): Promise<StoredContract | null>;

    /**
     * Get the latest contract version for a service.
     * Returns null if the service has no contracts.
     */
    getLatest(serviceName: string): Promise<StoredContract | null>;

    /**
     * Get the OpenAPI document for a specific version.
     * Returns null if not found.
     */
    getOpenApi(serviceName: string, version: string): Promise<unknown | null>;

    /**
     * List all versions for a service, sorted by publish date descending.
     */
    listVersions(serviceName: string): Promise<ContractMetadata[]>;

    /**
     * Check if a contract version exists.
     */
    exists(serviceName: string, version: string): Promise<boolean>;

    /**
     * List all services with summary info.
     */
    listServices(): Promise<ServiceSummary[]>;

    /**
     * Save an artifact for a specific version.
     */
    saveArtifact(
        serviceName: string,
        version: string,
        artifactName: string,
        data: unknown
    ): Promise<void>;

    /**
     * Get an artifact for a specific version.
     * Returns null if not found.
     */
    getArtifact(
        serviceName: string,
        version: string,
        artifactName: string
    ): Promise<unknown | null>;

    /**
     * List artifact names for a specific version.
     */
    listArtifacts(serviceName: string, version: string): Promise<string[]>;
}

/**
 * Error thrown when attempting to publish a contract that already exists
 */
export class ConflictError extends Error {
    public readonly serviceName: string;
    public readonly version: string;
    public readonly existingHash: string;

    constructor(serviceName: string, version: string, existingHash: string) {
        super(`Contract ${serviceName}@${version} already exists (hash: ${existingHash})`);
        this.name = 'ConflictError';
        this.serviceName = serviceName;
        this.version = version;
        this.existingHash = existingHash;
    }
}

/**
 * Error thrown when a contract is not found
 */
export class NotFoundError extends Error {
    public readonly serviceName: string;
    public readonly version?: string;

    constructor(serviceName: string, version?: string) {
        const versionStr = version ? `@${version}` : '';
        super(`Contract ${serviceName}${versionStr} not found`);
        this.name = 'NotFoundError';
        this.serviceName = serviceName;
        this.version = version;
    }
}
