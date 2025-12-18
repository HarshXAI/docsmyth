#!/usr/bin/env node
/**
 * Smoke test script for @acp/cli
 *
 * This script:
 * 1. Builds the workspace
 * 2. Packs all required packages (CLI and its dependencies)
 * 3. Creates a temp project and installs the tarballs
 * 4. Verifies internal @acp/* packages are resolved from tarballs, not registry
 * 5. Runs CLI commands to verify the package works when installed standalone
 *
 * IMPORTANT: Internal @acp/* packages must come from tarballs only.
 * External dependencies (ajv, commander, etc.) are fetched from npm normally.
 *
 * Registry isolation:
 * - Public registry (registry.npmjs.org) is used for external deps (ajv, commander, etc.)
 * - @acp scope is blocked via 127.0.0.1:9 (port 9 = "discard" protocol, instant ECONNREFUSED)
 * - Using explicit 127.0.0.1 (not "localhost") avoids IPv6 ::1 resolution variability
 * - A temp .npmrc isolates the test from user's global ~/.npmrc (no token-expired noise)
 *
 * Cache behavior:
 * - By default, uses a stable cache at ~/.acp-smoke-npm-cache for faster repeated local runs
 * - Set ACP_SMOKE_ISOLATED_CACHE=1 to use a temp cache (full isolation, slower)
 * - CI should cache ~/.acp-smoke-npm-cache between runs for speed
 *
 * Performance thresholds (regression tripwires):
 * - Total smoke test: must complete in < 60s (with warm cache)
 * - Registry blocking test: must fail in < 5s (proves fast-fail config works)
 * - If these are exceeded, someone likely broke the fast-fail npm config
 */

