import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startProxy, type ProxyConfig, type ProxyServer } from '../src/proxy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../../fixtures/contract-ir/v0.1');
const contractPath = resolve(fixturesDir, 'minimal-http.json');

// Helper to find an available port
async function getAvailablePort(): Promise<number> {
    return new Promise((resolve) => {
        const server = http.createServer();
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as { port: number };
            server.close(() => resolve(addr.port));
        });
    });
}

// Helper to make HTTP request
async function httpRequest(
    url: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
    const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const contentType = response.headers.get('content-type');
    const body = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
        headers[key] = value;
    });

    return { status: response.status, headers, body };
}

describe('capture-proxy integration', () => {
    let upstreamServer: http.Server;
    let upstreamPort: number;
    let proxyPort: number;
    let proxyServer: ProxyServer | null = null;
    let evidencePath: string;

    // Track requests received by upstream
    const upstreamRequests: Array<{
        method: string;
        url: string;
        headers: http.IncomingHttpHeaders;
        body: string;
    }> = [];

    beforeAll(async () => {
        upstreamPort = await getAvailablePort();

        // Create a simple upstream server
        upstreamServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', (chunk) => {
                body += chunk;
            });
            req.on('end', () => {
                upstreamRequests.push({
                    method: req.method ?? 'GET',
                    url: req.url ?? '/',
                    headers: req.headers,
                    body,
                });

                // Handle different paths
                const url = req.url ?? '/';

                if (url === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok' }));
                } else if (url.startsWith('/orders') && req.method === 'POST') {
                    res.writeHead(201, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ id: 'ord-123', status: 'created' }));
                } else if (url.startsWith('/orders/') && req.method === 'GET') {
                    const id = url.split('/')[2];
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ id, status: 'pending' }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not found' }));
                }
            });
        });

        await new Promise<void>((resolve) => {
            upstreamServer.listen(upstreamPort, '127.0.0.1', resolve);
        });
    });

    afterAll(async () => {
        await proxyServer?.stop();
        await new Promise<void>((resolve, reject) => {
            upstreamServer.close((err) => (err ? reject(err) : resolve()));
        });
    });

    beforeEach(async () => {
        upstreamRequests.length = 0;
        await proxyServer?.stop();
        proxyServer = null;
        proxyPort = await getAvailablePort();
        evidencePath = `/tmp/acp-proxy-test-${Date.now()}.ndjson`;
    });

    it('forwards requests to upstream when capture is disabled', async () => {
        const config: ProxyConfig = {
            listen: `127.0.0.1:${proxyPort}`,
            targetUrl: `http://127.0.0.1:${upstreamPort}`,
            captureEnabled: false,
            contractSource: { type: 'file', path: contractPath },
            evidenceOutputPath: evidencePath,
            logLevel: 'silent',
        };

        proxyServer = await startProxy(config);

        // Request an endpoint that gets forwarded to upstream (not /health which is intercepted)
        const response = await httpRequest(`http://127.0.0.1:${proxyPort}/orders/test-123`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ id: 'test-123', status: 'pending' });

        // Request should have reached upstream
        expect(upstreamRequests.length).toBe(1);
        expect(upstreamRequests[0].url).toBe('/orders/test-123');

        // No evidence file should be created when capture is disabled
        expect(existsSync(evidencePath)).toBe(false);
    });

    it('captures evidence when capture is enabled', async () => {
        const config: ProxyConfig = {
            listen: `127.0.0.1:${proxyPort}`,
            targetUrl: `http://127.0.0.1:${upstreamPort}`,
            captureEnabled: true,
            contractSource: { type: 'file', path: contractPath },
            evidenceOutputPath: evidencePath,
            logLevel: 'silent',
        };

        proxyServer = await startProxy(config);

        // Make a request that matches an operation in the contract
        const response = await httpRequest(`http://127.0.0.1:${proxyPort}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: { customerId: 'cust-1', items: [{ productId: 'prod-1', quantity: 2 }] },
        });

        expect(response.status).toBe(201);

        // Give time for async evidence write
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Check evidence was written
        expect(existsSync(evidencePath)).toBe(true);
        const content = readFileSync(evidencePath, 'utf-8').trim();
        expect(content).not.toBe('');

        const events = content.split('\n').map((line) => JSON.parse(line));
        expect(events.length).toBe(1);

        const event = events[0];
        expect(event.operationId).toBe('createOrder');
        expect(event.request.method).toBe('POST');
        expect(event.request.path).toBe('/orders');
        expect(event.response.status).toBe(201);
    });

    it('sanitizes Authorization header', async () => {
        const config: ProxyConfig = {
            listen: `127.0.0.1:${proxyPort}`,
            targetUrl: `http://127.0.0.1:${upstreamPort}`,
            captureEnabled: true,
            contractSource: { type: 'file', path: contractPath },
            evidenceOutputPath: evidencePath,
            logLevel: 'silent',
        };

        proxyServer = await startProxy(config);

        await httpRequest(`http://127.0.0.1:${proxyPort}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer secret-token-12345',
            },
            body: { customerId: 'cust-1', items: [{ productId: 'prod-1', quantity: 2 }] },
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        const content = readFileSync(evidencePath, 'utf-8').trim();
        const event = JSON.parse(content.split('\n')[0]);

        // Authorization header should be removed
        expect(event.request.headers.authorization).toBeUndefined();
        expect(event.request.headers.Authorization).toBeUndefined();
    });

    it('returns health status on /health endpoint', async () => {
        const config: ProxyConfig = {
            listen: `127.0.0.1:${proxyPort}`,
            targetUrl: `http://127.0.0.1:${upstreamPort}`,
            captureEnabled: true,
            contractSource: { type: 'file', path: contractPath },
            evidenceOutputPath: evidencePath,
            logLevel: 'silent',
        };

        proxyServer = await startProxy(config);

        // The proxy's own health endpoint (not forwarded to upstream)
        const response = await httpRequest(`http://127.0.0.1:${proxyPort}/_acp/health`);
        expect(response.status).toBe(200);

        const health = response.body as Record<string, unknown>;
        expect(health.status).toBe('ok');
        expect((health.contract as Record<string, unknown>).loaded).toBe(true);
        expect((health.contract as Record<string, unknown>).serviceName).toBe('orders-api');
        expect((health.capture as Record<string, unknown>).enabled).toBe(true);

        // Upstream should NOT have received this request
        expect(upstreamRequests.length).toBe(0);
    });

    it('does not capture unmatched requests by default', async () => {
        const config: ProxyConfig = {
            listen: `127.0.0.1:${proxyPort}`,
            targetUrl: `http://127.0.0.1:${upstreamPort}`,
            captureEnabled: true,
            contractSource: { type: 'file', path: contractPath },
            evidenceOutputPath: evidencePath,
            logLevel: 'silent',
            captureUnmatched: false,
        };

        proxyServer = await startProxy(config);

        // Make a request that doesn't match any operation
        const response = await httpRequest(`http://127.0.0.1:${proxyPort}/unknown-path`);
        expect(response.status).toBe(404);

        await new Promise((resolve) => setTimeout(resolve, 100));

        // No evidence should be written for unmatched request
        const content = readFileSync(evidencePath, 'utf-8').trim();
        expect(content).toBe('');
    });

    it('captures unmatched requests when captureUnmatched is enabled', async () => {
        const config: ProxyConfig = {
            listen: `127.0.0.1:${proxyPort}`,
            targetUrl: `http://127.0.0.1:${upstreamPort}`,
            captureEnabled: true,
            contractSource: { type: 'file', path: contractPath },
            evidenceOutputPath: evidencePath,
            logLevel: 'silent',
            captureUnmatched: true,
        };

        proxyServer = await startProxy(config);

        await httpRequest(`http://127.0.0.1:${proxyPort}/unknown-path`);

        await new Promise((resolve) => setTimeout(resolve, 100));

        const content = readFileSync(evidencePath, 'utf-8').trim();
        expect(content).not.toBe('');

        const event = JSON.parse(content.split('\n')[0]);
        expect(event.operationId).toBe('_unmatched');
    });

    it('truncates large request bodies', async () => {
        const config: ProxyConfig = {
            listen: `127.0.0.1:${proxyPort}`,
            targetUrl: `http://127.0.0.1:${upstreamPort}`,
            captureEnabled: true,
            contractSource: { type: 'file', path: contractPath },
            evidenceOutputPath: evidencePath,
            maxBodyBytes: 100, // Very small limit for testing
            logLevel: 'silent',
        };

        proxyServer = await startProxy(config);

        // Create a large body
        const largeBody = {
            customerId: 'cust-1',
            items: Array(100)
                .fill(null)
                .map((_, i) => ({ productId: `prod-${i}`, quantity: i + 1 })),
        };

        await httpRequest(`http://127.0.0.1:${proxyPort}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: largeBody,
        });

        await new Promise((resolve) => setTimeout(resolve, 100));

        const content = readFileSync(evidencePath, 'utf-8').trim();
        const event = JSON.parse(content.split('\n')[0]);

        // Body should be truncated
        expect(event.request.body._truncated).toBe(true);
        expect(event.request.body._marker).toBe('[TRUNCATED]');
    });
});
