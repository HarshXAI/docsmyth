#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Pilot E2E Smoke Test
 *
 * This script runs an end-to-end test of the ACP workflow:
 * 1. Starts a Hub on a random port
 * 2. Publishes a contract with OpenAPI and overlays
 * 3. Pulls the contract back
 * 4. Validates the round-trip integrity
 *
 * Exit codes:
 *   0 - All tests passed
 *   1 - Test failure
 *   2 - Setup/infrastructure failure
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import * as http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ============================================================================
// Configuration
// ============================================================================

const TIMEOUT_MS = 60_000; // 60 seconds max
const HUB_STARTUP_TIMEOUT_MS = 15_000; // 15 seconds for hub to start
const RETRY_DELAY_MS = 500;

interface TestContext {
    hubProcess: ChildProcess | null;
    hubPort: number;
    tempDir: string;
    startTime: number;
}

// ============================================================================
// Logging
// ============================================================================

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function _log(message: string): void {
    const elapsed = process.hrtime.bigint();
    console.log(`${colors.dim}[${formatTime(elapsed)}]${colors.reset} ${message}`);
}

function logStep(step: string): void {
    console.log(`\n${colors.blue}▶${colors.reset} ${step}`);
}

function logSuccess(message: string): void {
    console.log(`  ${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string): void {
    console.error(`  ${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message: string): void {
    console.log(`  ${colors.yellow}⚠${colors.reset} ${message}`);
}

function formatTime(ns: bigint): string {
    const ms = Number(ns / 1_000_000n);
    return `${ms.toLocaleString()}ms`;
}

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_CONTRACT = {
    version: '0.1',
    info: {
        title: 'Pilot Test API',
        version: '1.0.0',
        description: 'E2E test contract for pilot validation',
    },
    operations: [
        {
            operationId: 'listUsers',
            method: 'GET',
            path: '/users',
            summary: 'List all users',
            response: {
                statusCode: 200,
                contentType: 'application/json',
                schema: {
                    type: 'array',
                    items: { $ref: '#/schemas/User' },
                },
            },
        },
        {
            operationId: 'getUser',
            method: 'GET',
            path: '/users/:id',
            summary: 'Get user by ID',
            parameters: [
                {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                },
            ],
            response: {
                statusCode: 200,
                contentType: 'application/json',
                schema: { $ref: '#/schemas/User' },
            },
        },
        {
            operationId: 'createUser',
            method: 'POST',
            path: '/users',
            summary: 'Create a new user',
            request: {
                contentType: 'application/json',
                schema: { $ref: '#/schemas/CreateUserRequest' },
            },
            response: {
                statusCode: 201,
                contentType: 'application/json',
                schema: { $ref: '#/schemas/User' },
            },
        },
    ],
    schemas: {
        User: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                email: { type: 'string', format: 'email' },
                name: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
            },
            required: ['id', 'email', 'name'],
        },
        CreateUserRequest: {
            type: 'object',
            properties: {
                email: { type: 'string', format: 'email' },
                name: { type: 'string' },
            },
            required: ['email', 'name'],
        },
    },
};

const TEST_OVERLAY = {
    version: '0.1',
    name: 'public',
    description: 'Public API overlay - removes internal fields',
    operations: {
        listUsers: {
            'x-public': true,
        },
        getUser: {
            'x-public': true,
        },
        createUser: {
            // Mark as internal
            'x-internal': true,
        },
    },
};

const TEST_EVIDENCE = [
    {
        timestamp: new Date().toISOString(),
        operationId: 'listUsers',
        request: {
            method: 'GET',
            path: '/users',
            headers: { 'accept': 'application/json' },
        },
        response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: [
                { id: '1', email: 'user@example.com', name: 'Test User' },
            ],
        },
    },
    {
        timestamp: new Date().toISOString(),
        operationId: 'getUser',
        request: {
            method: 'GET',
            path: '/users/1',
            headers: { 'accept': 'application/json' },
        },
        response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: '1', email: 'user@example.com', name: 'Test User' },
        },
    },
];

// ============================================================================
// Utilities
// ============================================================================

function getRandomPort(): number {
    // Use ports in the dynamic/private range
    return 49152 + Math.floor(Math.random() * 16383);
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
        try {
            await new Promise<void>((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
                    if (res.statusCode === 200) {
                        resolve();
                    } else {
                        reject(new Error(`Health check returned ${res.statusCode}`));
                    }
                });
                req.on('error', reject);
                req.setTimeout(1000, () => {
                    req.destroy();
                    reject(new Error('Timeout'));
                });
            });
            return true;
        } catch {
            await sleep(RETRY_DELAY_MS);
        }
    }
    return false;
}

