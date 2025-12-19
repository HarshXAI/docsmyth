/**
 * Issues API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolve, isAbsolute } from 'node:path';
import { readContract } from '../services/contract-service.js';
import { getIssues, getExamplesFromEvidence } from '../services/issues-service.js';
import { evidenceExists } from '../services/evidence-service.js';

export async function issuesRoutes(
    fastify: FastifyInstance,
    options: { contractPath: string; evidencePath?: string }
): Promise<void> {
    const { contractPath, evidencePath } = options;

    /**
     * GET /api/issues - Get all issues
     */
    fastify.get('/api/issues', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const absoluteContractPath = isAbsolute(contractPath)
                ? contractPath
                : resolve(process.cwd(), contractPath);

            const contract = await readContract(absoluteContractPath);

            let absoluteEvidencePath: string | undefined;
            if (evidencePath) {
                absoluteEvidencePath = isAbsolute(evidencePath)
                    ? evidencePath
                    : resolve(process.cwd(), evidencePath);

                if (!evidenceExists(absoluteEvidencePath)) {
                    absoluteEvidencePath = undefined;
                }
            }

            const result = await getIssues(absoluteEvidencePath, contract);

            return result;
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * GET /api/examples/:operationId - Get examples from evidence
     */
    fastify.get(
        '/api/examples/:operationId',
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                if (!evidencePath) {
                    return { examples: [] };
                }

                const params = request.params as { operationId: string };
                const query = request.query as { maxExamples?: string; validOnly?: string };

                const absoluteEvidencePath = isAbsolute(evidencePath)
                    ? evidencePath
                    : resolve(process.cwd(), evidencePath);

                if (!evidenceExists(absoluteEvidencePath)) {
                    return { examples: [] };
                }

                const absoluteContractPath = isAbsolute(contractPath)
                    ? contractPath
                    : resolve(process.cwd(), contractPath);

                const contract = await readContract(absoluteContractPath);

                const examples = await getExamplesFromEvidence(
                    absoluteEvidencePath,
                    contract,
                    params.operationId,
                    query.maxExamples ? parseInt(query.maxExamples, 10) : 3,
                    query.validOnly !== 'false'
                );

                return { examples };
            } catch (e) {
                return reply.status(500).send({
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }
    );
}
