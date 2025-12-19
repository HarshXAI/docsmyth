/**
 * Infer Command - Generate Contract IR from Evidence
 *
 * Reads evidence NDJSON and generates a draft Contract IR
 * with operations and schemas inferred from the captured traffic.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validate } from '@docsmyth/ir-spec';
import { inferContract } from '../services/infer.js';

export interface InferCommandOptions {
    evidence: string;
    out: string;
    service: string;
    version: string;
    verbose: boolean;
}

/**
 * Infer command handler
 */
export async function inferCommand(options: InferCommandOptions): Promise<void> {
    const { evidence, out, service, version, verbose } = options;

    // Validate evidence file exists
    const evidencePath = resolve(evidence);
    if (!existsSync(evidencePath)) {
        console.error(`Error: Evidence file not found: ${evidencePath}`);
        process.exit(1);
    }

    // Ensure output directory exists
    const outPath = resolve(out);
    const outDir = dirname(outPath);
    if (outDir && !existsSync(outDir)) {
        mkdirSync(outDir, { recursive: true });
    }

    console.log('Inferring contract from evidence...');
    if (verbose) {
        console.log(`  Evidence: ${evidencePath}`);
        console.log(`  Service:  ${service}@${version}`);
    }

    try {
        // Infer contract
        const contract = await inferContract({
            evidencePath,
            serviceName: service,
            serviceVersion: version,
            semanticOperationIds: true,
        });

        // Handle empty contract gracefully
        if (contract.operations.length === 0) {
            console.warn('⚠️  Warning: No operations found in evidence. Generated minimal contract.');
            console.log('');
            console.log('   To capture traffic:');
            console.log(`   docsmyth quickstart --target <your-service-url>`);
            console.log('');
            console.log('   Or use record mode:');
            console.log(`   docsmyth record --target <your-service-url> --out ${evidencePath}`);
        }

        // Validate the generated contract
        const validation = validate(contract);
        if (!validation.valid) {
            console.warn('Warning: Generated contract has validation issues:');
            for (const error of validation.errors) {
                console.warn(`  - ${error.path}: ${error.message}`);
            }
        }

        // Write contract
        const json = JSON.stringify(contract, null, 2);
        writeFileSync(outPath, json, 'utf-8');

        // Print summary
        if (contract.operations.length > 0) {
            console.log(`
✅ Contract generated successfully!

Summary:
  Operations:   ${contract.operations.length}
  Schemas:      ${Object.keys(contract.schemas).length}
  Output:       ${outPath}

Operations detected:
${contract.operations.map((op) => `  ${op.method.padEnd(7)} ${op.path.padEnd(30)} → ${op.operationId}`).join('\n')}

Next steps:
  1. Validate:  docsmyth validate ${outPath}
  2. Compile:   docsmyth compile ${outPath} -o ./openapi
  3. Studio:    docsmyth studio --contract ${outPath} --evidence ${evidencePath}
  4. Proxy:     docsmyth proxy --contract ${outPath} --target <your-service> --capture
`);
        } else {
            console.log(`
⚠️  Empty contract generated (no operations found)

  Output:       ${outPath}

To capture API traffic, run:
  docsmyth quickstart --target <your-service-url>
`);
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error: ${message}`);
        process.exit(1);
    }
}