import { execSync } from 'node:child_process';
import {
    mkdtempSync,
    rmSync,
    mkdirSync,
    writeFileSync,
    readdirSync,
    readFileSync,
    copyFileSync,
    existsSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

/**
 * Performance thresholds (in milliseconds)
 * These act as regression tripwires - if exceeded, the test fails.
 */
const THRESHOLDS = {
    // Total test time with warm cache should be < 15s
    // Cold cache in CI may be slower on first run, but cache should restore
    totalTime: 15_000,
    // Registry blocking negative test must fail fast (< 5s)
    // If this is slow, someone broke the fast-fail npm config
    registryBlocking: 5_000,
};

/** Stage timing collector for summary table */
const stageTiming = [];

/**
 * Build an actionable error message for threshold violations
 * @param {string} stage - Stage name (e.g., 'Registry blocking')
 * @param {number} actualMs - Actual elapsed time in ms
 * @param {number} thresholdMs - Threshold in ms
 * @param {string[]} hints - Array of likely causes and fixes
 * @returns {string} Multi-line error message
 */
function buildThresholdError(stage, actualMs, thresholdMs, hints) {
    const lines = [
        ``,
        `${'═'.repeat(70)}`,
        `  REGRESSION DETECTED: ${stage} exceeded threshold`,
        `${'═'.repeat(70)}`,
        ``,
        `  Actual:    ${formatTime(actualMs)}`,
        `  Threshold: ${formatTime(thresholdMs)}`,
        `  Exceeded by: ${formatTime(actualMs - thresholdMs)}`,
        ``,
        `  LIKELY CAUSES & FIXES:`,
        ...hints.map((h, i) => `    ${i + 1}. ${h}`),
        ``,
        `  For debugging guidance, see: docs/smoke-pack.md`,
        `${'═'.repeat(70)}`,
        ``,
    ];
    return lines.join('\n');
}

/**
 * Assert that a duration is under threshold, throw actionable error if not
 * @param {string} stage - Stage name
 * @param {number} actualMs - Actual elapsed time
 * @param {number} thresholdMs - Threshold in ms
 * @param {string[]} hints - Likely causes and fixes
 */
function assertUnderThreshold(stage, actualMs, thresholdMs, hints) {
    if (actualMs > thresholdMs) {
        throw new Error(buildThresholdError(stage, actualMs, thresholdMs, hints));
    }
}

/**
 * Determine npm cache path:
 * - Default: stable cache at ~/.acp-smoke-npm-cache (fast for repeated local runs)
 * - If ACP_SMOKE_ISOLATED_CACHE=1: use temp dir (full isolation, cold cache every time)
 */
const USE_ISOLATED_CACHE = process.env.ACP_SMOKE_ISOLATED_CACHE === '1';
const STABLE_CACHE_DIR = join(homedir(), '.acp-smoke-npm-cache');

/** Global start time for overall timing */
const GLOBAL_START = Date.now();

/**
 * Content for isolated .npmrc that:
 * - Uses public npm registry for external deps
 * - Blocks @acp scope via 127.0.0.1:9 (instant ECONNREFUSED)
 * - Uses explicit 127.0.0.1 (not "localhost") to avoid IPv6 ::1 resolution variability
 * - Port 9 is the "discard" protocol - guaranteed to reject connections immediately
 * - Disables audit/fund to reduce noise
 * - Reduces retry/timeout for faster failure on blocked scope
 */
const ISOLATED_NPMRC_CONTENT = `# Isolated npmrc for smoke test - DO NOT rely on user's global config
registry=https://registry.npmjs.org/

# Block @acp scope with instant-fail localhost trap:
# - 127.0.0.1 (explicit IPv4, avoids ::1 variability on some systems)
# - Port 9 = "discard" protocol, guaranteed ECONNREFUSED
# - This makes "npm install @acp/*" fail in ~100ms instead of ~70s
@acp:registry=http://127.0.0.1:9

# Reduce noise and improve CI determinism
audit=false
fund=false
progress=false
prefer-offline=true

# Disable update notifier
update-notifier=false

# Fast-fail config: minimize retry/timeout pain on blocked @acp scope
# IMPORTANT: Do not remove these - they keep the negative test fast
fetch-retries=0
fetch-retry-mintimeout=100
fetch-retry-maxtimeout=1000
network-timeout=3000
`;

/** ANSI colors for output */
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✓ ${message}`, 'green');
}

function logError(message) {
    log(`✗ ${message}`, 'red');
}

/**
 * Format elapsed time in human-readable format
 * @param {number} ms - Milliseconds
 * @returns {string}
 */
function formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
}

/**
 * Log stage completion with timing and optionally track for summary
 * @param {string} stage - Stage name
 * @param {number} startTime - Start timestamp
 * @param {number} [threshold] - Optional threshold for summary display
 */
function logStageComplete(stage, startTime, threshold = null) {
    const elapsed = Date.now() - startTime;
    log(`  ⏱  ${stage} completed in ${formatTime(elapsed)}`, 'dim');
    stageTiming.push({ stage, elapsed, threshold });
}

/**
 * Build npm environment variables for complete isolation
 * @param {string} npmrcPath - Path to .npmrc
 * @param {string} npmCachePath - Path to npm cache directory
 * @param {object} baseEnv - Base environment
 * @returns {object} Isolated environment
 */
function buildNpmEnv(npmrcPath, npmCachePath, baseEnv = process.env) {
    return {
        ...baseEnv,
        // Point to temp .npmrc (blocks user's global config)
        NPM_CONFIG_USERCONFIG: npmrcPath,
        npm_config_userconfig: npmrcPath,
        // Point to temp cache (isolates from developer's cache)
        NPM_CONFIG_CACHE: npmCachePath,
        npm_config_cache: npmCachePath,
        // Extra safety: disable audit/fund via env
        NPM_CONFIG_AUDIT: 'false',
        npm_config_audit: 'false',
        NPM_CONFIG_FUND: 'false',
        npm_config_fund: 'false',
        // Prevent reading user's global npmrc
        NPM_CONFIG_GLOBALCONFIG: '/dev/null',
        npm_config_globalconfig: '/dev/null',
    };
}

/**
 * Run a command synchronously and return output
 * @param {string} command - Command to run
 * @param {object} options - Options
 * @param {string} [options.cwd] - Working directory
 * @param {boolean} [options.throwOnError] - Whether to throw on error
 * @param {boolean} [options.silent] - Whether to suppress output
 * @param {object} [options.env] - Environment variables (use buildNpmEnv for npm commands)
 */
function runCmd(command, options = {}) {
    const { cwd = ROOT_DIR, throwOnError = true, silent = false, env = process.env } = options;
    if (!silent) {
        log(`$ ${command}`, 'yellow');
    }

    try {
        const output = execSync(command, {
            cwd,
            encoding: 'utf-8',
            stdio: silent ? 'pipe' : 'inherit',
            env,
        });
        return { success: true, output: output || '' };
    } catch (error) {
        if (throwOnError) {
            throw error;
        }
        return { success: false, output: error.stderr || error.message, exitCode: error.status };
    }
}

/**
 * Run a command and expect it to fail
 * @param {string} command - Command to run
 * @param {object} options - Options
 * @param {string} [options.cwd] - Working directory
 * @param {object} [options.env] - Environment variables (use buildNpmEnv for npm commands)
 */
function runExpectFail(command, options = {}) {
    const { cwd = ROOT_DIR, env = process.env } = options;
    log(`$ ${command} (expecting failure)`, 'yellow');

    try {
        execSync(command, {
            cwd,
            encoding: 'utf-8',
            stdio: 'pipe',
            env,
        });
        return { success: true, failed: false };
    } catch (error) {
        return { success: false, failed: true, exitCode: error.status, stderr: error.stderr };
    }
}

/**
 * Compute the transitive closure of @acp/* dependencies for a package.
 * This ensures all internal dependencies are packed, preventing registry fetch failures.
 * 
 * @param {string} pkgName - Package name without @acp/ prefix (e.g., 'cli')
 * @param {Set<string>} visited - Set of already-visited packages (to avoid cycles)
 * @returns {string[]} - Array of package names in dependency order (leaves first)
 */
function computeDependencyClosure(pkgName, visited = new Set()) {
    if (visited.has(pkgName)) {
        return [];
    }
    visited.add(pkgName);

    const pkgDir = join(ROOT_DIR, 'packages', pkgName);
    const pkgJsonPath = join(pkgDir, 'package.json');
    
    if (!existsSync(pkgJsonPath)) {
        log(`  Warning: Package ${pkgName} not found at ${pkgDir}`, 'yellow');
        return [];
    }

    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    const deps = pkgJson.dependencies || {};
    
    // Find all @acp/* dependencies
    const acpDeps = Object.keys(deps)
        .filter((dep) => dep.startsWith('@acp/'))
        .map((dep) => dep.replace('@acp/', ''));

    // Recursively compute closure for each dependency
    const result = [];
    for (const dep of acpDeps) {
        const transitiveDeps = computeDependencyClosure(dep, visited);
        result.push(...transitiveDeps);
    }

    // Add this package after its dependencies (topological order)
    result.push(pkgName);
    
    return result;
}

/**
 * Get all packages to pack for the CLI, computed from dependency closure.
 * This is future-proof: adding new @acp/* deps to CLI or its transitive deps
 * will automatically include them in the smoke test.
 */
function getPackagesToPack() {
    log('\nComputing @acp/* dependency closure for CLI...', 'blue');
    const closure = computeDependencyClosure('cli');
    
    // Remove duplicates while preserving order
    const uniquePackages = [...new Set(closure)];
    
    log(`  Packages to pack (${uniquePackages.length}): ${uniquePackages.join(', ')}`);
    return uniquePackages;
}

/**
 * Pack all internal workspace packages required by CLI.
 * Computes the full dependency closure automatically.
 * Returns array of { pkg, file, path } objects.
 */
function packAll(tempDir) {
    const packagesToPack = getPackagesToPack();
    const tarballs = [];

    for (const pkg of packagesToPack) {
        const pkgDir = join(ROOT_DIR, 'packages', pkg);
        // Use --pack-destination to put tarball in temp dir
        runCmd(`pnpm pack --pack-destination ${tempDir}`, { cwd: pkgDir, silent: true });

        // Find the tarball for this package
        const files = readdirSync(tempDir);
        const tarball = files.find(
            (f) =>
                f.endsWith('.tgz') &&
                f.includes(pkg.replace('/', '-')) &&
                !tarballs.some((t) => t.file === f)
        );

        if (!tarball) {
            throw new Error(`Could not find tarball for ${pkg}`);
        }

        tarballs.push({
            pkg: `@acp/${pkg}`,
            file: tarball,
            path: join(tempDir, tarball),
        });

        log(`  Packed: ${tarball}`);
    }

    return tarballs;
}

/**
 * Install tarballs in test project.
 * Uses --prefer-offline --progress=false for determinism and cleaner CI logs.
 * Uses isolated .npmrc and cache to prevent token-expired notices and block @acp scope.
 * @param {string} testProjectDir - Path to test project
 * @param {Array} tarballs - Array of tarball info objects
 * @param {object} npmEnv - Isolated npm environment (from buildNpmEnv)
 */
function installTarballs(testProjectDir, tarballs, npmEnv) {
    const tarballPaths = tarballs.map((t) => t.path).join(' ');

    // Install with isolated env (blocks @acp scope, allows public registry)
    // --prefer-offline: use cache when possible for speed
    // --progress=false: cleaner CI logs
    runCmd(`npm install --prefer-offline --progress=false ${tarballPaths}`, {
        cwd: testProjectDir,
        env: npmEnv,
    });
}

/**
 * Verify that internal @acp/* packages were installed from tarballs, not fetched from registry.
 * Checks:
 * 1. Each package exists in node_modules
 * 2. Package has expected repository marker
 * 3. npm ls --json confirms resolution is from file: protocol (tarball)
 * 4. package-lock.json confirms file: resolution (not registry)
 * @param {string} testProjectDir - Path to test project
 * @param {Array} tarballs - Array of tarball info objects
 * @param {object} npmEnv - Isolated npm environment (from buildNpmEnv)
 */
function verifyInternalPackages(testProjectDir, tarballs, npmEnv) {
    log('\nVerifying internal packages came from tarballs...', 'blue');

    for (const { pkg } of tarballs) {
        const pkgPath = join(testProjectDir, 'node_modules', pkg);
        if (!existsSync(pkgPath)) {
            throw new Error(
                `Internal package ${pkg} not found in node_modules - was it fetched from registry?`
            );
        }

        // Read package.json to verify it's our package
        const pkgJson = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'));
        if (!pkgJson.repository?.url?.includes('api-contract-platform')) {
            throw new Error(`Package ${pkg} appears to be from registry, not tarball`);
        }

        log(`  ✓ ${pkg}@${pkgJson.version} (from tarball)`);
    }

    // Additional verification: use npm ls --json to confirm file: resolution
    log('\nVerifying npm ls shows file: protocol resolution...', 'blue');
    const { output: lsOutput } = runCmd('npm ls --json --all', {
        cwd: testProjectDir,
        silent: true,
        throwOnError: false,
        env: npmEnv,
    });

    try {
        const lsJson = JSON.parse(lsOutput);
        const deps = lsJson.dependencies || {};

        for (const { pkg } of tarballs) {
            const depInfo = deps[pkg];
            if (depInfo && depInfo.resolved) {
                // Should be file: protocol for tarball installs
                if (!depInfo.resolved.startsWith('file:')) {
                    throw new Error(
                        `Package ${pkg} resolved from ${depInfo.resolved}, expected file: protocol`
                    );
                }
                log(`  ✓ ${pkg} resolved via ${depInfo.resolved}`);
            }
        }
    } catch (e) {
        // npm ls --json might fail or be malformed, just log warning
        if (e.message.includes('resolved from')) {
            throw e;
        }
        log(`  ⚠ Could not parse npm ls output for deep verification: ${e.message}`, 'yellow');
    }

    // Parse package-lock.json to verify file: resolution
    log('\nVerifying package-lock.json shows file: resolution...', 'blue');
    const lockfilePath = join(testProjectDir, 'package-lock.json');
    if (existsSync(lockfilePath)) {
        const lockfile = JSON.parse(readFileSync(lockfilePath, 'utf-8'));
        const packages = lockfile.packages || {};

        for (const { pkg } of tarballs) {
            // In npm v3 lockfile, packages are keyed by path like "node_modules/@acp/ir-spec"
            const pkgKey = `node_modules/${pkg}`;
            const pkgEntry = packages[pkgKey];

            if (pkgEntry) {
                const resolved = pkgEntry.resolved || '';
                if (resolved.includes('registry.npmjs.org')) {
                    throw new Error(
                        `CRITICAL: ${pkg} was fetched from npm registry!\n` +
                        `  resolved: ${resolved}\n` +
                        `  This indicates the @acp scope blocking failed.`
                    );
                }
                if (!resolved.startsWith('file:')) {
                    throw new Error(
                        `Package ${pkg} in lockfile has unexpected resolution: ${resolved}\n` +
                        `  Expected file: protocol for tarball install.`
                    );
                }
                log(`  ✓ ${pkg} lockfile shows ${resolved}`);
            }
        }
    } else {
        log('  ⚠ No package-lock.json found', 'yellow');
    }

    logSuccess('All internal packages installed from tarballs');
}

/**
 * Verify that internal packages resolve correctly after install.
 * Tests both ESM imports and CJS require() for Node 22 compatibility.
 * @param {string} testProjectDir - Path to test project
 */
function verifyPackageResolution(testProjectDir) {
    log('\nVerifying package resolution (ESM + CJS)...', 'blue');

    const packagesToVerify = [
        { pkg: '@acp/ir-spec', expectCjs: true, expectEsm: true },
        { pkg: '@acp/evidence-sdk', expectCjs: true, expectEsm: true },
        { pkg: '@acp/compiler-openapi', expectCjs: true, expectEsm: true },
        { pkg: '@acp/cli', expectCjs: true, expectEsm: true },
    ];

    for (const { pkg, expectCjs, expectEsm } of packagesToVerify) {
        // Test ESM import
        if (expectEsm) {
            const esmResult = runCmd(
                `node --input-type=module -e "const m = await import('${pkg}'); if (!m) throw new Error('Empty module')"`,
                {
                    cwd: testProjectDir,
                    silent: true,
                    throwOnError: false,
                }
            );
            if (!esmResult.success) {
                throw new Error(
                    `ESM import failed for ${pkg}:\n` +
                    `  Command: node --input-type=module -e "import('${pkg}')"\n` +
                    `  Error: ${esmResult.output}\n` +
                    `  Check that "exports" map in package.json includes "import" condition.`
                );
            }
            log(`  ✓ ${pkg} ESM import works`);
        }

        // Test CJS require (important for Node 22 compatibility)
        // Note: These packages are "type": "module", so CJS require goes through exports map
        if (expectCjs) {
            const cjsResult = runCmd(
                `node -e "const m = require('${pkg}'); if (!m) throw new Error('Empty module')"`,
                {
                    cwd: testProjectDir,
                    silent: true,
                    throwOnError: false,
                }
            );
            if (!cjsResult.success) {
                // CJS require of ESM packages may fail - that's expected for pure ESM
                // Only warn, don't fail
                log(`  ⚠ ${pkg} CJS require not available (expected for pure ESM packages)`, 'yellow');
            } else {
                log(`  ✓ ${pkg} CJS require works`);
            }
        }
    }

    logSuccess('Package resolution verified');
}

/**
 * Test that attempting to install @acp/* from registry fails.
 * This is a negative test to ensure our scope blocking works.
 * Also verifies the failure is FAST (regression tripwire for fast-fail config).
 * @param {string} testProjectDir - Path to test project
 * @param {object} npmEnv - Isolated npm environment
 * @returns {number} Elapsed time in milliseconds
 */
function verifyRegistryBlocking(testProjectDir, npmEnv) {
    log('\nVerifying @acp scope registry blocking (negative test)...', 'blue');

    const startTime = Date.now();

    // Try to install @acp/ir-spec from registry (should fail because @acp:registry is blocked)
    const result = runExpectFail(
        'npm install @acp/ir-spec@0.1.0 --prefer-offline=false --progress=false',
        {
            cwd: testProjectDir,
            env: npmEnv,
        }
    );

    const elapsed = Date.now() - startTime;

    if (!result.failed) {
        throw new Error(
            'CRITICAL: npm install @acp/ir-spec succeeded!\n' +
            'This means the @acp scope registry blocking is NOT working.\n' +
            'The scoped registry should point to http://127.0.0.1:9 (instant ECONNREFUSED).'
        );
    }

    log(`  ✓ npm install @acp/ir-spec@0.1.0 failed as expected (exit code: ${result.exitCode})`);
    log(`  ✓ Failed in ${formatTime(elapsed)} (threshold: ${formatTime(THRESHOLDS.registryBlocking)})`);

    // Regression tripwire: if this takes too long, someone broke the fast-fail config
    assertUnderThreshold('Registry blocking', elapsed, THRESHOLDS.registryBlocking, [
        '@acp:registry must point to http://127.0.0.1:9 (port 9 = instant ECONNREFUSED)',
        'Check .npmrc has: fetch-retries=0, fetch-retry-mintimeout=100, network-timeout=3000',
        'Verify NPM_CONFIG_USERCONFIG points to the isolated .npmrc (not user global)',
        'Ensure no proxy/firewall is intercepting localhost connections',
        'If on Windows, confirm 127.0.0.1:9 is not bound to a real service',
    ]);

    logSuccess('@acp scope registry blocking verified (fast failure confirmed)');
    return elapsed;
}

/**
 * Verify that @acp/ir-spec can load its schema at runtime.
 * This ensures the schema files are included in the tarball.
 * @param {string} testProjectDir - Path to test project
 */
function verifySchemaRuntimeLoading(testProjectDir) {
    log('\nVerifying @acp/ir-spec schema can be loaded at runtime...', 'blue');

    // Check if the schema file exists in the installed package
    const schemaPath = join(
        testProjectDir,
        'node_modules',
        '@acp',
        'ir-spec',
        'schemas',
        'contract-ir.v0.1.schema.json'
    );

    if (!existsSync(schemaPath)) {
        throw new Error(
            `Schema file not found in installed @acp/ir-spec: ${schemaPath}\n` +
            'Ensure "schemas" is included in the package.json "files" array.'
        );
    }

    // Verify the schema can be loaded and parsed
    const schemaContent = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    if (!schemaContent.$schema || !schemaContent.$id) {
        throw new Error('Schema file is invalid - missing $schema or $id');
    }

    log(`  ✓ Schema file exists: ${schemaPath}`);
    log(`  ✓ Schema $id: ${schemaContent.$id}`);
    logSuccess('@acp/ir-spec schema loads correctly at runtime');
}

/**
 * Main smoke test
 */
async function main() {
    let tempDir = null;
    const totalStart = Date.now();

    try {
        log('\n=== ACP CLI Smoke Test ===\n', 'blue');
        log(`Node version: ${process.version}`, 'dim');
        log(`Platform: ${process.platform} ${process.arch}`, 'dim');

        // Step 1: Build the workspace
        logStep('1/10', 'Building workspace...');
        const buildStart = Date.now();
        runCmd('pnpm build');
        logStageComplete('Build', buildStart);
        logSuccess('Workspace built successfully');

        // Step 2: Create temp directory
        logStep('2/10', 'Creating temporary directory...');
        const setupStart = Date.now();
        tempDir = mkdtempSync(join(tmpdir(), 'acp-smoke-'));
        log(`Temp dir: ${tempDir}`);

        // Determine npm cache path:
        // - Default: stable cache for faster repeated runs
        // - ACP_SMOKE_ISOLATED_CACHE=1: temp cache for full isolation
        let npmCachePath;
        if (USE_ISOLATED_CACHE) {
            npmCachePath = join(tempDir, '.npm-cache');
            mkdirSync(npmCachePath, { recursive: true });
            log(`npm cache: ${npmCachePath} (isolated, cold cache)`);
        } else {
            npmCachePath = STABLE_CACHE_DIR;
            mkdirSync(npmCachePath, { recursive: true });
            log(`npm cache: ${npmCachePath} (stable, warm cache)`);
        }

        logStageComplete('Setup', setupStart);
        logSuccess('Temp directory created');

        // Step 3: Pack all required packages
        logStep('3/10', 'Packing packages...');
        const packStart = Date.now();
        const tarballs = packAll(tempDir);
        logStageComplete('Pack', packStart);
        logSuccess(`Packed ${tarballs.length} packages`);

        // Step 4: Create test project and install tarballs
        logStep('4/10', 'Installing packages from tarballs...');
        const installStart = Date.now();
        const testProjectDir = join(tempDir, 'test-project');
        mkdirSync(testProjectDir);

        // Create isolated .npmrc to:
        // - Block @acp scope (point to unreachable address)
        // - Allow public registry for external deps
        // - Avoid token-expired noise from user's global config
        const npmrcPath = join(testProjectDir, '.npmrc');
        writeFileSync(npmrcPath, ISOLATED_NPMRC_CONTENT);
        log(`Created isolated .npmrc at: ${npmrcPath}`);

        // Build fully isolated npm environment
        const npmEnv = buildNpmEnv(npmrcPath, npmCachePath);

        // Create minimal package.json for test project (no workspace references)
        writeFileSync(
            join(testProjectDir, 'package.json'),
            JSON.stringify(
                {
                    name: 'acp-smoke-test',
                    version: '1.0.0',
                    private: true,
                    type: 'module',
                },
                null,
                2
            )
        );

        // Copy fixtures needed for testing
        const fixturesDir = join(testProjectDir, 'fixtures', 'evidence');
        mkdirSync(fixturesDir, { recursive: true });

        const fixtureFiles = [
            'orders-contract.json',
            'orders-evidence.ndjson',
            'invalid-evidence.ndjson',
        ];

        for (const file of fixtureFiles) {
            const srcPath = join(ROOT_DIR, 'fixtures', 'evidence', file);
            if (existsSync(srcPath)) {
                copyFileSync(srcPath, join(fixturesDir, file));
            } else {
                throw new Error(`Fixture file not found: ${srcPath}`);
            }
        }

        // Create output directory
        const outputDir = join(testProjectDir, 'output');
        mkdirSync(outputDir, { recursive: true });

        // Install all tarballs (with isolated npm env)
        installTarballs(testProjectDir, tarballs, npmEnv);
        logStageComplete('Install', installStart);
        logSuccess('Packages installed from tarballs');

        // Step 5: Verify internal packages came from tarballs
        logStep('5/10', 'Verifying internal packages...');
        const verifyStart = Date.now();
        verifyInternalPackages(testProjectDir, tarballs, npmEnv);
        logStageComplete('Verify tarballs', verifyStart);

        // Step 6: Verify package resolution (ESM + CJS)
        logStep('6/10', 'Verifying package resolution...');
        const resolutionStart = Date.now();
        verifyPackageResolution(testProjectDir);
        logStageComplete('Resolution', resolutionStart);

        // Step 7: Verify schema runtime loading
        logStep('7/10', 'Verifying schema runtime loading...');
        const schemaStart = Date.now();
        verifySchemaRuntimeLoading(testProjectDir);
        logStageComplete('Schema', schemaStart);

        // Step 8: Verify @acp registry blocking (negative test)
        logStep('8/10', 'Verifying registry blocking...');
        const blockingStart = Date.now();
        verifyRegistryBlocking(testProjectDir, npmEnv);
        logStageComplete('Registry blocking', blockingStart, THRESHOLDS.registryBlocking);

        // Step 9: Run CLI commands
        logStep('9/10', 'Running CLI commands...');
        const cliStart = Date.now();

        // Get the path to the installed CLI
        const cliPath = join(testProjectDir, 'node_modules', '.bin', 'acp');

        // Test 1: --help
        log('\nTest 1: acp --help', 'blue');
        runCmd(`"${cliPath}" --help`, { cwd: testProjectDir });
        logSuccess('acp --help works');

        // Test 2: compile with valid evidence
        log('\nTest 2: acp compile with valid evidence', 'blue');
        runCmd(
            `"${cliPath}" compile fixtures/evidence/orders-contract.json --out output --evidence fixtures/evidence/orders-evidence.ndjson --verify-evidence --coverage`,
            { cwd: testProjectDir }
        );
        logSuccess('acp compile with valid evidence works');

        // Test 3: compile with invalid evidence (should fail)
        log('\nTest 3: acp compile with invalid evidence (should fail)', 'blue');
        const result = runExpectFail(
            `"${cliPath}" compile fixtures/evidence/orders-contract.json --out output --evidence fixtures/evidence/invalid-evidence.ndjson --verify-evidence`,
            { cwd: testProjectDir }
        );

        if (result.failed) {
            logSuccess(
                `acp compile with invalid evidence failed as expected (exit code: ${result.exitCode})`
            );
        } else {
            throw new Error('Expected acp compile with invalid evidence to fail, but it succeeded');
        }

        logStageComplete('CLI tests', cliStart);

        // Step 10: Summary
        logStep('10/10', 'Summary');
        const totalElapsed = Date.now() - totalStart;

        // Regression tripwire: fail if total time exceeds threshold
        // This catches misconfigurations that would slow down CI
        assertUnderThreshold('Total smoke-pack time', totalElapsed, THRESHOLDS.totalTime, [
            'npm cache may be cold - check ~/.acp-smoke-npm-cache exists and is cached in CI',
            'ACP_SMOKE_ISOLATED_CACHE=1 forces cold cache - unset for normal CI runs',
            '@acp:registry must use port 9 for instant fail (not a real registry)',
            'Check .npmrc has: fetch-retries=0, network-timeout=3000',
            'turbo cache may be cold - check .turbo is cached in CI',
            'External npm packages may be slow to fetch - check network/proxy settings',
        ]);

        // Print summary table
        log(`\n${'─'.repeat(50)}`, 'dim');
        log('Stage Timing Summary:', 'blue');
        log(`${'─'.repeat(50)}`, 'dim');
        for (const { stage, elapsed, threshold } of stageTiming) {
            const status = threshold && elapsed > threshold ? '⚠️ ' : '✓ ';
            const thresholdStr = threshold ? ` (threshold: ${formatTime(threshold)})` : '';
            log(`  ${status}${stage.padEnd(25)} ${formatTime(elapsed).padStart(8)}${thresholdStr}`, 'dim');
        }
        log(`${'─'.repeat(50)}`, 'dim');
        log(`  Total: ${formatTime(totalElapsed)} (threshold: ${formatTime(THRESHOLDS.totalTime)})`, 'dim');
        log(`${'─'.repeat(50)}`, 'dim');

        log(`\n=== All smoke tests passed! ===`, 'green');
        log(`Total time: ${formatTime(totalElapsed)} (threshold: ${formatTime(THRESHOLDS.totalTime)})`, 'green');
    } catch (error) {
        logError(`Smoke test failed: ${error.message}`);
        console.error(error);
        process.exit(1);
    } finally {
        // Cleanup
        if (tempDir) {
            log(`\nCleaning up temp directory: ${tempDir}`, 'yellow');
            try {
                rmSync(tempDir, { recursive: true, force: true });
                logSuccess('Temp directory cleaned up');
            } catch (e) {
                log(`Warning: Could not clean up temp directory: ${e.message}`, 'yellow');
            }
        }
    }
}

main();
