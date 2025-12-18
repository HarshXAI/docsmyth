/**
 * HTTP Capture Proxy
 *
 * Language-agnostic HTTP sidecar proxy that forwards requests to an upstream
 * target while capturing evidence events mapped to Contract IR operationIds.
 */

import * as http from 'node:http';
import httpProxy from 'http-proxy';
import type { ContractIR } from '@acp/ir-spec';
import type { EvidenceEvent } from '@acp/evidence-sdk';
import { createOperationMatcher, findOperation, type OperationMatcher } from '@acp/path-matcher';
import { loadContract, type ContractSource } from './contract-loader.js';
import {
    createEvidenceWriter,
    type EvidenceWriter,
    DEFAULT_MAX_BODY_BYTES,
} from './evidence-writer.js';
import { createHealthStatus, type ProxyHealthStatus } from './health.js';
import { createLogger, type Logger, type LogLevel } from './logger.js';

/**
 * Proxy configuration
 */
export interface ProxyConfig {
    /** Listen address (e.g., "0.0.0.0:8080" or ":8080") */
    listen: string;
    /** Upstream target URL (e.g., "http://localhost:3000") */
    targetUrl: string;
    /** Whether capture is enabled */
    captureEnabled: boolean;
    /** Contract source */
    contractSource: ContractSource;
    /** Output path for evidence NDJSON */
    evidenceOutputPath: string;
    /** Maximum body size in bytes before truncation */
    maxBodyBytes?: number;
    /** Event rate limit per second */
    eventRateLimit?: number;
    /** Log level */
    logLevel?: LogLevel;
    /** Whether to capture unmatched requests */
    captureUnmatched?: boolean;
}

/**
 * Running proxy server instance
 */
export interface ProxyServer {
    /** HTTP server instance */
    server: http.Server;
    /** Stop the proxy server */
    stop(): Promise<void>;
    /** Get health status */
    getHealth(): ProxyHealthStatus;
    /** Get listen address */
    getListenAddress(): string;
}

/**
 * Extract headers from IncomingHttpHeaders to Record<string, string>
 */
function extractHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) {
            result[key] = Array.isArray(value) ? value.join(', ') : value;
        }
    }
    return result;
}

/**
 * Parse listen address into host and port
 */
function parseListenAddress(listen: string): { host: string; port: number } {
    const parts = listen.split(':');
    if (parts.length === 1) {
        return { host: '0.0.0.0', port: parseInt(parts[0], 10) };
    }
    const port = parseInt(parts[parts.length - 1], 10);
    const host = parts.slice(0, -1).join(':') || '0.0.0.0';
    return { host, port };
}

/**
 * Generate a simple trace ID
 */
