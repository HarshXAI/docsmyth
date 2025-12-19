/**
 * Coverage API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolve, isAbsolute } from 'node:path';
import { readContract } from '../services/contract-service.js';
import { getCoverage } from '../services/coverage-service.js';
import { evidenceExists } from '../services/evidence-service.js';

export async function coverageRoutes(
    fastify: FastifyInstance,
    options: { contractPath: string; evidencePath?: string }
): Promise<void> {
    const { contractPath, evidencePath } = options;

    /**
     * GET /api/coverage - Get coverage statistics
     */
    fastify.get('/api/coverage', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const query = request.query as { includeInvalid?: string };
            const includeInvalid = query.includeInvalid !== 'false';

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

            const result = await getCoverage(absoluteEvidencePath, contract, includeInvalid);

            return result;
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });
}
