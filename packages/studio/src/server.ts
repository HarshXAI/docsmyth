/**
 * Docsmyth Studio Server
 *
 * Fastify server that serves both the API and the built web app.
 */

import { resolve, isAbsolute, dirname, join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';

import {
    contractRoutes,
    evidenceRoutes,
    coverageRoutes,
    issuesRoutes,
    compileRoutes,
    inferRoutes,
    streamRoutes,
} from './api/index.js';
import { isContractValid } from './services/contract-service.js';
import { inferContractFromEvidence } from './services/infer-service.js';
import { getWatcher, stopAllWatchers } from './services/watcher-service.js';

/**
 * Studio startup options
 */
export interface StudioOptions {
    contractPath?: string;
    evidencePath?: string;
    port?: number;
    host?: string;
    open?: boolean;
    /** Evidence-only mode: infer contract from evidence */
    evidenceOnlyMode?: boolean;
}

/**
 * Studio server instance
 */
export interface StudioServer {
    url: string;
    port: number;
    host: string;
    close: () => Promise<void>;
}

/**
 * Get the directory containing the built web app
 */
function getPublicDir(): string {
    // In production, the web app is built into dist/public
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Check dist/public (built location)
    const distPublic = join(__dirname, 'public');
    if (existsSync(distPublic)) {
        return distPublic;
    }

    // Fallback: check relative to package root
    const packagePublic = join(__dirname, '..', 'public');
    if (existsSync(packagePublic)) {
        return packagePublic;
    }

    // Development: check web/dist
    const webDist = join(__dirname, '..', 'web', 'dist');
    if (existsSync(webDist)) {
        return webDist;
    }

    // Final fallback - the dist/public folder should be created during build
    return distPublic;
}

/**
 * Start the Docsmyth Studio server
 */
export async function startStudio(options: StudioOptions): Promise<StudioServer> {
    const {
        contractPath,
        evidencePath,
        port = 8787,
        host = '127.0.0.1',
        open = true,
        evidenceOnlyMode = false,
    } = options;

    // Determine if we're in evidence-only mode
    const isEvidenceOnlyMode = Boolean(evidenceOnlyMode || (!contractPath && evidencePath));

    // Resolve paths
    let absoluteContractPath: string;
    if (isEvidenceOnlyMode && !contractPath) {
        // Create a temp path for the inferred contract
        absoluteContractPath = resolve(process.cwd(), '.docsmyth-inferred-contract.json');
    } else {
        absoluteContractPath = contractPath
            ? (isAbsolute(contractPath) ? contractPath : resolve(process.cwd(), contractPath))
            : resolve(process.cwd(), 'contract.json');
    }

    const absoluteEvidencePath = evidencePath
        ? isAbsolute(evidencePath)
            ? evidencePath
            : resolve(process.cwd(), evidencePath)
        : undefined;

    // In evidence-only mode, infer contract from evidence
    if (isEvidenceOnlyMode && absoluteEvidencePath) {
        if (!existsSync(absoluteEvidencePath)) {
            console.error(`Error: Evidence file not found: ${absoluteEvidencePath}`);
            process.exit(1);
        }

        console.log('📝 Evidence-only mode: Inferring contract from evidence...');
        try {
            const inferredContract = await inferContractFromEvidence(
                absoluteEvidencePath,
                'inferred-service',
                '0.0.1'
            );

            // Write the inferred contract to the temp path
            const dir = dirname(absoluteContractPath);
            if (dir && !existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            writeFileSync(absoluteContractPath, JSON.stringify(inferredContract, null, 2), 'utf-8');
            console.log(`   Inferred ${inferredContract.operations.length} operations`);
        } catch (e) {
            console.warn(`⚠️  Could not infer contract: ${e instanceof Error ? e.message : e}`);
        }
    } else if (!isEvidenceOnlyMode) {
        // Normal mode - check if contract exists
        if (!existsSync(absoluteContractPath)) {
            console.warn(`⚠️  Contract file not found: ${absoluteContractPath}`);
            console.warn('   You can initialize a new contract using the Studio UI.');
        } else {
            // Validate contract
            const valid = await isContractValid(absoluteContractPath);
            if (!valid) {
                console.warn(`⚠️  Contract file is invalid: ${absoluteContractPath}`);
                console.warn('   Check the Issues tab in Studio for details.');
            }
        }
    }

    // Check if evidence exists
    if (absoluteEvidencePath && !existsSync(absoluteEvidencePath)) {
        console.warn(`⚠️  Evidence file not found: ${absoluteEvidencePath}`);
    }

    // Create Fastify instance
    const fastify = Fastify({
        logger: false,
    });

    // Register CORS
    await fastify.register(fastifyCors, {
        origin: true,
    });

    // Register API routes
    await fastify.register(contractRoutes, {
        contractPath: absoluteContractPath,
    });

    await fastify.register(evidenceRoutes, {
        contractPath: absoluteContractPath,
        evidencePath: absoluteEvidencePath,
    });

    await fastify.register(coverageRoutes, {
        contractPath: absoluteContractPath,
        evidencePath: absoluteEvidencePath,
    });

    await fastify.register(issuesRoutes, {
        contractPath: absoluteContractPath,
        evidencePath: absoluteEvidencePath,
    });

    await fastify.register(compileRoutes, {
        contractPath: absoluteContractPath,
    });

    // Register inference routes for evidence-only mode
    await fastify.register(inferRoutes, {
        contractPath: absoluteContractPath,
        evidencePath: absoluteEvidencePath,
        evidenceOnlyMode: isEvidenceOnlyMode,
    });

    // Register SSE stream routes for real-time updates (evidence-only mode)
    await fastify.register(streamRoutes, {
        evidencePath: absoluteEvidencePath,
        evidenceOnlyMode: isEvidenceOnlyMode,
        serviceName: 'inferred-service',
        serviceVersion: '0.0.1',
    });

    // Start evidence watcher in evidence-only mode
    if (isEvidenceOnlyMode && absoluteEvidencePath) {
        const watcher = getWatcher({
            evidencePath: absoluteEvidencePath,
            serviceName: 'inferred-service',
            serviceVersion: '0.0.1',
            debounceMs: 300,
        });
        watcher.start().catch((err) => {
            console.warn(`⚠️  Evidence watcher failed to start: ${err.message}`);
        });
    }

    // Health check endpoint
    fastify.get('/api/health', async () => {
        return {
            status: 'ok',
            contractPath: absoluteContractPath,
            evidencePath: absoluteEvidencePath,
            evidenceOnlyMode: isEvidenceOnlyMode,
        };
    });

    // Config endpoint for the frontend
    fastify.get('/api/config', async () => {
        return {
            contractPath: absoluteContractPath,
            evidencePath: absoluteEvidencePath,
            hasEvidence: absoluteEvidencePath ? existsSync(absoluteEvidencePath) : false,
            hasContract: existsSync(absoluteContractPath),
            evidenceOnlyMode: isEvidenceOnlyMode,
            streamEnabled: isEvidenceOnlyMode && Boolean(absoluteEvidencePath),
        };
    });

    // Serve static files
    const publicDir = getPublicDir();
    if (existsSync(publicDir)) {
        await fastify.register(fastifyStatic, {
            root: publicDir,
            prefix: '/',
        });

        // SPA fallback - serve index.html for all non-API routes
        fastify.setNotFoundHandler(async (request, reply) => {
            if (!request.url.startsWith('/api/')) {
                return reply.sendFile('index.html');
            }
            reply.status(404).send({ error: 'Not found' });
        });
    } else {
        // No static files - show a message
        fastify.get('/', async () => {
            return {
                message: 'Docsmyth Studio API is running',
                note: 'Web UI not found. Run `pnpm build:web` to build the UI.',
                endpoints: [
                    'GET /api/health',
                    'GET /api/config',
                    'GET /api/contract',
                    'POST /api/contract/init',
                    'POST /api/contract/validate',
                    'POST /api/compile',
                    'GET /api/evidence/summary',
                    'GET /api/evidence/events',
                    'GET /api/evidence/event/:index',
                    'POST /api/evidence/verify',
                    'GET /api/coverage',
                    'GET /api/issues',
                ],
            };
        });
    }

    // Start server
    await fastify.listen({ port, host });

    const url = `http://${host}:${port}`;

    console.log(`
╭─────────────────────────────────────────────────────╮
│                                                     │
│   🚀 Docsmyth Studio is running!                    │
│                                                     │
│   Local:   ${url.padEnd(37)}│
│                                                     │
│   Contract: ${absoluteContractPath.slice(0, 35).padEnd(35)}│
│   Evidence: ${(absoluteEvidencePath || 'none').slice(0, 35).padEnd(35)}│
│                                                     │
│   Press Ctrl+C to stop                              │
│                                                     │
╰─────────────────────────────────────────────────────╯
`);

    // Open browser if requested
    if (open) {
        try {
            const { default: openUrl } = await import('open');
            await openUrl(url);
        } catch {
            // Ignore errors opening browser
        }
    }

    return {
        url,
        port,
        host,
        close: async () => {
            stopAllWatchers();
            await fastify.close();
        },
    };
}
