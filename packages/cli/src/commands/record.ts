/**
 * Record Command - Capture Evidence Without a Contract
 *
 * Starts a proxy that records all HTTP traffic as evidence NDJSON.
 * OperationIds are inferred from METHOD + normalized path.
 */

import { startRecordProxy, type RecordProxyConfig } from '@docsmyth/capture-proxy';

export interface RecordCommandOptions {
    listen: string;
    target: string;
    out: string;
    maxBodyBytes: number;
    eventRateLimit: number;
    verbose: boolean;
}

/**
 * Record command handler
 */
export async function recordCommand(options: RecordCommandOptions): Promise<void> {
    if (!options.target) {
        console.error('Error: --target is required (upstream URL)');
        process.exit(1);
    }

    const config: RecordProxyConfig = {
        listen: options.listen,
        targetUrl: options.target,
        evidenceOutputPath: options.out,
        maxBodyBytes: options.maxBodyBytes,
        eventRateLimit: options.eventRateLimit,
        logLevel: options.verbose ? 'debug' : 'info',
    };

    try {
        const server = await startRecordProxy(config);
        const listenAddr = server.getListenAddress();
        const targetUrl = options.target;

        // Print friendly banner
        console.log(`
╭─────────────────────────────────────────────────────────────────────────╮
│                                                                         │
│   📹 Docsmyth Record Mode - Capturing Traffic                           │
│                                                                         │
│   Proxy:      http://${listenAddr.padEnd(45)}│
│   Target:     ${targetUrl.padEnd(50)}│
│   Evidence:   ${options.out.padEnd(50)}│
│                                                                         │
│   Send requests through the proxy to capture evidence.                  │
│   No contract required - operations inferred from paths.                │
│                                                                         │
╰─────────────────────────────────────────────────────────────────────────╯

Example requests:
  curl http://${listenAddr}/users
  curl http://${listenAddr}/users/123
  curl -X POST http://${listenAddr}/users -H "Content-Type: application/json" -d '{"name":"test"}'

Press Ctrl+C to stop recording.
`);

        // Handle shutdown
        const shutdown = async (signal: string) => {
            console.log(`\nReceived ${signal}, stopping...`);
            try {
                await server.stop();
                const eventCount = server.getEventCount();
                console.log(`
Recording complete!
  Events captured: ${eventCount}
  Evidence file:   ${options.out}

Next steps:
  1. Infer a contract:   docsmyth infer --evidence ${options.out} --out ./contract.json --service my-service
  2. Launch Studio:      docsmyth studio --evidence ${options.out}
  3. Or quick preview:   docsmyth studio --contract ./contract.json --evidence ${options.out}
`);
                process.exit(0);
            } catch (error) {
                console.error('Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // Keep process alive
        await new Promise(() => {
            // Never resolves - proxy runs until signal
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: ${message}`);
        process.exit(1);
    }
}
