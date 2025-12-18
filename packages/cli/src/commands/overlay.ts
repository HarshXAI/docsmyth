/**
 * Overlay command - apply overlays to Contract IR
 *
 * Supports applying overlays to produce different views of a contract.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { validate, validateOverlay, type ContractIR, type Overlay } from '@acp/ir-spec';
import { applyOverlay, getOverlaySummary } from '@acp/ir-sdk';

export interface OverlayApplyOptions {
    out: string;
    format?: 'json';
    pretty?: boolean;
    verbose?: boolean;
    summary?: boolean;
}

/**
 * Apply overlay command handler
 */
export async function overlayApplyCommand(
    contractPath: string,
    overlayPath: string,
    options: OverlayApplyOptions
): Promise<void> {
    const contractFilePath = resolve(contractPath);
    const overlayFilePath = resolve(overlayPath);

    // Check files exist
    if (!existsSync(contractFilePath)) {
        console.error(`Error: Contract file not found: ${contractFilePath}`);
        process.exit(1);
    }

    if (!existsSync(overlayFilePath)) {
        console.error(`Error: Overlay file not found: ${overlayFilePath}`);
        process.exit(1);
    }

    // Read and parse contract
    let ir: ContractIR;
    try {
        const raw = readFileSync(contractFilePath, 'utf-8');
        ir = JSON.parse(raw) as ContractIR;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to parse contract JSON: ${message}`);
        process.exit(1);
    }

    // Validate contract
    const irValidation = validate(ir);
    if (!irValidation.valid) {
        console.error('Error: Invalid Contract IR');
        for (const err of irValidation.errors) {
            console.error(`  [${err.path}] ${err.message}`);
        }
        process.exit(1);
    }

    // Read and parse overlay
    let overlay: Overlay;
    try {
        const raw = readFileSync(overlayFilePath, 'utf-8');
        overlay = JSON.parse(raw) as Overlay;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to parse overlay JSON: ${message}`);
        process.exit(1);
    }

    // Validate overlay
    const overlayValidation = validateOverlay(overlay);
    if (!overlayValidation.valid) {
        console.error('Error: Invalid Overlay');
        for (const err of overlayValidation.errors) {
            console.error(`  [${err.path}] ${err.message}`);
        }
        process.exit(1);
    }

    // Show warnings
    if (overlayValidation.warnings.length > 0 && options.verbose) {
        console.warn('Overlay warnings:');
        for (const warn of overlayValidation.warnings) {
            console.warn(`  [${warn.path}] ${warn.message}`);
        }
    }

    // Show summary before applying if requested
    if (options.summary || options.verbose) {
        const summary = getOverlaySummary(ir, overlay);
        console.log(`\nOverlay "${overlay.name}" summary:`);
        console.log(`  Operations to hide: ${summary.hiddenOperationsCount}`);
        if (summary.hiddenOperationIds.length > 0) {
            console.log(`    - ${summary.hiddenOperationIds.join('\n    - ')}`);
        }
        console.log(`  Schema redactions: ${summary.schemaRedactionsCount}`);
        console.log(`  Response redactions: ${summary.responseRedactionsCount}`);
        console.log(`  Request redactions: ${summary.requestRedactionsCount}`);
        console.log(`  Server overrides: ${summary.hasServerOverrides ? 'yes' : 'no'}`);
        console.log('');
    }

    // Apply overlay
    if (options.verbose) {
        console.log('Applying overlay...');
    }

    const result = applyOverlay(ir, overlay);

    // Show application warnings
    if (result.warnings.length > 0) {
        console.warn('Application warnings:');
        for (const warn of result.warnings) {
            console.warn(`  ${warn}`);
        }
    }

    // Write output
    const outPath = resolve(options.out);
    const outDir = dirname(outPath);

    if (!existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
    }

    const jsonOutput = options.pretty !== false
        ? JSON.stringify(result.ir, null, 2)
        : JSON.stringify(result.ir);

    writeFileSync(outPath, jsonOutput);

    console.log(`✓ Overlay applied successfully`);
    console.log(`  Output: ${outPath}`);
    console.log(`  Operations: ${ir.operations.length} → ${result.ir.operations.length} (${result.summary.hiddenOperationsCount} hidden)`);

    if (result.summary.hasServerOverrides) {
        console.log(`  Servers: rewritten`);
    }
}

export interface OverlayValidateOptions {
    verbose?: boolean;
}

/**
 * Validate overlay command handler
 */
export async function overlayValidateCommand(
    overlayPath: string,
    options: OverlayValidateOptions
): Promise<void> {
    const overlayFilePath = resolve(overlayPath);

    if (!existsSync(overlayFilePath)) {
        console.error(`Error: Overlay file not found: ${overlayFilePath}`);
        process.exit(1);
    }

    // Read and parse overlay
    let overlay: unknown;
    try {
        const raw = readFileSync(overlayFilePath, 'utf-8');
        overlay = JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: Failed to parse overlay JSON: ${message}`);
        process.exit(1);
    }

    // Validate overlay
    const result = validateOverlay(overlay);

    if (result.valid) {
        console.log(`✓ Overlay is valid: ${overlayFilePath}`);

        if (result.warnings.length > 0) {
            console.log('\nWarnings:');
            for (const warn of result.warnings) {
                console.log(`  [${warn.path}] ${warn.message}`);
            }
        }

        if (options.verbose) {
            const o = overlay as Overlay;
            console.log(`\nOverlay: "${o.name}"`);
            if (o.description) {
                console.log(`Description: ${o.description}`);
            }
            console.log(`Version: ${o.irOverlayVersion}`);
            console.log(`Hide operations: ${o.hideOperations?.length ?? 0}`);
            console.log(`Server overrides: ${o.serverOverrides?.length ?? 0}`);
            console.log(`Schema redactions: ${o.schemaRedactions?.length ?? 0}`);
            console.log(`Response redactions: ${o.responseRedactions?.length ?? 0}`);
            console.log(`Request redactions: ${o.requestRedactions?.length ?? 0}`);
        }
    } else {
        console.error(`✗ Overlay validation failed: ${overlayFilePath}`);
        console.error('\nErrors:');
        for (const err of result.errors) {
            console.error(`  [${err.path}] ${err.message} (${err.code})`);
        }

        if (result.warnings.length > 0) {
            console.error('\nWarnings:');
            for (const warn of result.warnings) {
                console.error(`  [${warn.path}] ${warn.message}`);
            }
        }

        process.exit(1);
    }
}
