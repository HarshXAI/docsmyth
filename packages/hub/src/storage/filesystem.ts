/**
 * Filesystem-based Contract Storage
 *
 * Stores contracts on the local filesystem with an index file for metadata.
 * Designed for simplicity and testability.
 *
 * Directory structure:
 *   <dataDir>/
 *     index.json                     # Master index with all metadata
 *     audit.ndjson                   # Append-only audit log
 *     services/
 *       <serviceName>/
 *         <version>/
 *           ir.json                  # Contract IR
 *           openapi.json             # Compiled OpenAPI (optional)
 *           metadata.json            # Version metadata
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ContractIR } from '@acp/ir-spec';
import {
    type ContractMetadata,
    type ContractStorage,
    type StoredContract,
    type ServiceSummary,
    ConflictError,
} from './types.js';
import { computeHash, stableStringify } from './hash.js';

/**
 * Master index structure stored in index.json
 */
interface MasterIndex {
    version: '1.0';
    services: Record<
        string,
        {
            latest: string;
            versions: ContractMetadata[];
        }
    >;
}

/**
 * Options for FileSystemStorage
 */
export interface FileSystemStorageOptions {
    /** Base directory for storing contracts */
    dataDir: string;
}

/**
 * Filesystem-based implementation of ContractStorage
 */
export class FileSystemStorage implements ContractStorage {
    private readonly dataDir: string;
    private readonly indexPath: string;
    private readonly servicesDir: string;

    constructor(options: FileSystemStorageOptions) {
        this.dataDir = options.dataDir;
        this.indexPath = join(this.dataDir, 'index.json');
        this.servicesDir = join(this.dataDir, 'services');

        // Ensure directories exist
        this.ensureDirectories();
    }

    /**
     * Ensure base directories exist
     */
    private ensureDirectories(): void {
        if (!existsSync(this.dataDir)) {
            mkdirSync(this.dataDir, { recursive: true });
        }
        if (!existsSync(this.servicesDir)) {
            mkdirSync(this.servicesDir, { recursive: true });
        }
        // Initialize index if it doesn't exist
        if (!existsSync(this.indexPath)) {
            this.saveIndex({ version: '1.0', services: {} });
        }
    }

    /**
     * Get the path to a version directory
     */
    private getVersionDir(serviceName: string, version: string): string {
        // Sanitize names to prevent path traversal
        const safeServiceName = this.sanitizeName(serviceName);
        const safeVersion = this.sanitizeName(version);
        return join(this.servicesDir, safeServiceName, safeVersion);
    }

