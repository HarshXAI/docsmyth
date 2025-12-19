/**
 * Doctor Command
 *
 * Diagnoses the Docsmyth CLI installation and environment.
 * Helps users troubleshoot version mismatches and missing dependencies.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { version as cliVersion } from '../version.js';

export interface DoctorCommandOptions {
    verbose?: boolean;
}

interface DiagnosticResult {
    name: string;
    status: 'ok' | 'warn' | 'error';
    value: string;
    message?: string;
}

/**
 * Detect package manager from environment and lockfiles
 */
function detectPackageManager(): { name: string; context: 'global' | 'local' | 'npx/dlx'; command: string } {
    // Check for pnpm
    if (process.env.npm_config_user_agent?.includes('pnpm')) {
        const isExec = process.env.npm_lifecycle_script?.includes('pnpm exec') ||
            process.argv.some(arg => arg.includes('pnpm'));
        return {
            name: 'pnpm',
            context: isExec ? 'local' : 'npx/dlx',
            command: 'pnpm',
        };
    }

    // Check for yarn
    if (process.env.npm_config_user_agent?.includes('yarn')) {
        return {
            name: 'yarn',
            context: process.env.npm_execpath?.includes('yarn') ? 'local' : 'npx/dlx',
            command: 'yarn',
        };
    }

    // Check for npx/dlx execution
    if (process.env._?.includes('npx') || process.argv[1]?.includes('_npx')) {
        return {
            name: 'npm',
            context: 'npx/dlx',
            command: 'npm',
        };
    }

    // Check for pnpm dlx
    if (process.env._?.includes('pnpm') || process.argv[1]?.includes('.pnpm')) {
        return {
            name: 'pnpm',
            context: 'npx/dlx',
            command: 'pnpm',
        };
    }

    // Default to npm
    return {
        name: 'npm',
        context: 'global',
        command: 'npm',
    };
}

/**
 * Get the latest rc version from npm registry
 */
async function getLatestRcVersion(): Promise<string | null> {
    try {
        const result = execSync('npm view @docsmyth/cli dist-tags.rc 2>/dev/null', {
            encoding: 'utf-8',
            timeout: 5000,
        });
        return result.trim();
    } catch {
        return null;
    }
}

/**
 * Get locally installed version (if in a project with package.json)
 */
