/**
 * Evidence API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolve, isAbsolute } from 'node:path';
import { readContract } from '../services/contract-service.js';
import {
    getEvidenceSummary,
    getEvents,
    getEvent,
    verifyEvidence,
    evidenceExists,
} from '../services/evidence-service.js';

export async function evidenceRoutes(
    fastify: FastifyInstance,
    options: { contractPath: string; evidencePath?: string }
): Promise<void> {
    const { contractPath, evidencePath } = options;

    /**
     * GET /api/evidence/summary - Get evidence summary
     */
    fastify.get('/api/evidence/summary', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            if (!evidencePath) {
                return {
                    totalEvents: 0,
                    validEvents: 0,
                    invalidEvents: 0,
                    byOperationId: {},
                    byStatus: {},
                    hasEvidence: false,
                };
            }

            const absoluteEvidencePath = isAbsolute(evidencePath)
                ? evidencePath
                : resolve(process.cwd(), evidencePath);

            if (!evidenceExists(absoluteEvidencePath)) {
                return {
                    totalEvents: 0,
                    validEvents: 0,
                    invalidEvents: 0,
                    byOperationId: {},
                    byStatus: {},
                    hasEvidence: false,
                };
            }

            const absoluteContractPath = isAbsolute(contractPath)
                ? contractPath
                : resolve(process.cwd(), contractPath);

            const contract = await readContract(absoluteContractPath);
            const summary = await getEvidenceSummary(absoluteEvidencePath, contract);

            return { ...summary, hasEvidence: true };
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * GET /api/evidence/events - Get paginated events
     */
    fastify.get('/api/evidence/events', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            if (!evidencePath) {
                return {
                    events: [],
                    total: 0,
                    page: 1,
                    pageSize: 50,
                    hasMore: false,
                };
            }

            const query = request.query as {
                page?: string;
                pageSize?: string;
                operationId?: string;
                status?: string;
                valid?: string;
                q?: string;
            };

            const absoluteEvidencePath = isAbsolute(evidencePath)
                ? evidencePath
                : resolve(process.cwd(), evidencePath);

            const absoluteContractPath = isAbsolute(contractPath)
                ? contractPath
                : resolve(process.cwd(), contractPath);

            const contract = await readContract(absoluteContractPath);

            const result = await getEvents(absoluteEvidencePath, contract, {
                page: query.page ? parseInt(query.page, 10) : undefined,
                pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
                operationId: query.operationId,
                status: query.status ? parseInt(query.status, 10) : undefined,
                valid: query.valid !== undefined ? query.valid === 'true' : undefined,
                q: query.q,
            });

            return result;
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * GET /api/evidence/event/:index - Get single event
     */
    fastify.get(
        '/api/evidence/event/:index',
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                if (!evidencePath) {
                    return reply.status(404).send({ error: 'No evidence file configured' });
                }

                const params = request.params as { index: string };
                const eventIndex = parseInt(params.index, 10);

                if (isNaN(eventIndex)) {
                    return reply.status(400).send({ error: 'Invalid event index' });
                }

                const absoluteEvidencePath = isAbsolute(evidencePath)
                    ? evidencePath
                    : resolve(process.cwd(), evidencePath);

                const absoluteContractPath = isAbsolute(contractPath)
                    ? contractPath
                    : resolve(process.cwd(), contractPath);

                const contract = await readContract(absoluteContractPath);
                const result = await getEvent(absoluteEvidencePath, contract, eventIndex);

                return result;
            } catch (e) {
                return reply.status(500).send({
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
    );

    /**
     * POST /api/evidence/verify - Verify evidence against contract
     */
    fastify.post('/api/evidence/verify', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const body = request.body as { evidencePath?: string; contractPath?: string };

            const evPath = body.evidencePath || evidencePath;
            const ctPath = body.contractPath || contractPath;

            if (!evPath) {
                return reply.status(400).send({ error: 'evidencePath is required' });
            }

            const absoluteEvidencePath = isAbsolute(evPath)
                ? evPath
                : resolve(process.cwd(), evPath);

            const absoluteContractPath = isAbsolute(ctPath)
                ? ctPath
                : resolve(process.cwd(), ctPath);

            const contract = await readContract(absoluteContractPath);
            const result = await verifyEvidence(absoluteEvidencePath, contract);

            return result;
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });
}
