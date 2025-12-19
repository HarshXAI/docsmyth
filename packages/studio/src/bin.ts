#!/usr/bin/env node
/**
 * Docsmyth Studio CLI
 *
 * Standalone CLI entry point for running Docsmyth Studio.
 */

import { program } from 'commander';
import { resolve } from 'node:path';
import { startStudio } from './server.js';

// Read version from package.json
const version = '0.1.1-rc.7';

program
    .name('docsmyth-studio')
    .description('Docsmyth Studio - A first-class UI for API contract exploration')
    .version(version);

program
    .option('-c, --contract <path>', 'Path to Contract IR JSON file', './contract.json')
    .option('-e, --evidence <path>', 'Path to Evidence NDJSON file')
    .option('-p, --port <number>', 'Port to run the server on', '8787')
    .option('-h, --host <string>', 'Host to bind to', '127.0.0.1')
    .option('--no-open', 'Do not open browser automatically')
    .action(async (options) => {
        const contractPath = resolve(process.cwd(), options.contract);
        const evidencePath = options.evidence
            ? resolve(process.cwd(), options.evidence)
            : undefined;
        const port = parseInt(options.port, 10);
        const host = options.host;
        const open = options.open !== false;

        try {
            await startStudio({
                contractPath,
                evidencePath,
                port,
                host,
                open,
            });
        } catch (error) {
            console.error('Failed to start Docsmyth Studio:', error);
            process.exit(1);
        }
    });

program.parse();
