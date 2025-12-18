/**
 * Publish command - publishes a Contract IR to the Hub
 *
 * Validates the IR before publishing and optionally compiles OpenAPI.
 * Also supports publishing overlay artifacts.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validate, validateOverlay, type ContractIR, type Overlay } from '@acp/ir-spec';
import { compileOpenApi } from '@acp/compiler-openapi';

export interface PublishOptions {
    hub: string;
    service: string;
    version: string;
    compile?: boolean;
    token?: string;
    verbose?: boolean;
    overlay?: string;
    overlayName?: string;
}

/**
 * Make an HTTP request with proper error handling
 */
async function httpRequest(
    url: string,
    method: string,
    body?: unknown,
    token?: string
): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'acp-cli/0.1.0',
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const responseBody = await response.json().catch(() => null);

    return {
        status: response.status,
        body: responseBody,
    };
}

/**
 * Publish command handler
 */
export async function publishCommand(path: string, options: PublishOptions): Promise<void> {
    const filePath = resolve(path);

    // Check file exists
    if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }

    // Validate required options
    if (!options.hub) {
        console.error('Error: --hub is required');
        process.exit(1);
    }

    if (!options.service) {
        console.error('Error: --service is required');
        process.exit(1);
    }

    if (!options.version) {
        console.error('Error: --version is required');
        process.exit(1);
    }

    // Get token from option or environment
    const token = options.token ?? process.env.ACP_HUB_TOKEN;

    // Read and parse IR file
    let ir: ContractIR;
    try {
        const raw = readFileSync(filePath, 'utf-8');
        ir = JSON.parse(raw) as ContractIR;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to parse JSON: ${message}`);
        process.exit(1);
    }

    // Validate IR
    if (options.verbose) {
        console.log('Validating Contract IR...');
    }

    const validationResult = validate(ir);
    if (!validationResult.valid) {
        console.error('Error: Invalid Contract IR');
        for (const error of validationResult.errors) {
            console.error(`  • ${error.path}: ${error.message}`);
        }
        process.exit(1);
    }

    if (options.verbose) {
        console.log('✓ Contract IR is valid');
    }

    // Compile OpenAPI if requested (default: true)
    let openApi: unknown | undefined;
    if (options.compile !== false) {
        if (options.verbose) {
            console.log('Compiling OpenAPI...');
        }

        try {
            openApi = compileOpenApi(ir);
            if (options.verbose) {
                console.log('✓ OpenAPI compiled successfully');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error: Failed to compile OpenAPI: ${message}`);
            process.exit(1);
        }
    }

    // Prepare request body
    const requestBody = {
        version: options.version,
        ir,
        openApi,
    };

    // Build URL
    const hubUrl = options.hub.endsWith('/') ? options.hub.slice(0, -1) : options.hub;
    const url = `${hubUrl}/v1/services/${encodeURIComponent(options.service)}/contracts`;

    if (options.verbose) {
        console.log(`Publishing to ${url}...`);
    }

    // Send request
    try {
        const response = await httpRequest(url, 'POST', requestBody, token);

        if (response.status === 201) {
            const result = response.body as { metadata?: { irHash?: string; publishedAt?: string } };
            console.log(`✓ Published ${options.service}@${options.version}`);
            if (result?.metadata?.irHash) {
                console.log(`  Hash: ${result.metadata.irHash}`);
            }
            if (result?.metadata?.publishedAt) {
                console.log(`  Published at: ${result.metadata.publishedAt}`);
            }
            process.exit(0);
        } else if (response.status === 409) {
            const error = response.body as { existingHash?: string };
            console.error(`Error: Contract ${options.service}@${options.version} already exists`);
            if (error?.existingHash) {
                console.error(`  Existing hash: ${error.existingHash}`);
            }
            console.error('  Contracts are immutable and cannot be overwritten.');
            process.exit(1);
        } else if (response.status === 401) {
            console.error('Error: Unauthorized. Provide a valid token via --token or ACP_HUB_TOKEN.');
            process.exit(1);
        } else if (response.status === 400) {
            const error = response.body as { message?: string; validationErrors?: unknown[] };
            console.error(`Error: Bad request - ${error?.message ?? 'Unknown error'}`);
            if (error?.validationErrors) {
                for (const ve of error.validationErrors) {
                    console.error(`  • ${JSON.stringify(ve)}`);
                }
            }
            process.exit(1);
        } else {
            const error = response.body as { message?: string };
            console.error(`Error: Server returned ${response.status} - ${error?.message ?? 'Unknown error'}`);
            process.exit(1);
        }

        // Publish overlay if specified
        if (options.overlay) {
            await publishOverlay(options, token);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to connect to hub: ${message}`);
        process.exit(1);
    }
}

/**
 * Publish an overlay as an artifact
 */
async function publishOverlay(options: PublishOptions, token?: string): Promise<void> {
    if (!options.overlay) return;

    const overlayPath = resolve(options.overlay);

    if (!existsSync(overlayPath)) {
        console.error(`Error: Overlay file not found: ${overlayPath}`);
        process.exit(1);
    }

    // Read and parse overlay
    let overlay: Overlay;
    try {
        const raw = readFileSync(overlayPath, 'utf-8');
        overlay = JSON.parse(raw) as Overlay;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to parse overlay JSON: ${message}`);
        process.exit(1);
    }

    // Validate overlay
    const validationResult = validateOverlay(overlay);
    if (!validationResult.valid) {
        console.error('Error: Invalid Overlay');
        for (const error of validationResult.errors) {
            console.error(`  • ${error.path}: ${error.message}`);
        }
        process.exit(1);
    }

    // Determine artifact name
    const artifactName = options.overlayName ?? `overlay.${overlay.name}.json`;

    // Build URL
    const hubUrl = options.hub.endsWith('/') ? options.hub.slice(0, -1) : options.hub;
    const url = `${hubUrl}/v1/services/${encodeURIComponent(options.service)}/contracts/${encodeURIComponent(options.version)}/artifacts/${encodeURIComponent(artifactName)}`;

    if (options.verbose) {
        console.log(`Publishing overlay as ${artifactName}...`);
    }

    try {
        const response = await httpRequest(url, 'POST', overlay, token);

        if (response.status === 201) {
            console.log(`✓ Published overlay "${overlay.name}" as ${artifactName}`);
        } else if (response.status === 404) {
            console.error(`Error: Contract ${options.service}@${options.version} not found`);
            console.error('  Publish the contract first before adding overlays.');
            process.exit(1);
        } else {
            const error = response.body as { message?: string };
            console.error(`Error: Failed to publish overlay: ${error?.message ?? 'Unknown error'}`);
            process.exit(1);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to connect to hub: ${message}`);
        process.exit(1);
    }
}
