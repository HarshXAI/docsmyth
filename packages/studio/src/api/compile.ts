/**
 * Compile API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolve, isAbsolute } from 'node:path';
import { readContract } from '../services/contract-service.js';
import { compileContract } from '../services/compile-service.js';

export async function compileRoutes(
    fastify: FastifyInstance,
    options: { contractPath: string }
): Promise<void> {
    const { contractPath } = options;

    /**
     * POST /api/compile - Compile contract to OpenAPI
     */
    fastify.post('/api/compile', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const body = request.body as { contractPath?: string };
            const path = body.contractPath || contractPath;

            const absolutePath = isAbsolute(path) ? path : resolve(process.cwd(), path);

            const contract = await readContract(absolutePath);
            const result = await compileContract(contract);

            return result;
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });
}
