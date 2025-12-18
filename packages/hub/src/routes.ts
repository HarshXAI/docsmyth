/**
 * Contract Hub Routes
 *
 * HTTP API for contract storage and retrieval.
 */

import { Router, json } from 'express';
import type { Request, Response } from 'express';
import { validate, type ContractIR } from '@docsmyth/ir-spec';
import { compileOpenApi } from '@docsmyth/compiler-openapi';
import { type ContractStorage, ConflictError } from './storage/index.js';
import { type AuditLogger, type AuditResult } from './audit.js';
import { createAuthMiddleware, type AuthConfig } from './auth.js';

/**
 * Request body for publishing a contract
 */
interface PublishRequestBody {
    /** Semantic version */
    version: string;

    /** Contract IR document */
    ir: ContractIR;

    /** Pre-compiled OpenAPI (optional, will be compiled if not provided) */
    openApi?: unknown;

    /** Optional description */
    description?: string;
}

/**
 * Options for creating the router
 */
export interface RouterOptions {
    storage: ContractStorage;
    auditLogger: AuditLogger;
    authConfig: AuthConfig;
}

/**
 * Get client IP from request, handling proxies
 */
function getClientIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress;
}

/**
 * Create the Contract Hub router
 */
export function createRouter(options: RouterOptions): Router {
    const { storage, auditLogger, authConfig } = options;
    const router = Router();
    const auth = createAuthMiddleware(authConfig);

    // Parse JSON bodies
    router.use(json({ limit: '10mb' }));

    /**
     * Health check endpoint
     */
    router.get('/healthz', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    /**
     * POST /v1/services/:service/contracts
     * Publish a new contract version
     */
    router.post(
        '/v1/services/:service/contracts',
        auth.requirePublishAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;
            const body = req.body as PublishRequestBody;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                // Validate request body
                if (!body.version || typeof body.version !== 'string') {
                    auditResult = 'error';
                    errorMessage = 'Missing or invalid version';
                    res.status(400).json({ error: 'Bad Request', message: errorMessage });
                    return;
                }

                if (!body.ir || typeof body.ir !== 'object') {
                    auditResult = 'error';
                    errorMessage = 'Missing or invalid IR';
                    res.status(400).json({ error: 'Bad Request', message: errorMessage });
                    return;
                }

                // Validate IR
                const validationResult = validate(body.ir);
                if (!validationResult.valid) {
                    auditResult = 'error';
                    errorMessage = 'Invalid Contract IR: ' + validationResult.errors[0]?.message;
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'Invalid Contract IR',
                        validationErrors: validationResult.errors,
                    });
                    return;
                }

                // Compile OpenAPI if not provided
                let openApi = body.openApi;
                if (!openApi) {
                    openApi = compileOpenApi(body.ir as ContractIR);
                }

                // Publish to storage
                const metadata = await storage.publish(
                    serviceName,
                    body.version,
                    body.ir as ContractIR,
                    openApi,
                    body.description
                );

                res.status(201).json({
                    success: true,
                    metadata,
                });
            } catch (error) {
                if (error instanceof ConflictError) {
                    auditResult = 'conflict';
                    errorMessage = error.message;
                    res.status(409).json({
                        error: 'Conflict',
                        message: error.message,
                        existingHash: error.existingHash,
                    });
                } else {
                    auditResult = 'error';
                    errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    res.status(500).json({
                        error: 'Internal Server Error',
                        message: errorMessage,
                    });
                }
            } finally {
                auditLogger.log({
                    action: 'publish',
                    result: auditResult,
                    serviceName,
                    version: body?.version,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * GET /v1/services/:service/contracts/latest
     * Get the latest contract version
     */
    router.get(
        '/v1/services/:service/contracts/latest',
        auth.optionalReadAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;
            let version: string | undefined;

            try {
                const contract = await storage.getLatest(serviceName);

                if (!contract) {
                    auditResult = 'not_found';
                    errorMessage = 'No contracts found for service';
                    res.status(404).json({
                        error: 'Not Found',
                        message: `No contracts found for service: ${serviceName}`,
                    });
                    return;
                }

                version = contract.metadata.version;

                res.json({
                    metadata: contract.metadata,
                    ir: contract.ir,
                    openApiUrl: `/v1/services/${serviceName}/contracts/${version}/openapi`,
                });
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'pull',
                    result: auditResult,
                    serviceName,
                    version: version ?? 'latest',
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * GET /v1/services/:service/contracts/:version
     * Get a specific contract version
     */
    router.get(
        '/v1/services/:service/contracts/:version',
        auth.optionalReadAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;
            const version = req.params.version;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                const contract = await storage.get(serviceName, version);

                if (!contract) {
                    auditResult = 'not_found';
                    errorMessage = 'Contract not found';
                    res.status(404).json({
                        error: 'Not Found',
                        message: `Contract ${serviceName}@${version} not found`,
                    });
                    return;
                }

                res.json({
                    metadata: contract.metadata,
                    ir: contract.ir,
                    openApiUrl: `/v1/services/${serviceName}/contracts/${version}/openapi`,
                });
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'pull',
                    result: auditResult,
                    serviceName,
                    version,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * GET /v1/services/:service/contracts/:version/openapi
     * Get the OpenAPI document for a specific version
     */
    router.get(
        '/v1/services/:service/contracts/:version/openapi',
        auth.optionalReadAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;
            const version = req.params.version;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                const openApi = await storage.getOpenApi(serviceName, version);

                if (!openApi) {
                    auditResult = 'not_found';
                    errorMessage = 'OpenAPI document not found';
                    res.status(404).json({
                        error: 'Not Found',
                        message: `OpenAPI for ${serviceName}@${version} not found`,
                    });
                    return;
                }

                res.json(openApi);
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'pull_openapi',
                    result: auditResult,
                    serviceName,
                    version,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * GET /v1/services/:service/contracts
     * List all versions for a service
     */
    router.get(
        '/v1/services/:service/contracts',
        auth.optionalReadAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                const versions = await storage.listVersions(serviceName);

                res.json({
                    serviceName,
                    versions,
                });
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'list_versions',
                    result: auditResult,
                    serviceName,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * GET /v1/services
     * List all services
     */
    router.get('/v1/services', auth.optionalReadAuth, async (req: Request, res: Response) => {
        let auditResult: AuditResult = 'success';
        let errorMessage: string | undefined;

        try {
            const services = await storage.listServices();

            res.json({
                services,
            });
        } catch (error) {
            auditResult = 'error';
            errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({
                error: 'Internal Server Error',
                message: errorMessage,
            });
        } finally {
            auditLogger.log({
                action: 'list_services',
                result: auditResult,
                error: errorMessage,
                clientIp: getClientIp(req),
                userAgent: req.headers['user-agent'],
            });
        }
    });

    /**
     * GET /v1/services/:service/contracts/:version/artifacts/:name
     * Get a named artifact for a specific version
     */
    router.get(
        '/v1/services/:service/contracts/:version/artifacts/:name',
        auth.optionalReadAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;
            const version = req.params.version;
            const artifactName = req.params.name;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                const artifact = await storage.getArtifact(serviceName, version, artifactName);

                if (!artifact) {
                    auditResult = 'not_found';
                    errorMessage = 'Artifact not found';
                    res.status(404).json({
                        error: 'Not Found',
                        message: `Artifact ${artifactName} for ${serviceName}@${version} not found`,
                    });
                    return;
                }

                res.json(artifact);
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'pull_artifact',
                    result: auditResult,
                    serviceName,
                    version,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * POST /v1/services/:service/contracts/:version/artifacts/:name
     * Upload an artifact for a specific version
     */
    router.post(
        '/v1/services/:service/contracts/:version/artifacts/:name',
        auth.requirePublishAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;
            const version = req.params.version;
            const artifactName = req.params.name;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                // Check that the version exists
                const exists = await storage.exists(serviceName, version);
                if (!exists) {
                    auditResult = 'not_found';
                    errorMessage = 'Contract version not found';
                    res.status(404).json({
                        error: 'Not Found',
                        message: `Contract ${serviceName}@${version} not found`,
                    });
                    return;
                }

                await storage.saveArtifact(serviceName, version, artifactName, req.body);

                res.status(201).json({
                    success: true,
                    message: `Artifact ${artifactName} saved for ${serviceName}@${version}`,
                });
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'publish_artifact',
                    result: auditResult,
                    serviceName,
                    version,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * GET /v1/services/:service/contracts/:version/overlays
     * List all overlays for a specific version
     */
    router.get(
        '/v1/services/:service/contracts/:version/overlays',
        auth.optionalReadAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;
            const version = req.params.version;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                // Get all artifacts and filter for overlays (overlay.*.json pattern)
                const artifacts = await storage.listArtifacts(serviceName, version);
                const overlayArtifacts = artifacts.filter(
                    (name) => name.startsWith('overlay.') && name.endsWith('.json')
                );

                // Extract overlay names from artifact names
                const overlays = overlayArtifacts.map((name) => {
                    // Extract the overlay name from "overlay.<name>.json"
                    const match = name.match(/^overlay\.(.+)\.json$/);
                    return {
                        artifactName: name,
                        name: match ? match[1] : name,
                    };
                });

                res.json({
                    serviceName,
                    version,
                    overlays,
                });
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'list_overlays',
                    result: auditResult,
                    serviceName,
                    version,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    /**
     * GET /v1/services/:service/contracts/:version/overlays/:name
     * Get a specific overlay by name
     */
    router.get(
        '/v1/services/:service/contracts/:version/overlays/:name',
        auth.optionalReadAuth,
        async (req: Request, res: Response) => {
            const serviceName = req.params.service;
            const version = req.params.version;
            const overlayName = req.params.name;

            let auditResult: AuditResult = 'success';
            let errorMessage: string | undefined;

            try {
                // Construct artifact name from overlay name
                const artifactName = `overlay.${overlayName}.json`;
                const overlay = await storage.getArtifact(serviceName, version, artifactName);

                if (!overlay) {
                    auditResult = 'not_found';
                    errorMessage = 'Overlay not found';
                    res.status(404).json({
                        error: 'Not Found',
                        message: `Overlay "${overlayName}" for ${serviceName}@${version} not found`,
                    });
                    return;
                }

                res.json(overlay);
            } catch (error) {
                auditResult = 'error';
                errorMessage = error instanceof Error ? error.message : 'Unknown error';
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: errorMessage,
                });
            } finally {
                auditLogger.log({
                    action: 'pull_overlay',
                    result: auditResult,
                    serviceName,
                    version,
                    error: errorMessage,
                    clientIp: getClientIp(req),
                    userAgent: req.headers['user-agent'],
                });
            }
        }
    );

    return router;
}
