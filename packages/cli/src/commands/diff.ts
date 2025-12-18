/**
 * ACP CLI - diff command
 *
 * Compare two Contract IR documents and report breaking changes.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { validate } from '@docsmyth/ir-spec';
import type { ContractIR } from '@docsmyth/ir-spec';
import {
    diffContract,
    formatDiffReportText,
    formatDiffReportJson,
    type DiffReport,
} from '@docsmyth/linter';

export interface DiffCommandOptions {
    format?: 'text' | 'json';
    failOn?: 'breaking' | 'none';
    verbose?: boolean;
}

/**
 * Load and validate a Contract IR file
 */
function loadContract(filePath: string): unknown {
    const absolutePath = path.resolve(filePath);

    if (!existsSync(absolutePath)) {
        throw new Error(`File not found: ${absolutePath}`);
    }

    const content = readFileSync(absolutePath, 'utf-8');

    try {
        return JSON.parse(content);
    } catch {
        throw new Error(`Invalid JSON in file: ${absolutePath}`);
    }
}

/**
 * Diff command implementation
 */
export async function diffCommand(
    basePath: string,
    headPath: string,
    options: DiffCommandOptions
): Promise<void> {
    const { format = 'text', failOn = 'breaking', verbose = false } = options;

    try {
        // Load contracts
        if (verbose) {
            console.log(`Loading base contract: ${basePath}`);
            console.log(`Loading head contract: ${headPath}`);
        }

        const baseData = loadContract(basePath);
        const headData = loadContract(headPath);

        // Validate contracts
        const baseResult = validate(baseData);
        if (!baseResult.valid) {
            console.error('❌ Base contract is not a valid Contract IR document:');
            for (const error of baseResult.errors || []) {
                console.error(`   ${error.path}: ${error.message}`);
            }
            process.exit(2);
        }

        const headResult = validate(headData);
        if (!headResult.valid) {
            console.error('❌ Head contract is not a valid Contract IR document:');
            for (const error of headResult.errors || []) {
                console.error(`   ${error.path}: ${error.message}`);
            }
            process.exit(2);
        }

        // Perform diff - cast validated data as ContractIR
        const report: DiffReport = diffContract(baseData as ContractIR, headData as ContractIR);

        // Output report
        if (format === 'json') {
            console.log(formatDiffReportJson(report));
        } else {
            console.log(formatDiffReportText(report));
        }

        // Exit with appropriate code
        if (failOn === 'breaking' && report.hasBreakingChanges) {
            process.exit(1);
        }

        process.exit(0);
    } catch (error) {
        // Re-throw process.exit errors (from test mocks)
        if (error instanceof Error && error.message.startsWith('process.exit')) {
            throw error;
        }
        if (error instanceof Error) {
            console.error(`❌ Error: ${error.message}`);
        } else {
            console.error('❌ An unexpected error occurred');
        }
        process.exit(2);
    }
}
