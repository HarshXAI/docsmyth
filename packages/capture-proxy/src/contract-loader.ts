/**
 * Contract loading from Hub or local file
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContractIR } from '@acp/ir-spec';
import { validate, type ValidationResult } from '@acp/ir-spec';
import { HubClient, HubNotFoundError } from '@acp/hub-client';
import type { Logger } from './logger.js';

/**
 * Source configuration for loading a contract
 */
export type ContractSource =
    | { type: 'file'; path: string }
    | { type: 'hub'; hubUrl: string; token?: string; service: string; version: string };

/**
 * Contract loader interface
 */
export interface ContractLoader {
    /** Load and validate the contract */
    load(): Promise<ContractIR>;
    /** Get the source description for logging */
    describe(): string;
}

/**
 * Load a contract from the specified source
 */
export async function loadContract(
    source: ContractSource,
    logger: Logger
): Promise<ContractIR> {
    let contract: ContractIR;

    if (source.type === 'file') {
        logger.info(`Loading contract from file: ${source.path}`);
        contract = loadFromFile(source.path);
    } else {
        logger.info(`Loading contract from hub: ${source.hubUrl} (${source.service}@${source.version})`);
        contract = await loadFromHub(source.hubUrl, source.token, source.service, source.version);
    }

    // Validate the contract
    const validation = validateContract(contract);
    if (!validation.valid) {
        const errors = validation.errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
        throw new Error(`Invalid contract:\n${errors}`);
    }

    logger.info(
        `Contract loaded: ${contract.service.name}@${contract.service.version} (${contract.operations.length} operations)`
    );

    return contract;
}

/**
 * Load contract from a local file
 */
function loadFromFile(path: string): ContractIR {
    const fullPath = resolve(path);
    try {
        const content = readFileSync(fullPath, 'utf-8');
        return JSON.parse(content) as ContractIR;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`Contract file not found: ${fullPath}`);
        }
        throw new Error(`Failed to load contract from ${fullPath}: ${error}`);
    }
}

/**
 * Load contract from the Hub
 */
async function loadFromHub(
    hubUrl: string,
    token: string | undefined,
    service: string,
    version: string
): Promise<ContractIR> {
    const client = new HubClient({ baseUrl: hubUrl, token });

    try {
        if (version === 'latest') {
            const response = await client.getLatest(service);
            return response.ir;
        } else {
            const response = await client.getContract(service, version);
            return response.ir;
        }
    } catch (error) {
        if (error instanceof HubNotFoundError) {
            throw new Error(`Contract not found: ${service}@${version}`);
        }
        throw error;
    }
}

/**
 * Validate the contract using ir-spec
 */
function validateContract(contract: unknown): ValidationResult {
    return validate(contract);
}