    /**
     * Sanitize a name to prevent path traversal attacks
     */
    private sanitizeName(name: string): string {
        // Replace any path-related characters with safe alternatives
        return name.replace(/[\/\\:*?"<>|]/g, '_');
    }

    /**
     * Load the master index
     */
    private loadIndex(): MasterIndex {
        try {
            const raw = readFileSync(this.indexPath, 'utf8');
            return JSON.parse(raw) as MasterIndex;
        } catch {
            return { version: '1.0', services: {} };
        }
    }

    /**
     * Save the master index (atomic write)
     */
    private saveIndex(index: MasterIndex): void {
        const content = stableStringify(index);
        // Write to temp file first, then rename for atomicity
        const tempPath = this.indexPath + '.tmp';
        writeFileSync(tempPath, content, 'utf8');
        // Rename is atomic on POSIX systems
        renameSync(tempPath, this.indexPath);
    }

    /**
     * Publish a new contract version
     */
    async publish(
        serviceName: string,
        version: string,
        ir: ContractIR,
        openApi?: unknown,
        description?: string
    ): Promise<ContractMetadata> {
        // Check for existing version
        if (await this.exists(serviceName, version)) {
            const existing = await this.get(serviceName, version);
            throw new ConflictError(serviceName, version, existing?.metadata.irHash ?? 'unknown');
        }

        // Compute hashes
        const irHash = computeHash(ir);
        const openApiHash = openApi ? computeHash(openApi) : undefined;

        // Create metadata
        const metadata: ContractMetadata = {
            serviceName,
            version,
            irHash,
            publishedAt: new Date().toISOString(),
            openApiHash,
            description,
        };

        // Create version directory
        const versionDir = this.getVersionDir(serviceName, version);
        mkdirSync(versionDir, { recursive: true });

        // Write files (using stable stringify for determinism)
        writeFileSync(join(versionDir, 'ir.json'), stableStringify(ir), 'utf8');
        writeFileSync(join(versionDir, 'metadata.json'), stableStringify(metadata), 'utf8');

        if (openApi) {
            writeFileSync(join(versionDir, 'openapi.json'), stableStringify(openApi), 'utf8');
        }

        // Update master index
        const index = this.loadIndex();
        if (!index.services[serviceName]) {
            index.services[serviceName] = { latest: version, versions: [] };
        }
        index.services[serviceName].versions.unshift(metadata);
        index.services[serviceName].latest = version;
        this.saveIndex(index);

        return metadata;
    }

    /**
     * Get a specific contract version
     */
    async get(serviceName: string, version: string): Promise<StoredContract | null> {
        const versionDir = this.getVersionDir(serviceName, version);
        const irPath = join(versionDir, 'ir.json');
        const metadataPath = join(versionDir, 'metadata.json');

        if (!existsSync(irPath) || !existsSync(metadataPath)) {
            return null;
        }

        try {
            const ir = JSON.parse(readFileSync(irPath, 'utf8')) as ContractIR;
            const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as ContractMetadata;

            const openApiPath = join(versionDir, 'openapi.json');
            let openApi: unknown | undefined;
            if (existsSync(openApiPath)) {
                openApi = JSON.parse(readFileSync(openApiPath, 'utf8'));
            }

            return { metadata, ir, openApi };
        } catch {
            return null;
        }
    }

    /**
     * Get the latest contract version for a service
     */
    async getLatest(serviceName: string): Promise<StoredContract | null> {
        const index = this.loadIndex();
        const service = index.services[serviceName];

        if (!service || !service.latest) {
            return null;
        }

        return this.get(serviceName, service.latest);
    }

    /**
     * Get the OpenAPI document for a specific version
     */
    async getOpenApi(serviceName: string, version: string): Promise<unknown | null> {
        const versionDir = this.getVersionDir(serviceName, version);
        const openApiPath = join(versionDir, 'openapi.json');

        if (!existsSync(openApiPath)) {
            return null;
        }

        try {
            return JSON.parse(readFileSync(openApiPath, 'utf8'));
        } catch {
            return null;
        }
    }

    /**
     * List all versions for a service
     */
    async listVersions(serviceName: string): Promise<ContractMetadata[]> {
        const index = this.loadIndex();
        const service = index.services[serviceName];

        if (!service) {
            return [];
        }

        return service.versions;
    }

    /**
     * Check if a contract version exists
     */
    async exists(serviceName: string, version: string): Promise<boolean> {
        const versionDir = this.getVersionDir(serviceName, version);
        return existsSync(join(versionDir, 'ir.json'));
    }

    /**
     * List all services with summary info
     */
    async listServices(): Promise<ServiceSummary[]> {
        const index = this.loadIndex();
        const summaries: ServiceSummary[] = [];

        for (const [serviceName, service] of Object.entries(index.services)) {
            if (service.versions.length > 0) {
                // Find the most recent publish date
                const latestMeta = service.versions[0];
                summaries.push({
                    serviceName,
                    latestVersion: service.latest,
                    versionCount: service.versions.length,
                    lastUpdated: latestMeta?.publishedAt ?? new Date().toISOString(),
                });
            }
        }

        // Sort by last updated (most recent first)
        summaries.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));

        return summaries;
    }

    /**
     * Save an artifact for a specific version
     */
    async saveArtifact(
        serviceName: string,
        version: string,
        artifactName: string,
        data: unknown
    ): Promise<void> {
        const versionDir = this.getVersionDir(serviceName, version);
        const artifactsDir = join(versionDir, 'artifacts');

        // Ensure artifacts directory exists
        if (!existsSync(artifactsDir)) {
            mkdirSync(artifactsDir, { recursive: true });
        }

        // Sanitize artifact name
        const safeArtifactName = this.sanitizeName(artifactName);
        const artifactPath = join(artifactsDir, safeArtifactName);

        // Write artifact
        writeFileSync(artifactPath, stableStringify(data), 'utf8');
    }

    /**
     * Get an artifact for a specific version
     */
    async getArtifact(
        serviceName: string,
        version: string,
        artifactName: string
    ): Promise<unknown | null> {
        const versionDir = this.getVersionDir(serviceName, version);
        const safeArtifactName = this.sanitizeName(artifactName);
        const artifactPath = join(versionDir, 'artifacts', safeArtifactName);

        if (!existsSync(artifactPath)) {
            return null;
        }

        try {
            return JSON.parse(readFileSync(artifactPath, 'utf8'));
        } catch {
            return null;
        }
    }

    /**
     * List artifact names for a specific version
     */
    async listArtifacts(serviceName: string, version: string): Promise<string[]> {
        const versionDir = this.getVersionDir(serviceName, version);
        const artifactsDir = join(versionDir, 'artifacts');

        if (!existsSync(artifactsDir)) {
            return [];
        }

        try {
            const { readdirSync } = await import('node:fs');
            return readdirSync(artifactsDir).filter((name) => !name.startsWith('.'));
        } catch {
            return [];
        }
    }
}
