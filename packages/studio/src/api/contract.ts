/**
 * Contract API Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolve, isAbsolute } from 'node:path';
import {
    readContract,
    validateContract,
    initContract,
} from '../services/contract-service.js';
import type { InitContractRequest } from '../types.js';

export async function contractRoutes(
    fastify: FastifyInstance,
    options: { contractPath: string }
): Promise<void> {
    const { contractPath } = options;

    /**
     * GET /api/contract - Read contract file
     */
    fastify.get('/api/contract', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const query = request.query as { path?: string };
            const path = query.path || contractPath;
            const absolutePath = isAbsolute(path) ? path : resolve(process.cwd(), path);

            const contract = await readContract(absolutePath);
            return contract;
        } catch (e) {
            return reply.status(400).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * POST /api/contract/init - Initialize a new contract
     */
    fastify.post('/api/contract/init', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const body = request.body as InitContractRequest;

            if (!body.path) {
                return reply.status(400).send({ error: 'path is required' });
            }

            const absolutePath = isAbsolute(body.path)
                ? body.path
                : resolve(process.cwd(), body.path);

            await initContract(absolutePath, body.serviceName, body.version);

            return {
                ok: true,
                path: absolutePath,
                message: 'Contract initialized successfully',
            };
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });

    /**
     * POST /api/contract/validate - Validate contract
     */
    fastify.post('/api/contract/validate', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const body = request.body as { path?: string };
            const path = body.path || contractPath;
            const absolutePath = isAbsolute(path) ? path : resolve(process.cwd(), path);

            const result = await validateContract(absolutePath);
            return result;
        } catch (e) {
            return reply.status(500).send({
                error: e instanceof Error ? e.message : String(e),
            });
        }
    });
}
