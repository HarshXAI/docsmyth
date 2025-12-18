/**
 * Pull command - fetches contracts from the Hub
 *
 * Downloads IR and OpenAPI to stable file paths.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

export interface PullOptions {
    hub: string;
    service: string;
    version?: string;
    out: string;
    token?: string;
    verbose?: boolean;
}

/**
 * Make an HTTP GET request
 */
async function httpGet(
    url: string,
    token?: string
): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
        'Accept': 'application/json',
        'User-Agent': 'acp-cli/0.1.0',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method: 'GET',
        headers,
    });

    const responseBody = await response.json().catch(() => null);

    return {
        status: response.status,
        body: responseBody,
    };
}

/**
 * Stable JSON stringify with sorted keys for deterministic output
 */
function stableStringify(value: unknown, indent = 2): string {
    return JSON.stringify(value, sortKeys(), indent);
}

/**
 * Create a replacer function that sorts object keys
 */
function sortKeys() {
    const seen = new WeakSet();

    return function (_key: string, value: unknown): unknown {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            if (seen.has(value)) {
                return value;
            }
            seen.add(value);

            const sorted: Record<string, unknown> = {};
            const keys = Object.keys(value as Record<string, unknown>).sort();
            for (const k of keys) {
                sorted[k] = (value as Record<string, unknown>)[k];
            }
            return sorted;
        }
        return value;
    };
}

/**
 * Pull command handler
 */
export async function pullCommand(options: PullOptions): Promise<void> {
    // Validate required options
    if (!options.hub) {
        console.error('Error: --hub is required');
        process.exit(1);
    }

    if (!options.service) {
        console.error('Error: --service is required');
        process.exit(1);
    }

    if (!options.out) {
        console.error('Error: --out is required');
        process.exit(1);
    }

    // Get token from option or environment
    const token = options.token ?? process.env.ACP_HUB_TOKEN;

    // Build URL
    const hubUrl = options.hub.endsWith('/') ? options.hub.slice(0, -1) : options.hub;
    const version = options.version ?? 'latest';
    const contractUrl = `${hubUrl}/v1/services/${encodeURIComponent(options.service)}/contracts/${version}`;

    if (options.verbose) {
        console.log(`Fetching ${options.service}@${version}...`);
    }

    // Fetch contract
    let contractResponse: { status: number; body: unknown };
    try {
        contractResponse = await httpGet(contractUrl, token);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to connect to hub: ${message}`);
        process.exit(1);
    }

    if (contractResponse.status === 404) {
        console.error(`Error: Contract ${options.service}@${version} not found`);
        process.exit(1);
    }

    if (contractResponse.status === 401) {
        console.error('Error: Unauthorized. Provide a valid token via --token or ACP_HUB_TOKEN.');
        process.exit(1);
    }

    if (contractResponse.status !== 200) {
        const error = contractResponse.body as { message?: string };
        console.error(`Error: Server returned ${contractResponse.status} - ${error?.message ?? 'Unknown error'}`);
        process.exit(1);
    }

    const contract = contractResponse.body as {
        metadata?: { version?: string; serviceName?: string; irHash?: string };
        ir?: unknown;
        openApiUrl?: string;
    };

    if (!contract?.ir) {
        console.error('Error: Invalid response from hub (missing IR)');
        process.exit(1);
    }

    const actualVersion = contract.metadata?.version ?? version;

    // Fetch OpenAPI
    let openApi: unknown | undefined;
    if (contract.openApiUrl) {
        const openApiUrl = contract.openApiUrl.startsWith('/')
            ? `${hubUrl}${contract.openApiUrl}`
            : contract.openApiUrl;

        if (options.verbose) {
            console.log(`Fetching OpenAPI from ${openApiUrl}...`);
        }

        try {
            const openApiResponse = await httpGet(openApiUrl, token);
            if (openApiResponse.status === 200) {
                openApi = openApiResponse.body;
            } else if (options.verbose) {
                console.log('  Warning: Could not fetch OpenAPI (continuing without it)');
            }
        } catch {
            if (options.verbose) {
                console.log('  Warning: Could not fetch OpenAPI (continuing without it)');
            }
        }
    }

    // Ensure output directory exists
    const outDir = resolve(options.out);
    if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
    }

    // Write files with stable filenames
    const irFilename = `${options.service}.${actualVersion}.ir.json`;
    const openApiFilename = `${options.service}.${actualVersion}.openapi.json`;

    const irPath = join(outDir, irFilename);
    writeFileSync(irPath, stableStringify(contract.ir) + '\n', 'utf8');
    console.log(`✓ Wrote ${irPath}`);

    if (openApi) {
        const openApiPath = join(outDir, openApiFilename);
        writeFileSync(openApiPath, stableStringify(openApi) + '\n', 'utf8');
        console.log(`✓ Wrote ${openApiPath}`);
    }

    // Print summary
    console.log('');
    console.log(`Pulled ${options.service}@${actualVersion}`);
    if (contract.metadata?.irHash) {
        console.log(`  Hash: ${contract.metadata.irHash}`);
    }

    process.exit(0);
}
