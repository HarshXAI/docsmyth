/**
 * Inference API Routes
 *
 * Handles contract inference from evidence for evidence-only mode.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import {
    inferContractFromEvidence,
    clearInferenceCache,
} from '../services/infer-service.js';

export interface InferRoutesOptions {
    contractPath: string;
    evidencePath?: string;
    evidenceOnlyMode: boolean;
}

export async function inferRoutes(
    fastify: FastifyInstance,
    options: InferRoutesOptions
): Promise<void> {
    const { contractPath, evidencePath, evidenceOnlyMode } = options;

    /**
     * GET /api/infer - Get inferred contract from evidence
     */
    fastify.get('/api/infer', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const query = request.query as { evidence?: string };
            const evidenceFile = query.evidence || evidencePath;

            if (!evidenceFile) {
                return reply.status(400).send({
                    error: 'No evidence file specified',
                });
            }

            const absoluteEvidencePath = isAbsolute(evidenceFile)
                ? evidenceFile
                : resolve(process.cwd(), evidenceFile);

            if (!existsSync(absoluteEvidencePath)) {
                return reply.status(404).send({
                    error: `Evidence file not found: ${absoluteEvidencePath}`,
                });
            }

            const contract = await inferContractFromEvidence(absoluteEvidencePath);
            return contract;
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * POST /api/infer/refresh - Refresh inferred contract (clear cache and re-infer)
     */
    fastify.post('/api/infer/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const body = request.body as { evidence?: string };
            const evidenceFile = body.evidence || evidencePath;

            if (!evidenceFile) {
                return reply.status(400).send({
                    error: 'No evidence file specified',
                });
            }

            const absoluteEvidencePath = isAbsolute(evidenceFile)
                ? evidenceFile
                : resolve(process.cwd(), evidenceFile);

            // Clear cache for this file
            clearInferenceCache(absoluteEvidencePath);

            if (!existsSync(absoluteEvidencePath)) {
                return reply.status(404).send({
                    error: `Evidence file not found: ${absoluteEvidencePath}`,
                });
            }

            const contract = await inferContractFromEvidence(absoluteEvidencePath);
            return {
                ok: true,
                contract,
                operationCount: contract.operations.length,
                schemaCount: Object.keys(contract.schemas).length,
            };
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * POST /api/infer/save - Save inferred contract to file
     */
    fastify.post('/api/infer/save', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const body = request.body as {
                evidence?: string;
                output?: string;
                serviceName?: string;
                serviceVersion?: string;
            };

            const evidenceFile = body.evidence || evidencePath;
            const outputPath = body.output || contractPath;

            if (!evidenceFile) {
                return reply.status(400).send({
                    error: 'No evidence file specified',
                });
            }

            const absoluteEvidencePath = isAbsolute(evidenceFile)
                ? evidenceFile
                : resolve(process.cwd(), evidenceFile);

            const absoluteOutputPath = isAbsolute(outputPath)
                ? outputPath
                : resolve(process.cwd(), outputPath);

            if (!existsSync(absoluteEvidencePath)) {
                return reply.status(404).send({
                    error: `Evidence file not found: ${absoluteEvidencePath}`,
                });
            }

            // Infer contract
            const contract = await inferContractFromEvidence(
                absoluteEvidencePath,
                body.serviceName || 'my-service',
                body.serviceVersion || '1.0.0'
            );

            // Ensure output directory exists
            const outDir = dirname(absoluteOutputPath);
            if (outDir && !existsSync(outDir)) {
                mkdirSync(outDir, { recursive: true });
            }

            // Write contract
            const json = JSON.stringify(contract, null, 2);
            writeFileSync(absoluteOutputPath, json, 'utf-8');

            return {
                ok: true,
                path: absoluteOutputPath,
                operationCount: contract.operations.length,
                schemaCount: Object.keys(contract.schemas).length,
                message: `Contract saved to ${absoluteOutputPath}`,
            };
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * GET /api/infer/status - Get inference status
     */
    fastify.get('/api/infer/status', async () => {
        return {
            evidenceOnlyMode,
            evidencePath,
            contractPath,
            hasEvidence: evidencePath ? existsSync(evidencePath) : false,
            hasContract: existsSync(contractPath),
        };
    });
}
