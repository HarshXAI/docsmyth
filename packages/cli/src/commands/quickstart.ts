/**
 * Quickstart Command - One-Command Beginner Flow
 *
 * Starts record proxy, launches studio, and on exit saves inferred contract.
 * The simplest way to get started with Docsmyth.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, watchFile, unwatchFile } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { startRecordProxy, type RecordProxyServer } from '@docsmyth/capture-proxy';
import { inferContract } from '../services/infer.js';

export interface QuickstartCommandOptions {
    target: string;
    proxyPort: number;
    studioPort: number;
    host: string;
    evidenceOut: string;
    contractOut: string;
    open: boolean;
    verbose: boolean;
}

/**
 * Infer a service name from the target URL
 */
function inferServiceName(targetUrl: string): string {
    try {
        const url = new URL(targetUrl);
        // Use hostname without port, cleaned up
        let name = url.hostname.replace(/\./g, '-').replace(/^www-/, '');
        if (name === 'localhost' || name === '127-0-0-1') {
            // Try to use port as part of name
            name = `service-${url.port || '3000'}`;
        }
        return name;
    } catch {
        return 'my-service';
    }
}

/**
 * Quickstart command handler
 */
export async function quickstartCommand(options: QuickstartCommandOptions): Promise<void> {
    const {
        target,
        proxyPort,
        studioPort,
        host,
        evidenceOut,
        contractOut,
        open,
        verbose,
    } = options;

    // Validate target
    if (!target) {
        console.error('Error: --target is required (upstream URL)');
        process.exit(1);
    }

    // Infer service name from target
    const serviceName = inferServiceName(target);

    // Resolve paths
    const evidencePath = resolve(evidenceOut);
    const contractPath = resolve(contractOut);

    const evidenceDir = dirname(evidencePath);
    const contractDir = dirname(contractPath);

    if (evidenceDir && !existsSync(evidenceDir)) {
        mkdirSync(evidenceDir, { recursive: true });
    }
    if (contractDir && !existsSync(contractDir)) {
        mkdirSync(contractDir, { recursive: true });
    }

    // Clear evidence file if it exists (fresh start)
    if (existsSync(evidencePath)) {
        writeFileSync(evidencePath, '', 'utf-8');
    }

    const listenAddress = `${host}:${proxyPort}`;

    console.log(`
╭─────────────────────────────────────────────────────────────────────────╮
│                                                                         │
│   🚀 Docsmyth Quickstart - Beginner Mode                                │
│                                                                         │
│   This will:                                                            │
│   1. Start a recording proxy to capture traffic                         │
│   2. Launch Studio with live inference (updates as you browse)          │
│   3. On Ctrl+C, save the inferred contract                              │
│                                                                         │
╰─────────────────────────────────────────────────────────────────────────╯
`);

    let recordServer: RecordProxyServer | null = null;
    let studioProcess: ChildProcess | null = null;
    let eventCount = 0;
    let lastLoggedCount = 0;

    try {
        // Start record proxy FIRST
        console.log('📹 Starting recording proxy...');
        recordServer = await startRecordProxy({
            listen: listenAddress,
            targetUrl: target,
            evidenceOutputPath: evidencePath,
            logLevel: verbose ? 'debug' : 'info',
        });

        const listenAddr = recordServer.getListenAddress();
        console.log(`   ✓ Proxy listening on http://${listenAddr}`);
        console.log(`   ✓ Forwarding to ${target}`);
        console.log(`   ✓ Evidence → ${evidencePath}`);

        // Launch Studio IMMEDIATELY in evidence-only mode
        // Studio will show "Waiting for traffic..." and auto-update via SSE
        console.log('');
        console.log('🎨 Launching Studio (live inference mode)...');

        const studioArgs = [
            'studio',
            '--evidence', evidencePath,
            '--port', studioPort.toString(),
            '--host', host,
            '--no-open', // Don't auto-open browser yet
        ];

        const cliPath = process.argv[1];
        studioProcess = spawn(process.argv[0], [cliPath, ...studioArgs], {
            stdio: verbose ? 'inherit' : 'pipe',
            detached: false,
        });

        studioProcess.on('error', (err) => {
            console.warn(`   ⚠️  Could not launch Studio: ${err.message}`);
        });

        // Wait a moment for studio to start, then open browser if requested
        if (open) {
            setTimeout(async () => {
                try {
                    const { default: openBrowser } = await import('open');
                    await openBrowser(`http://${host}:${studioPort}`);
                } catch {
                    // Ignore browser open errors
                }
            }, 1500);
        }

        console.log(`   ✓ Studio starting at http://${host}:${studioPort}`);

        // Print initial instructions
        console.log(`
╭─────────────────────────────────────────────────────────────────────────╮
│                                                                         │
│   ⏳ Waiting for traffic...                                              │
│                                                                         │
│   Send requests through the proxy:                                      │
│                                                                         │
│   curl http://${listenAddr.padEnd(55)}│
│   curl http://${listenAddr}/users                                       │
│   curl -X POST http://${listenAddr}/users -H "Content-Type: application/json" \\    │
│        -d '{"name":"test"}'                                             │
│                                                                         │
│   Studio will update live: http://${host}:${studioPort.toString().padEnd(28)}│
│                                                                         │
│   Press Ctrl+C to stop and save your contract                           │
│                                                                         │
╰─────────────────────────────────────────────────────────────────────────╯
`);

        // Monitor evidence file for new events (simple progress indicator)
        let firstEventSeen = false;
        watchFile(evidencePath, { interval: 500 }, (curr) => {
            if (curr.size > 0) {
                // Count lines (events) - rough estimate
                try {
                    const stats = statSync(evidencePath);
                    // Rough estimate: ~500 bytes per event
                    eventCount = Math.max(eventCount, Math.ceil(stats.size / 500));
                    eventCount = recordServer?.getEventCount() || eventCount;
                } catch {
                    // Ignore stat errors
                }

                if (!firstEventSeen) {
                    firstEventSeen = true;
                    console.log('');
                    console.log('   ✨ First request captured! Studio is now inferring operations...');
                    console.log('');
                }

                // Log progress every 5 events
                if (eventCount - lastLoggedCount >= 5) {
                    console.log(`   📊 ${eventCount} events captured...`);
                    lastLoggedCount = eventCount;
                }
            }
        });

        // Handle shutdown
        const shutdown = async () => {
            unwatchFile(evidencePath);
            console.log('\n');
            console.log('────────────────────────────────────────────────────────────────────────');
            console.log('');
            console.log('🛑 Stopping quickstart...');

            // Stop studio process
            if (studioProcess && !studioProcess.killed) {
                studioProcess.kill('SIGTERM');
            }

            // Stop record proxy
            if (recordServer) {
                eventCount = recordServer.getEventCount();
                await recordServer.stop();
                console.log(`   ✓ Recording stopped: ${eventCount} events captured`);
            }

            // Infer and save contract if we have evidence
            if (existsSync(evidencePath) && eventCount > 0) {
                try {
                    console.log('');
                    console.log('📝 Inferring contract from evidence...');

                    const contract = await inferContract({
                        evidencePath,
                        serviceName,
                        serviceVersion: '0.0.1',
                        semanticOperationIds: true,
                    });

                    // Save contract
                    const json = JSON.stringify(contract, null, 2);
                    writeFileSync(contractPath, json, 'utf-8');

                    console.log(`   ✓ Operations: ${contract.operations.length}`);
                    console.log(`   ✓ Schemas: ${Object.keys(contract.schemas).length}`);
                    console.log(`   ✓ Saved to: ${contractPath}`);

                    // Print exact next commands
                    console.log(`
╭─────────────────────────────────────────────────────────────────────────╮
│                                                                         │
│   🎉 Done! Your contract has been saved.                                │
│                                                                         │
│   ▶ Next commands (copy & paste):                                       │
│                                                                         │
│   # View your contract in Studio (with evidence replay)                 │
│   docsmyth studio --contract ${basename(contractPath).padEnd(40)}│
│       --evidence ${basename(evidencePath).padEnd(50)}│
│                                                                         │
│   # Run proxy with contract validation (strict mode)                    │
│   docsmyth proxy --contract ${basename(contractPath).padEnd(41)}│
│       --target ${target.slice(0, 52).padEnd(52)}│
│                                                                         │
│   # Compile to OpenAPI                                                  │
│   docsmyth compile ${basename(contractPath)} -o ./openapi               │
│                                                                         │
╰─────────────────────────────────────────────────────────────────────────╯
`);
                } catch (e) {
                    console.error(`   ❌ Error inferring contract: ${e instanceof Error ? e.message : e}`);
                    console.log('');
                    console.log('   You can manually infer the contract:');
                    console.log(`   docsmyth infer --evidence ${evidencePath} --out ${contractPath} --service ${serviceName}`);
                }
            } else {
                console.log('');
                console.log('   ⚠️  No events captured. Start again and send some requests!');
                console.log(`   docsmyth quickstart --target ${target}`);
            }

            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Keep process alive
        await new Promise(() => {
            // Never resolves - runs until signal
        });

    } catch (error) {
        // Clean up on error
        unwatchFile(evidencePath);
        if (studioProcess && !studioProcess.killed) {
            studioProcess.kill('SIGTERM');
        }
        if (recordServer) {
            await recordServer.stop();
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: ${message}`);
        process.exit(1);
    }
}