function generateTraceId(): string {
    return `acp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Buffer to collect request/response body chunks
 */
interface BodyBuffer {
    chunks: Buffer[];
    totalSize: number;
    truncated: boolean;
}

/**
 * Create a new body buffer
 */
function createBodyBuffer(): BodyBuffer {
    return {
        chunks: [],
        totalSize: 0,
        truncated: false,
    };
}

/**
 * Add chunk to body buffer, respecting max size
 */
function addChunk(buffer: BodyBuffer, chunk: Buffer, maxBytes: number): void {
    if (buffer.truncated) return;

    if (buffer.totalSize + chunk.length > maxBytes) {
        // Only add partial chunk up to limit
        const remaining = maxBytes - buffer.totalSize;
        if (remaining > 0) {
            buffer.chunks.push(chunk.subarray(0, remaining));
            buffer.totalSize += remaining;
        }
        buffer.truncated = true;
    } else {
        buffer.chunks.push(chunk);
        buffer.totalSize += chunk.length;
    }
}

/**
 * Get body content from buffer
 */
function getBodyContent(buffer: BodyBuffer): unknown {
    if (buffer.chunks.length === 0) {
        return undefined;
    }

    const content = Buffer.concat(buffer.chunks).toString('utf-8');
    if (!content.trim()) {
        return undefined;
    }

    // Try to parse as JSON
    try {
        return JSON.parse(content);
    } catch {
        // Return as string if not JSON
        return content;
    }
}

/**
 * Parse query params to record
 */
function parseQueryParams(params: URLSearchParams): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of params) {
        if (result[key]) {
            // Handle multiple values
            if (Array.isArray(result[key])) {
                (result[key] as string[]).push(value);
            } else {
                result[key] = [result[key] as string, value];
            }
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Normalize outgoing headers to Record<string, string>
 */
function normalizeOutgoingHeaders(headers: http.OutgoingHttpHeaders): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) {
            result[key] = Array.isArray(value)
                ? value.join(', ')
                : typeof value === 'number'
                    ? String(value)
                    : value;
        }
    }
    return result;
}

/**
 * Create and configure the proxy
 */
export function createProxy(
    config: ProxyConfig,
    contract: ContractIR | null,
    logger: Logger,
    globalStartTime: number
): {
    server: http.Server;
    proxyServer: httpProxy;
    matcher: OperationMatcher | null;
    writer: EvidenceWriter | null;
} {
    const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const matcher = contract ? createOperationMatcher(contract) : null;

    // Create evidence writer if capture is enabled
    const writer =
        config.captureEnabled && contract
            ? createEvidenceWriter({
                outputPath: config.evidenceOutputPath,
                maxBodyBytes,
                eventRateLimit: config.eventRateLimit,
                logger,
            })
            : null;

    // Create proxy server
    const proxyServer = httpProxy.createProxyServer({
        target: config.targetUrl,
        changeOrigin: true,
        selfHandleResponse: false,
    });

    // Handle proxy errors
    proxyServer.on('error', (err: Error, _req: http.IncomingMessage, res: http.ServerResponse | NodeJS.WritableStream) => {
        logger.error(`Proxy error: ${err.message}`);
        if (res instanceof http.ServerResponse && !res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
        }
    });

    // Create HTTP server
    const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const path = url.pathname;
        const method = req.method ?? 'GET';

        // Handle health endpoint (not forwarded)
        if (path === '/health' || path === '/_acp/health') {
            const health = createHealthStatus(
                config.listen,
                config.targetUrl,
                contract,
                config.captureEnabled,
                writer?.getEventCount() ?? 0,
                writer?.getDroppedCount() ?? 0,
                globalStartTime
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(health, null, 2));
            return;
        }

        // Match request to operation
        const match = matcher ? findOperation(matcher, method, path) : null;

        // If capture is disabled or no match (and not capturing unmatched), just proxy
        if (!config.captureEnabled || !writer || (!match && !config.captureUnmatched)) {
            proxyServer.web(req, res);
            return;
        }

        // Capture evidence
        const traceId = (req.headers['x-trace-id'] as string) ?? generateTraceId();
        const requestStartTime = Date.now();
        const requestBuffer = createBodyBuffer();

        // Collect request body
        req.on('data', (chunk: Buffer) => {
            addChunk(requestBuffer, chunk, maxBodyBytes);
        });

        // Intercept the response
        const originalWriteHead = res.writeHead.bind(res);
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const responseBuffer = createBodyBuffer();
        let responseStatusCode = 200;
        let responseHeaders: http.OutgoingHttpHeaders = {};

        // Override writeHead to capture status and headers
        (res as http.ServerResponse).writeHead = function (
            statusCode: number,
            statusMessageOrHeaders?: string | http.OutgoingHttpHeaders | http.OutgoingHttpHeader[],
            maybeHeaders?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]
        ): http.ServerResponse {
            responseStatusCode = statusCode;
            if (typeof statusMessageOrHeaders === 'object' && !Array.isArray(statusMessageOrHeaders)) {
                responseHeaders = statusMessageOrHeaders;
            } else if (maybeHeaders && typeof maybeHeaders === 'object' && !Array.isArray(maybeHeaders)) {
                responseHeaders = maybeHeaders;
            }
            // Call original with proper arguments
            if (typeof statusMessageOrHeaders === 'string') {
                return originalWriteHead(statusCode, statusMessageOrHeaders, maybeHeaders as http.OutgoingHttpHeaders);
            }
            return originalWriteHead(statusCode, statusMessageOrHeaders as http.OutgoingHttpHeaders);
        } as typeof res.writeHead;

        // Override write to capture response body
        (res as http.ServerResponse).write = function (
            chunk: unknown,
            encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
            callback?: (error: Error | null | undefined) => void
        ): boolean {
            if (chunk) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
                addChunk(responseBuffer, buffer, maxBodyBytes);
            }
            if (typeof encodingOrCallback === 'function') {
                return originalWrite(chunk, encodingOrCallback);
            }
            if (encodingOrCallback !== undefined) {
                return originalWrite(chunk, encodingOrCallback, callback);
            }
            return originalWrite(chunk);
        } as typeof res.write;

        // Override end to capture final body and emit evidence
        (res as http.ServerResponse).end = function (
            chunk?: unknown,
            encodingOrCallback?: BufferEncoding | (() => void),
            callback?: () => void
        ): http.ServerResponse {
            if (chunk) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
                addChunk(responseBuffer, buffer, maxBodyBytes);
            }

            // Build evidence event
            const event: EvidenceEvent = {
                evidenceVersion: '0.1',
                operationId: match?.operation.operationId ?? '_unmatched',
                protocol: 'http',
                timestamp: new Date(requestStartTime).toISOString(),
                traceId,
                request: {
                    method,
                    path,
                    query: url.search ? parseQueryParams(url.searchParams) : undefined,
                    params: match?.params,
                    headers: extractHeaders(req.headers),
                    body: getBodyContent(requestBuffer),
                },
                response: {
                    status: responseStatusCode,
                    headers: normalizeOutgoingHeaders(responseHeaders),
                    body: getBodyContent(responseBuffer),
                },
            };

            // Write evidence asynchronously
            writer.write(event);

            // Call original end
            if (typeof encodingOrCallback === 'function') {
                return originalEnd(chunk, encodingOrCallback);
            }
            if (encodingOrCallback !== undefined) {
                return originalEnd(chunk, encodingOrCallback, callback);
            }
            return originalEnd(chunk);
        } as typeof res.end;

        // Forward the request
        proxyServer.web(req, res);
    });

    return { server, proxyServer, matcher, writer };
}

/**
 * Start the proxy server
 */
export async function startProxy(config: ProxyConfig): Promise<ProxyServer> {
    const logger = createLogger(config.logLevel ?? 'info');
    const globalStartTime = Date.now();

    logger.info('Starting ACP Capture Proxy');
    logger.info(`Target URL: ${config.targetUrl}`);
    logger.info(`Capture enabled: ${config.captureEnabled}`);

    // Load contract
    let contract: ContractIR | null = null;
    try {
        contract = await loadContract(config.contractSource, logger);
    } catch (error) {
        logger.error(`Failed to load contract: ${error}`);
        if (config.captureEnabled) {
            throw error; // Can't capture without a contract
        }
        logger.warn('Continuing without contract (capture disabled)');
    }

    const { server, writer } = createProxy(config, contract, logger, globalStartTime);

    // Parse listen address
    const { host, port } = parseListenAddress(config.listen);

    return new Promise((resolve, reject) => {
        server.on('error', (err) => {
            logger.error(`Server error: ${err.message}`);
            reject(err);
        });

        server.listen(port, host, () => {
            const addr = server.address();
            const actualAddress =
                typeof addr === 'string' ? addr : `${addr?.address}:${addr?.port}`;
            logger.info(`Proxy listening on ${actualAddress}`);

            const proxyServerResult: ProxyServer = {
                server,
                stop: async () => {
                    return new Promise((resolveStop, rejectStop) => {
                        writer?.flush();
                        server.close((err) => {
                            if (err) {
                                rejectStop(err);
                            } else {
                                logger.info('Proxy stopped');
                                resolveStop();
                            }
                        });
                    });
                },
                getHealth: () =>
                    createHealthStatus(
                        actualAddress,
                        config.targetUrl,
                        contract,
                        config.captureEnabled,
                        writer?.getEventCount() ?? 0,
                        writer?.getDroppedCount() ?? 0,
                        globalStartTime
                    ),
                getListenAddress: () => actualAddress,
            };

            resolve(proxyServerResult);
        });
    });
}
