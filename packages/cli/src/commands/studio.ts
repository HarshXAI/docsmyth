/**
 * Studio Command
 *
 * Launches the Docsmyth Studio web UI for exploring
 * Contract IR, Evidence timeline, Coverage heatmap, and Issues.
 */

import { resolve, isAbsolute } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export interface StudioCommandOptions {
    contract?: string;
    evidence?: string;
    port: number;
    host: string;
    open: boolean;
}

/**
 * Resolve a file path, handling relative and absolute paths
 */
function resolvePath(filePath: string): string {
    if (isAbsolute(filePath)) {
        return filePath;
    }
    return resolve(process.cwd(), filePath);
}

/**
 * Check if a JSON file is valid and not empty
 */
function isValidJsonFile(filePath: string): { valid: boolean; error?: string } {
    if (!existsSync(filePath)) {
        return { valid: false, error: 'File not found' };
    }

    try {
        const content = readFileSync(filePath, 'utf-8').trim();
        if (!content) {
            return { valid: false, error: 'File is empty' };
        }
        JSON.parse(content);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: `Invalid JSON: ${e instanceof Error ? e.message : e}` };
    }
}

/**
 * Run the studio command
 */
export async function studioCommand(options: StudioCommandOptions): Promise<void> {
    const contractPath = options.contract ? resolvePath(options.contract) : undefined;
    const evidencePath = options.evidence ? resolvePath(options.evidence) : undefined;

    // Determine mode
    const evidenceOnlyMode = !options.contract && !!options.evidence;

    // Validate inputs
    if (!options.contract && !options.evidence) {
        console.error('Error: Either --contract or --evidence is required');
        console.error('');
        console.error('Usage:');
        console.error('  docsmyth studio --contract ./contract.json');
        console.error('  docsmyth studio --evidence ./evidence.ndjson');
        console.error('  docsmyth studio --contract ./contract.json --evidence ./evidence.ndjson');
        process.exit(1);
    }

    // Validate contract file if provided
    if (contractPath && existsSync(contractPath)) {
        const validation = isValidJsonFile(contractPath);
        if (!validation.valid) {
            console.error(`Error: Contract file exists but is invalid: ${validation.error}`);
            console.error('');
            console.error('To generate a starter contract from evidence, run:');
            console.error(`  docsmyth infer --evidence <evidence.ndjson> --out ${contractPath} --service my-service`);
            console.error('');
            console.error('Or launch Studio in evidence-only mode:');
            console.error('  docsmyth studio --evidence <evidence.ndjson>');
            process.exit(1);
        }
    }

    // Validate evidence file if provided
    if (evidencePath && !existsSync(evidencePath)) {
        console.error(`Error: Evidence file not found: ${evidencePath}`);
        process.exit(1);
    }

    try {
        // Dynamic import to keep studio as optional dependency
        const { startStudio } = await import('@docsmyth/studio');

        console.log('Starting Docsmyth Studio...');
        if (evidenceOnlyMode) {
            console.log(`  Mode:     Evidence-only (contract will be inferred)`);
        }
        if (contractPath) {
            console.log(`  Contract: ${contractPath}`);
        }
        if (evidencePath) {
            console.log(`  Evidence: ${evidencePath}`);
        }
        console.log(`  Server: http://${options.host}:${options.port}`);
        console.log();

        const server = await startStudio({
            contractPath,
            evidencePath,
            port: options.port,
            host: options.host,
            open: options.open,
            evidenceOnlyMode,
        });

        console.log(`Studio running at ${server.url}`);
        if (evidenceOnlyMode) {
            console.log('');
            console.log('💡 Tip: Use the "Save Contract" button in Studio to export the inferred contract.');
        }
        console.log('Press Ctrl+C to stop');

        // Handle graceful shutdown
        const shutdown = async () => {
            console.log('\nShutting down studio...');
            await server.close();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Keep process alive
        await new Promise(() => { });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot find module')) {
            console.error('Error: @docsmyth/studio is not installed.');
            console.error('Run: pnpm add @docsmyth/studio');
            process.exit(1);
        }
        throw error;
    }
}