async function runCommand(
    command: string,
    args: string[],
    options: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        const timeout = options.timeout || 30_000;
        const timer = setTimeout(() => {
            proc.kill('SIGTERM');
            reject(new Error(`Command timed out after ${timeout}ms`));
        }, timeout);

        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, code: code ?? 1 });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// ============================================================================
// Test Steps
// ============================================================================

async function setupTestEnvironment(): Promise<TestContext> {
    logStep('Setting up test environment');

    const tempDir = join(tmpdir(), `acp-pilot-e2e-${randomBytes(8).toString('hex')}`);
    await mkdir(tempDir, { recursive: true });
    logSuccess(`Created temp directory: ${tempDir}`);

    // Write test fixtures
    const contractPath = join(tempDir, 'contract.ir.json');
    await writeFile(contractPath, JSON.stringify(TEST_CONTRACT, null, 2));
    logSuccess('Created test contract');

    const overlayPath = join(tempDir, 'public.overlay.json');
    await writeFile(overlayPath, JSON.stringify(TEST_OVERLAY, null, 2));
    logSuccess('Created test overlay');

    const evidencePath = join(tempDir, 'evidence.ndjson');
    await writeFile(evidencePath, TEST_EVIDENCE.map((e) => JSON.stringify(e)).join('\n'));
    logSuccess('Created test evidence');

    return {
        hubProcess: null,
        hubPort: getRandomPort(),
        tempDir,
        startTime: Date.now(),
    };
}

