/**
 * Record Proxy - Contract-less Evidence Capture
 *
 * HTTP proxy that captures evidence without requiring a Contract IR.
 * Uses path normalization to generate operationIds from request paths.
 */

import * as http from 'node:http';
import httpProxy from 'http-proxy';
import {
    createContractlessWriter,
    DEFAULT_MAX_BODY_BYTES,
} from './contractless-writer.js';
import { createHealthStatus, type ProxyHealthStatus } from './health.js';
import { createLogger, type LogLevel } from './logger.js';

/**
 * Record proxy configuration
 */
export interface RecordProxyConfig {
    /** Listen address (e.g., "0.0.0.0:8080" or ":8080") */
    listen: string;
    /** Upstream target URL */
    targetUrl: string;
    /** Output path for evidence NDJSON */
    evidenceOutputPath: string;
    /** Maximum body size in bytes before truncation */
    maxBodyBytes?: number;
    /** Event rate limit per second */
    eventRateLimit?: number;
    /** Log level */
    logLevel?: LogLevel;
}

/**
 * Record proxy server instance
 */
export interface RecordProxyServer {
    /** HTTP server instance */
    server: http.Server;
    /** Stop the proxy server */
    stop(): Promise<void>;
    /** Get health status */
    getHealth(): ProxyHealthStatus;
    /** Get listen address */
    getListenAddress(): string;
    /** Get event count */
    getEventCount(): number;
}

/**
 * Extract headers from IncomingHttpHeaders
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
 * Normalize outgoing headers
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
 * Parse listen address
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
 * Parse query params
 */
function parseQueryParams(params: URLSearchParams): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of params) {
        if (result[key]) {
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
 * Body buffer for collecting request/response bodies
 */
interface BodyBuffer {
    chunks: Buffer[];
    totalSize: number;
    truncated: boolean;
}

function createBodyBuffer(): BodyBuffer {
    return { chunks: [], totalSize: 0, truncated: false };
}

function addChunk(buffer: BodyBuffer, chunk: Buffer, maxBytes: number): void {
    if (buffer.truncated) return;

    if (buffer.totalSize + chunk.length > maxBytes) {
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

function getBodyContent(buffer: BodyBuffer): unknown {
    if (buffer.chunks.length === 0) {
        return undefined;
    }

    const content = Buffer.concat(buffer.chunks).toString('utf-8');
    if (!content.trim()) {
        return undefined;
    }

    try {
        return JSON.parse(content);
    } catch {
        return content;
    }
}

/**
 * Start record proxy
 */
export async function startRecordProxy(config: RecordProxyConfig): Promise<RecordProxyServer> {
    const logger = createLogger(config.logLevel ?? 'info');
    const globalStartTime = Date.now();
    const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

    logger.info('Starting Record Proxy (no contract mode)');
    logger.info(`Target URL: ${config.targetUrl}`);
    logger.info(`Evidence output: ${config.evidenceOutputPath}`);

    // Create contractless writer
    const writer = createContractlessWriter({
        outputPath: config.evidenceOutputPath,
        maxBodyBytes,
        eventRateLimit: config.eventRateLimit,
        logger,
    });

    // Create proxy server
    const proxyServer = httpProxy.createProxyServer({
        target: config.targetUrl,
        changeOrigin: true,
        selfHandleResponse: false,
    });

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

        // Handle health endpoint
        if (path === '/health' || path === '/_acp/health') {
            const health = createHealthStatus(
                config.listen,
                config.targetUrl,
                null,
                true,
                writer.getEventCount(),
                writer.getDroppedCount(),
                globalStartTime
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(health, null, 2));
            return;
        }

        // Capture request
        const traceId = (req.headers['x-trace-id'] as string) ??
            `rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
        const requestBuffer = createBodyBuffer();

        req.on('data', (chunk: Buffer) => {
            addChunk(requestBuffer, chunk, maxBodyBytes);
        });

        // Intercept response
        const originalWriteHead = res.writeHead.bind(res);
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const responseBuffer = createBodyBuffer();
        let responseStatusCode = 200;
        let responseHeaders: http.OutgoingHttpHeaders = {};

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
            if (typeof statusMessageOrHeaders === 'string') {
                return originalWriteHead(statusCode, statusMessageOrHeaders, maybeHeaders as http.OutgoingHttpHeaders);
            }
            return originalWriteHead(statusCode, statusMessageOrHeaders as http.OutgoingHttpHeaders);
        } as typeof res.writeHead;

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

        (res as http.ServerResponse).end = function (
            chunk?: unknown,
            encodingOrCallback?: BufferEncoding | (() => void),
            callback?: () => void
        ): http.ServerResponse {
            if (chunk) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
                addChunk(responseBuffer, buffer, maxBodyBytes);
            }

            // Write evidence
            writer.write(
                method,
                path,
                extractHeaders(req.headers),
                getBodyContent(requestBuffer),
                url.search ? parseQueryParams(url.searchParams) : undefined,
                responseStatusCode,
                normalizeOutgoingHeaders(responseHeaders),
                getBodyContent(responseBuffer),
                traceId
            );

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
            logger.info(`Record proxy listening on ${actualAddress}`);

            resolve({
                server,
                stop: async () => {
                    return new Promise((resolveStop, rejectStop) => {
                        writer.flush();
                        server.close((err) => {
                            if (err) {
                                rejectStop(err);
                            } else {
                                logger.info('Record proxy stopped');
                                resolveStop();
                            }
                        });
                    });
                },
                getHealth: () =>
                    createHealthStatus(
                        actualAddress,
                        config.targetUrl,
                        null,
                        true,
                        writer.getEventCount(),
                        writer.getDroppedCount(),
                        globalStartTime
                    ),
                getListenAddress: () => actualAddress,
                getEventCount: () => writer.getEventCount(),
            });
        });
    });
}
