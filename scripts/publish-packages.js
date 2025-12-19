#!/usr/bin/env node
/**
 * Publish script that replaces workspace:* with real versions before publishing.
 * This keeps workspace:* for local development but publishes with proper semver deps.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PACKAGES_DIR = join(ROOT, 'packages');

// New version to publish
const NEW_VERSION = process.env.NEW_VERSION || '0.1.1-rc.3';
const DRY_RUN = process.argv.includes('--dry-run');
const TAG = process.argv.includes('--latest') ? 'latest' : 'rc';

// Packages in dependency order (leaves first, CLI last)
const PUBLISH_ORDER = [
    'ir-spec',      // no internal deps
    'ir-sdk',       // depends on ir-spec
    'evidence-sdk', // no internal deps
    'compiler-openapi', // depends on ir-spec, ir-sdk
    'linter',       // depends on ir-spec
    'path-matcher', // no internal deps
    'hub-client',   // depends on ir-spec, path-matcher
    'hub',          // depends on ir-spec, hub-client, path-matcher
    'capture-proxy',// depends on ir-spec, evidence-sdk, hub-client, path-matcher
    'runtime-node-express', // depends on ir-spec, evidence-sdk
    'studio',       // depends on ir-spec, ir-sdk, evidence-sdk, compiler-openapi
    'cli',          // depends on everything
];

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function log(msg, color = 'reset') {
    const colors = {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        red: '\x1b[31m',
    };
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

function transformPackageJson(pkgDir, newVersion) {
    const pkgPath = join(pkgDir, 'package.json');
    const backupPath = join(pkgDir, 'package.json.bak');

    // Backup original
    copyFileSync(pkgPath, backupPath);

    const json = JSON.parse(readFileSync(pkgPath, 'utf8'));

    // Update version
    json.version = newVersion;

    // Replace workspace:* deps with real version
    for (const field of DEP_FIELDS) {
        if (!json[field]) continue;
        for (const [dep, ver] of Object.entries(json[field])) {
            if (dep.startsWith('@docsmyth/') && typeof ver === 'string' && ver.startsWith('workspace:')) {
                json[field][dep] = newVersion;
            }
        }
    }

    // Ensure CLI binary name
    if (json.name === '@docsmyth/cli') {
        json.bin = { docsmyth: './dist/cli.js' };
    }

    // Ensure hub binary name
    if (json.name === '@docsmyth/hub') {
        json.bin = { 'docsmyth-hub': './dist/server.js' };
    }

    // Ensure studio binary name
    if (json.name === '@docsmyth/studio') {
        json.bin = { 'docsmyth-studio': './dist/bin.js' };
    }

    writeFileSync(pkgPath, JSON.stringify(json, null, 2) + '\n');

    return { original: backupPath, transformed: pkgPath, name: json.name };
}

function restorePackageJson(pkgDir) {
    const pkgPath = join(pkgDir, 'package.json');
    const backupPath = join(pkgDir, 'package.json.bak');

    if (existsSync(backupPath)) {
        copyFileSync(backupPath, pkgPath);
        execSync(`rm "${backupPath}"`, { stdio: 'ignore' });
    }
}

function publishPackage(pkgDir, tag) {
    try {
        const cmd = `npm publish --access public --tag ${tag}`;
        log(`  Running: ${cmd}`, 'blue');

        if (DRY_RUN) {
            log('  [DRY RUN] Would publish', 'yellow');
            return true;
        }

        execSync(cmd, { cwd: pkgDir, stdio: 'inherit' });
        return true;
    } catch (err) {
        log(`  Failed to publish: ${err.message}`, 'red');
        return false;
    }
}

async function main() {
    log(`\n📦 Publishing @docsmyth/* packages as ${NEW_VERSION}`, 'blue');
    log(`   Tag: ${TAG}`, 'blue');
    if (DRY_RUN) log('   [DRY RUN MODE]', 'yellow');
    log('');

    const results = [];

    for (const pkg of PUBLISH_ORDER) {
        const pkgDir = join(PACKAGES_DIR, pkg);

        if (!existsSync(join(pkgDir, 'package.json'))) {
            log(`⚠️  Skipping ${pkg} - package.json not found`, 'yellow');
            continue;
        }

        log(`\n[${PUBLISH_ORDER.indexOf(pkg) + 1}/${PUBLISH_ORDER.length}] Publishing ${pkg}...`, 'blue');

        try {
            // Transform package.json
            const { name } = transformPackageJson(pkgDir, NEW_VERSION);
            log(`  Transformed ${name} to ${NEW_VERSION}`, 'green');

            // Publish
            const success = publishPackage(pkgDir, TAG);
            results.push({ pkg, success });

            if (success) {
                log(`  ✓ Published ${name}@${NEW_VERSION}`, 'green');
            }
        } finally {
            // Always restore original package.json
            restorePackageJson(pkgDir);
            log(`  Restored original package.json`, 'blue');
        }
    }

    // Summary
    log('\n' + '='.repeat(50), 'blue');
    log('📊 Publish Summary', 'blue');
    log('='.repeat(50), 'blue');

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    log(`✓ Succeeded: ${succeeded.length}`, 'green');
    if (failed.length > 0) {
        log(`✗ Failed: ${failed.length}`, 'red');
        for (const { pkg } of failed) {
            log(`  - ${pkg}`, 'red');
        }
    }

    log('\nVerify with:', 'blue');
    log(`  npm view @docsmyth/cli@${TAG} dependencies --json`, 'blue');
    log(`  npx -y @docsmyth/cli@${TAG} --help`, 'blue');

    process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
    log(`Fatal error: ${err.message}`, 'red');
    process.exit(1);
});
