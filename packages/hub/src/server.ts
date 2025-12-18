#!/usr/bin/env node
/**
 * Contract Hub Server
 *
 * HTTP service for storing and serving API contracts.
 * Designed for security, immutability, and deterministic behavior.
 *
 * Environment variables:
 *   ACP_HUB_TOKEN          - Token for publish authentication (required for production)
 *   ACP_HUB_PORT           - Port to listen on (default: 3456)
 *   ACP_HUB_DATA_DIR       - Directory for contract storage (default: .acp-hub-data)
 *   ACP_HUB_READS_REQUIRE_AUTH - Set to "1" to require auth for read operations
 */

import express from 'express';
import { join } from 'node:path';
import { createRouter } from './routes.js';
import { FileSystemStorage } from './storage/index.js';
import { FileAuditLogger } from './audit.js';
import type { AuthConfig } from './auth.js';

/**
 * Hub configuration from environment
 */
export interface HubConfig {
    port: number;
    dataDir: string;
    publishToken: string | null;
    requireAuthForReads: boolean;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): HubConfig {
    return {
        port: parseInt(process.env.ACP_HUB_PORT ?? '3456', 10),
        dataDir: process.env.ACP_HUB_DATA_DIR ?? join(process.cwd(), '.acp-hub-data'),
        publishToken: process.env.ACP_HUB_TOKEN ?? null,
        requireAuthForReads: process.env.ACP_HUB_READS_REQUIRE_AUTH === '1',
    };
}

/**
 * Create an Express app configured for the Contract Hub
 */
export function createApp(config: HubConfig): express.Express {
    const app = express();

    // Security headers
    app.use((_req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });

    // Initialize storage
    const storage = new FileSystemStorage({
        dataDir: config.dataDir,
    });

    // Initialize audit logger
    const auditLogger = new FileAuditLogger({
        logPath: join(config.dataDir, 'audit.ndjson'),
    });

    // Auth configuration
    const authConfig: AuthConfig = {
        publishToken: config.publishToken,
        requireAuthForReads: config.requireAuthForReads,
    };

    // Mount routes
    const router = createRouter({
        storage,
        auditLogger,
        authConfig,
    });

    app.use(router);

    return app;
}

/**
 * Start the server
 */
export function startServer(config: HubConfig): void {
    const app = createApp(config);

    const server = app.listen(config.port, () => {
        console.log(`ACP Contract Hub listening on http://localhost:${config.port}`);
        console.log(`  Data directory: ${config.dataDir}`);
        console.log(`  Auth required for publish: ${config.publishToken ? 'yes' : 'no (WARNING: unprotected!)'}`);
        console.log(`  Auth required for reads: ${config.requireAuthForReads ? 'yes' : 'no'}`);
        console.log('');
        console.log('Endpoints:');
        console.log('  GET  /healthz                                      Health check');
        console.log('  POST /v1/services/:service/contracts               Publish contract');
        console.log('  GET  /v1/services/:service/contracts/latest        Get latest version');
        console.log('  GET  /v1/services/:service/contracts/:version      Get specific version');
        console.log('  GET  /v1/services/:service/contracts/:version/openapi  Get OpenAPI spec');
        console.log('  GET  /v1/services/:service/contracts               List all versions');
    });

    // Graceful shutdown
    const shutdown = () => {
        console.log('\nShutting down...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

// Run server if this is the main module
const isMainModule = import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ''));
if (isMainModule || process.argv[1]?.includes('server')) {
    const config = loadConfig();
    startServer(config);
}
