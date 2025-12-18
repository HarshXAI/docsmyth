/**
 * Proxy command - starts the capture proxy sidecar
 *
 * Starts an HTTP proxy that forwards requests to an upstream target
 * while capturing evidence events mapped to Contract IR operationIds.
 */

import { startProxy, type ProxyConfig, type ContractSource } from '@docsmyth/capture-proxy';

export interface ProxyCommandOptions {
    listen: string;
    target: string;
    hubUrl?: string;
    hubToken?: string;
    service?: string;
    version: string;
    contract?: string;
    capture: boolean;
    out: string;
    maxBodyBytes: number;
    eventRateLimit: number;
    captureUnmatched: boolean;
    verbose: boolean;
}

/**
 * Proxy command handler
 */
export async function proxyCommand(options: ProxyCommandOptions): Promise<void> {
    // Validate options
    if (!options.target) {
        console.error('Error: --target is required (upstream URL)');
        process.exit(1);
    }

    // Determine contract source
    let contractSource: ContractSource;

    if (options.contract) {
        // Load from local file
        contractSource = { type: 'file', path: options.contract };
    } else if (options.hubUrl && options.service) {
        // Load from hub
        const token = options.hubToken ?? process.env.ACP_HUB_TOKEN;
        contractSource = {
            type: 'hub',
            hubUrl: options.hubUrl,
            token,
            service: options.service,
            version: options.version,
        };
    } else {
        console.error('Error: Either --contract (file path) or --hub-url + --service is required');
        process.exit(1);
    }

    // Build config from environment and options
    const config: ProxyConfig = {
        listen: process.env.ACP_PROXY_LISTEN ?? options.listen,
        targetUrl: process.env.ACP_PROXY_TARGET_URL ?? options.target,
        captureEnabled:
            process.env.ACP_CAPTURE === '1' ||
            process.env.ACP_CAPTURE?.toLowerCase() === 'true' ||
            options.capture,
        contractSource,
        evidenceOutputPath: process.env.ACP_EVIDENCE_OUT ?? options.out,
        maxBodyBytes: parseInt(process.env.ACP_MAX_BODY_BYTES ?? '', 10) || options.maxBodyBytes,
        eventRateLimit:
            parseInt(process.env.ACP_EVENT_RATE_LIMIT ?? '', 10) || options.eventRateLimit,
        logLevel: options.verbose ? 'debug' : 'info',
        captureUnmatched: options.captureUnmatched,
    };

    // Log configuration
    console.log('ACP Capture Proxy Configuration:');
    console.log(`  Listen:           ${config.listen}`);
    console.log(`  Target:           ${config.targetUrl}`);
    console.log(`  Capture Enabled:  ${config.captureEnabled}`);
    console.log(
        `  Contract Source:  ${contractSource.type === 'file' ? contractSource.path : `${contractSource.hubUrl} (${contractSource.service}@${contractSource.version})`}`
    );
    if (config.captureEnabled) {
        console.log(`  Evidence Output:  ${config.evidenceOutputPath}`);
        console.log(`  Max Body Bytes:   ${config.maxBodyBytes}`);
        console.log(`  Event Rate Limit: ${config.eventRateLimit}/s`);
    }
    console.log('');

    try {
        const server = await startProxy(config);
        console.log(`Proxy started: ${server.getListenAddress()} -> ${config.targetUrl}`);

        // Handle graceful shutdown
        const shutdown = async (signal: string) => {
            console.log(`\nReceived ${signal}, shutting down...`);
            try {
                await server.stop();
                const health = server.getHealth();
                if (config.captureEnabled) {
                    console.log(`Evidence captured: ${health.capture.eventsWritten} events`);
                    if (health.capture.eventsDropped > 0) {
                        console.log(`Events dropped (rate limit): ${health.capture.eventsDropped}`);
                    }
                    console.log(`Evidence written to: ${config.evidenceOutputPath}`);
                }
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
