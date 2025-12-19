/**
 * SSE Stream Routes
 *
 * Server-Sent Events endpoint for real-time updates.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getWatcher, stopWatcher, type WatcherEvent } from '../services/watcher-service.js';

export interface StreamRoutesOptions {
    evidencePath?: string;
    evidenceOnlyMode: boolean;
    serviceName?: string;
    serviceVersion?: string;
}

export async function streamRoutes(
    fastify: FastifyInstance,
    options: StreamRoutesOptions
): Promise<void> {
    const { evidencePath, evidenceOnlyMode, serviceName, serviceVersion } = options;

    /**
     * GET /api/stream - SSE endpoint for real-time updates
     *
     * In evidence-only mode, this watches the evidence file and pushes
     * updates whenever it changes (new events added).
     */
    fastify.get('/api/stream', async (request: FastifyRequest, reply: FastifyReply) => {
        // Only available in evidence-only mode with an evidence path
        if (!evidenceOnlyMode || !evidencePath) {
            return reply.status(400).send({
                error: 'SSE streaming is only available in evidence-only mode with an evidence file',
            });
        }

        // Set SSE headers
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        });

        // Helper to send SSE message
        const sendEvent = (event: WatcherEvent) => {
            reply.raw.write(`event: ${event.type}\n`);
            reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        // Send initial heartbeat
        reply.raw.write(':heartbeat\n\n');

        // Get or create watcher
        const watcher = getWatcher({
            evidencePath,
            serviceName: serviceName || 'inferred-service',
            serviceVersion: serviceVersion || '0.0.1',
            debounceMs: 300,
        });

        // Start watching if not already started
        watcher.start().catch(console.error);

        // Listen for updates
        const onUpdate = (event: WatcherEvent) => {
            sendEvent(event);
        };

        watcher.on('update', onUpdate);

        // Send current state immediately if available
        const currentContract = watcher.getCurrentContract();
        if (currentContract) {
            // Trigger a refresh to get full state
            watcher.forceRefresh().catch(console.error);
        }

        // Heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
            reply.raw.write(':heartbeat\n\n');
        }, 30000);

        // Cleanup on close
        request.raw.on('close', () => {
            clearInterval(heartbeatInterval);
            watcher.off('update', onUpdate);
        });

        // Keep connection open (don't return)
        // Fastify will handle this properly
    });

    /**
     * POST /api/stream/refresh - Force refresh the watcher state
     */
    fastify.post('/api/stream/refresh', async (_request: FastifyRequest, reply: FastifyReply) => {
        if (!evidencePath) {
            return reply.status(400).send({
                error: 'No evidence file configured',
            });
        }

        const watcher = getWatcher({
            evidencePath,
            serviceName: serviceName || 'inferred-service',
            serviceVersion: serviceVersion || '0.0.1',
        });

        await watcher.forceRefresh();

        return { ok: true, message: 'Refresh triggered' };
    });

    /**
     * GET /api/stream/status - Get current watcher status
     */
    fastify.get('/api/stream/status', async (_request: FastifyRequest, _reply: FastifyReply) => {
        if (!evidencePath) {
            return {
                enabled: false,
                reason: 'No evidence file configured',
            };
        }

        if (!evidenceOnlyMode) {
            return {
                enabled: false,
                reason: 'Not in evidence-only mode',
            };
        }

        return {
            enabled: true,
            evidencePath,
            serviceName: serviceName || 'inferred-service',
        };
    });

    // Cleanup watcher on server close
    fastify.addHook('onClose', async () => {
        if (evidencePath) {
            stopWatcher(evidencePath);
        }
    });
}