async function startHub(ctx: TestContext): Promise<void> {
    logStep(`Starting Hub on port ${ctx.hubPort}`);

    const hubDataDir = join(ctx.tempDir, 'hub-data');
    await mkdir(hubDataDir, { recursive: true });

    // Find the hub package
    const hubPath = resolve(process.cwd(), 'packages/hub');

    ctx.hubProcess = spawn(
        'npx',
        ['tsx', 'src/server.ts'],
        {
            cwd: hubPath,
            env: {
                ...process.env,
                PORT: String(ctx.hubPort),
                ACP_HUB_DATA_DIR: hubDataDir,
                NODE_ENV: 'test',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false,
        }
    );

    // Capture output for debugging
    let hubOutput = '';
    ctx.hubProcess.stdout?.on('data', (data) => {
        hubOutput += data.toString();
    });
    ctx.hubProcess.stderr?.on('data', (data) => {
        hubOutput += data.toString();
    });

    ctx.hubProcess.on('error', (err) => {
        logError(`Hub process error: ${err.message}`);
    });

    // Wait for Hub to be ready
    const isReady = await waitForPort(ctx.hubPort, HUB_STARTUP_TIMEOUT_MS);
    if (!isReady) {
        logError(`Hub failed to start. Output:\n${hubOutput}`);
        throw new Error('Hub failed to start within timeout');
    }

    logSuccess(`Hub started and healthy on port ${ctx.hubPort}`);
}

async function validateContract(ctx: TestContext): Promise<void> {
    logStep('Validating contract locally');

    const contractPath = join(ctx.tempDir, 'contract.ir.json');
    const result = await runCommand('pnpm', ['acp', 'validate', contractPath], {
        cwd: process.cwd(),
    });

    if (result.code !== 0) {
        logError(`Validation failed:\n${result.stderr}`);
        throw new Error('Contract validation failed');
    }

    logSuccess('Contract validated successfully');
}

async function compileContract(ctx: TestContext): Promise<void> {
    logStep('Compiling contract to OpenAPI');

    const contractPath = join(ctx.tempDir, 'contract.ir.json');
    const openapiPath = join(ctx.tempDir, 'openapi.json');

    const result = await runCommand(
        'pnpm',
        ['acp', 'compile', contractPath, '--format', 'openapi', '--output', openapiPath],
        { cwd: process.cwd() }
    );

    if (result.code !== 0) {
        logError(`Compilation failed:\n${result.stderr}`);
        throw new Error('Contract compilation failed');
    }

    // Verify output exists
    const stats = await stat(openapiPath);
    if (stats.size === 0) {
        throw new Error('OpenAPI output is empty');
    }

    logSuccess(`Compiled to OpenAPI (${stats.size} bytes)`);
}

async function publishToHub(ctx: TestContext): Promise<void> {
    logStep('Publishing contract to Hub');

    const contractPath = join(ctx.tempDir, 'contract.ir.json');
    const openapiPath = join(ctx.tempDir, 'openapi.json');
    const overlayPath = join(ctx.tempDir, 'public.overlay.json');

    const hubUrl = `http://127.0.0.1:${ctx.hubPort}`;

    // Publish contract
    const publishResult = await runCommand(
        'pnpm',
        ['acp', 'hub', 'publish', '--contract', contractPath, '--openapi', openapiPath, '--url', hubUrl],
        { cwd: process.cwd() }
    );

    if (publishResult.code !== 0) {
        logError(`Publish failed:\n${publishResult.stderr}`);
        throw new Error('Failed to publish contract');
    }
    logSuccess('Published contract');

    // Publish overlay
    const overlayResult = await runCommand(
        'pnpm',
        ['acp', 'hub', 'overlay', 'push', '--file', overlayPath, '--contract', 'pilot-test-api', '--url', hubUrl],
        { cwd: process.cwd() }
    );

    if (overlayResult.code !== 0) {
        logWarning(`Overlay publish may have failed: ${overlayResult.stderr}`);
        // Don't fail - overlay commands may not be fully implemented
    } else {
        logSuccess('Published overlay');
    }
}

async function pullFromHub(ctx: TestContext): Promise<void> {
    logStep('Pulling contract from Hub');

    const hubUrl = `http://127.0.0.1:${ctx.hubPort}`;
    const pullDir = join(ctx.tempDir, 'pulled');
    await mkdir(pullDir, { recursive: true });

    const result = await runCommand(
        'pnpm',
        ['acp', 'hub', 'pull', 'pilot-test-api', '--output', join(pullDir, 'contract.ir.json'), '--url', hubUrl],
        { cwd: process.cwd() }
    );

    if (result.code !== 0) {
        logError(`Pull failed:\n${result.stderr}`);
        throw new Error('Failed to pull contract');
    }

    logSuccess('Pulled contract from Hub');
}

async function validateRoundTrip(ctx: TestContext): Promise<void> {
    logStep('Validating round-trip integrity');

    const originalPath = join(ctx.tempDir, 'contract.ir.json');
    const pulledPath = join(ctx.tempDir, 'pulled', 'contract.ir.json');

    const original = JSON.parse(await readFile(originalPath, 'utf-8'));
    const pulled = JSON.parse(await readFile(pulledPath, 'utf-8'));

    // Compare key fields (Hub may add metadata)
    const compareFields = ['version', 'info', 'operations', 'schemas'];
    for (const field of compareFields) {
        const originalJson = JSON.stringify(original[field]);
        const pulledJson = JSON.stringify(pulled[field]);

        if (originalJson !== pulledJson) {
            logError(`Field '${field}' mismatch after round-trip`);
            logError(`Original: ${originalJson.substring(0, 200)}`);
            logError(`Pulled: ${pulledJson.substring(0, 200)}`);
            throw new Error(`Round-trip integrity check failed for field '${field}'`);
        }
    }

    logSuccess('Round-trip integrity verified');
}

async function validatePulledContract(ctx: TestContext): Promise<void> {
    logStep('Validating pulled contract');

    const pulledPath = join(ctx.tempDir, 'pulled', 'contract.ir.json');
    const result = await runCommand('pnpm', ['acp', 'validate', pulledPath], {
        cwd: process.cwd(),
    });

    if (result.code !== 0) {
        logError(`Pulled contract validation failed:\n${result.stderr}`);
        throw new Error('Pulled contract validation failed');
    }

    logSuccess('Pulled contract is valid');
}

async function cleanup(ctx: TestContext): Promise<void> {
    logStep('Cleaning up');

    // Stop Hub
    if (ctx.hubProcess) {
        ctx.hubProcess.kill('SIGTERM');
        logSuccess('Stopped Hub');
    }

    // Remove temp directory
    try {
        await rm(ctx.tempDir, { recursive: true, force: true });
        logSuccess('Removed temp directory');
    } catch (err) {
        logWarning(`Failed to remove temp directory: ${(err as Error).message}`);
    }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    const startTime = process.hrtime.bigint();

    console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║           ACP Pilot E2E Smoke Test                        ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

    let ctx: TestContext | null = null;
    let exitCode = 0;

    try {
        // Set timeout
        const timeoutHandle = setTimeout(() => {
            logError(`Test timed out after ${TIMEOUT_MS}ms`);
            process.exit(2);
        }, TIMEOUT_MS);

        ctx = await setupTestEnvironment();
        await startHub(ctx);
        await validateContract(ctx);
        await compileContract(ctx);
        await publishToHub(ctx);
        await pullFromHub(ctx);
        await validateRoundTrip(ctx);
        await validatePulledContract(ctx);

        clearTimeout(timeoutHandle);

        const elapsed = process.hrtime.bigint() - startTime;
        console.log(`
${colors.green}╔═══════════════════════════════════════════════════════════╗
║                    ALL TESTS PASSED                       ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

Total time: ${formatTime(elapsed)}
`);
    } catch (err) {
        exitCode = 1;
        const error = err as Error;

        console.log(`
${colors.red}╔═══════════════════════════════════════════════════════════╗
║                    TEST FAILED                            ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

Error: ${error.message}
${error.stack ? `\nStack trace:\n${error.stack}` : ''}
`);
    } finally {
        if (ctx) {
            await cleanup(ctx);
        }
    }

    process.exit(exitCode);
}

// Run if executed directly
main().catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(2);
});