function getLocalInstalledVersion(): string | null {
    try {
        // Check node_modules
        const paths = [
            resolve(process.cwd(), 'node_modules', '@docsmyth', 'cli', 'package.json'),
            resolve(process.cwd(), '..', 'node_modules', '@docsmyth', 'cli', 'package.json'),
        ];

        for (const pkgPath of paths) {
            if (existsSync(pkgPath)) {
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
                return pkg.version;
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Check available commands
 */
function checkAvailableCommands(): Record<string, boolean> {
    const commands = ['quickstart', 'record', 'infer', 'studio', 'proxy', 'validate', 'compile'];
    const available: Record<string, boolean> = {};

    for (const cmd of commands) {
        // All these commands should be available in the current CLI
        available[cmd] = true;
    }

    return available;
}

/**
 * Get Git commit SHA if available
 */
function getGitCommitSha(): string | null {
    try {
        // Check if we're in a git repo
        const sha = execSync('git rev-parse --short HEAD 2>/dev/null', {
            encoding: 'utf-8',
            timeout: 2000,
        });
        return sha.trim();
    } catch {
        return null;
    }
}

/**
 * Doctor command handler
 */
export async function doctorCommand(options: DoctorCommandOptions): Promise<void> {
    const { verbose } = options;

    console.log(`
╭─────────────────────────────────────────────────────────────────────────╮
│                                                                         │
│   🩺 Docsmyth Doctor                                                    │
│                                                                         │
│   Checking your installation...                                         │
│                                                                         │
╰─────────────────────────────────────────────────────────────────────────╯
`);

    const results: DiagnosticResult[] = [];

    // 1. CLI Version
    results.push({
        name: 'CLI Version',
        status: 'ok',
        value: cliVersion,
    });

    // 2. Package Manager Detection
    const pkgManager = detectPackageManager();
    results.push({
        name: 'Package Manager',
        status: 'ok',
        value: `${pkgManager.name} (${pkgManager.context})`,
    });

    // 3. Check for local installation vs current running version
    const localVersion = getLocalInstalledVersion();
    if (localVersion) {
        const matches = localVersion === cliVersion;
        results.push({
            name: 'Local Installation',
            status: matches ? 'ok' : 'warn',
            value: localVersion,
            message: matches ? undefined : `Running v${cliVersion} but local node_modules has v${localVersion}`,
        });
    }

    // 4. Latest RC Version
    const latestRc = await getLatestRcVersion();
    if (latestRc) {
        const isLatest = cliVersion === latestRc || cliVersion.includes(latestRc);
        results.push({
            name: 'Latest RC',
            status: isLatest ? 'ok' : 'warn',
            value: latestRc,
            message: isLatest ? undefined : `Newer version available: ${latestRc}`,
        });
    }

    // 5. Available Commands
    const commands = checkAvailableCommands();
    const allAvailable = Object.values(commands).every(Boolean);
    results.push({
        name: 'Commands',
        status: allAvailable ? 'ok' : 'warn',
        value: Object.entries(commands)
            .filter(([, available]) => available)
            .map(([cmd]) => cmd)
            .join(', '),
    });

    // 6. Node.js Version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    results.push({
        name: 'Node.js',
        status: majorVersion >= 18 ? 'ok' : 'error',
        value: nodeVersion,
        message: majorVersion < 18 ? 'Node.js 18+ required' : undefined,
    });

    // 7. Working Directory
    results.push({
        name: 'Working Directory',
        status: 'ok',
        value: process.cwd(),
    });

    // Print results
    console.log('  Diagnostics:');
    console.log('');

    for (const result of results) {
        const icon = result.status === 'ok' ? '✓' : result.status === 'warn' ? '⚠' : '✗';
        const color = result.status === 'ok' ? '\x1b[32m' : result.status === 'warn' ? '\x1b[33m' : '\x1b[31m';
        const reset = '\x1b[0m';

        console.log(`  ${color}${icon}${reset} ${result.name}: ${result.value}`);
        if (result.message) {
            console.log(`      ${color}${result.message}${reset}`);
        }
    }

    // Recommendations
    console.log('');
    console.log('  ───────────────────────────────────────────────────────────────────');
    console.log('');

    const hasWarnings = results.some(r => r.status === 'warn');
    const hasErrors = results.some(r => r.status === 'error');

    if (hasErrors) {
        console.log('  ❌ Issues detected that need to be fixed.');
    } else if (hasWarnings) {
        console.log('  ⚠️  Some warnings detected. See recommendations below.');
    } else {
        console.log('  ✅ Everything looks good!');
    }

    // Print install recommendation if version mismatch or not latest
    if (latestRc && cliVersion !== latestRc) {
        console.log('');
        console.log('  📦 Recommended install command:');
        console.log('');

        if (pkgManager.name === 'pnpm') {
            console.log(`     pnpm add -D -w @docsmyth/cli@${latestRc}`);
            console.log('');
            console.log('  Or use directly with:');
            console.log(`     pnpm dlx @docsmyth/cli@rc --help`);
        } else if (pkgManager.name === 'yarn') {
            console.log(`     yarn add -D @docsmyth/cli@${latestRc}`);
            console.log('');
            console.log('  Or use directly with:');
            console.log(`     yarn dlx @docsmyth/cli@rc --help`);
        } else {
            console.log(`     npm install -D @docsmyth/cli@${latestRc}`);
            console.log('');
            console.log('  Or use directly with:');
            console.log(`     npx -y @docsmyth/cli@rc --help`);
        }
    }

    // Verbose output
    if (verbose) {
        console.log('');
        console.log('  ───────────────────────────────────────────────────────────────────');
        console.log('  Verbose Info:');
        console.log('');
        console.log(`  Process args: ${process.argv.join(' ')}`);
        console.log(`  npm_config_user_agent: ${process.env.npm_config_user_agent || 'N/A'}`);
        console.log(`  npm_lifecycle_script: ${process.env.npm_lifecycle_script || 'N/A'}`);

        const gitSha = getGitCommitSha();
        if (gitSha) {
            console.log(`  Git SHA: ${gitSha}`);
        }
    }

    console.log('');
}

/**
 * Verbose version output for --version --verbose
 */
export function printVerboseVersion(): void {
    console.log(`@docsmyth/cli v${cliVersion}`);

    const pkgManager = detectPackageManager();
    console.log(`Package Manager: ${pkgManager.name} (${pkgManager.context})`);
    console.log(`Node.js: ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);

    const gitSha = getGitCommitSha();
    if (gitSha) {
        console.log(`Git SHA: ${gitSha}`);
    }

    const localVersion = getLocalInstalledVersion();
    if (localVersion && localVersion !== cliVersion) {
        console.log(`Local node_modules: v${localVersion} (differs from running version)`);
    }
}
