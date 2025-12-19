/**
 * Contract Service
 *
 * Handles contract file operations: reading, validation, initialization.
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { validate, type ContractIR, type ValidationResult } from '@docsmyth/ir-spec';
import type { CacheEntry, ContractValidationResult } from '../types.js';
import { createMinimalContract } from '../types.js';

/**
 * Cache for contract files
 */
const contractCache = new Map<string, CacheEntry<ContractIR>>();

/**
 * Read a contract file with caching
 */
export async function readContract(
    contractPath: string,
    useCache: boolean = true
): Promise<ContractIR> {
    const absolutePath = contractPath;

    if (!existsSync(absolutePath)) {
        throw new Error(`Contract file not found: ${absolutePath}`);
    }

    const stats = await stat(absolutePath);
    const mtime = stats.mtimeMs;
    const size = stats.size;

    // Check cache
    if (useCache) {
        const cached = contractCache.get(absolutePath);
        if (cached && cached.mtime === mtime && cached.size === size) {
            return cached.data;
        }
    }

    // Read and parse
    const content = await readFile(absolutePath, 'utf-8');
    let contract: ContractIR;

    try {
        contract = JSON.parse(content) as ContractIR;
    } catch (e) {
        throw new Error(
            `Failed to parse contract JSON: ${e instanceof Error ? e.message : String(e)}`
        );
    }

    // Cache the result
    contractCache.set(absolutePath, { data: contract, mtime, size });

    return contract;
}

/**
 * Validate a contract file
 */
export async function validateContract(
    contractPath: string
): Promise<ContractValidationResult> {
    try {
        const content = await readFile(contractPath, 'utf-8');
        let parsed: unknown;

        try {
            parsed = JSON.parse(content);
        } catch (e) {
            return {
                ok: false,
                errors: [
                    {
                        path: '',
                        message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
                        code: 'INVALID_JSON',
                    },
                ],
                warnings: [],
            };
        }

        const result: ValidationResult = validate(parsed);

        return {
            ok: result.valid,
            errors: result.errors,
            warnings: result.warnings,
        };
    } catch (e) {
        return {
            ok: false,
            errors: [
                {
                    path: '',
                    message: e instanceof Error ? e.message : String(e),
                    code: 'READ_ERROR',
                },
            ],
            warnings: [],
        };
    }
}

/**
 * Initialize a new contract file
 */
export async function initContract(
    path: string,
    serviceName?: string,
    version?: string
): Promise<void> {
    const contract = createMinimalContract(serviceName, version);
    const content = JSON.stringify(contract, null, 2);
    await writeFile(path, content, 'utf-8');

    // Clear cache for this path
    contractCache.delete(path);
}

/**
 * Check if contract exists and is valid
 */
export async function isContractValid(contractPath: string): Promise<boolean> {
    if (!existsSync(contractPath)) {
        return false;
    }

    try {
        const result = await validateContract(contractPath);
        return result.ok;
    } catch {
        return false;
    }
}

/**
 * Clear the contract cache
 */
export function clearContractCache(): void {
    contractCache.clear();
}
