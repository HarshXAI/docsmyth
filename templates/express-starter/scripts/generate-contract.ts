/**
 * Generate Contract IR from Zod Schemas
 *
 * This script extracts Contract IR from the Zod schema definitions.
 * It's a simple example - in production, you'd use the @docsmyth/cli extract command.
 *
 * Usage:
 *   pnpm run generate:contract
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// For this starter template, the contract is manually maintained.
// In a real project, you would:
//
// 1. Use AST extraction (future @docsmyth/cli extract command)
// 2. Maintain the contract.ir.json directly
// 3. Use OpenAPI-first design and convert to IR
//
// This script serves as a placeholder and documentation.

console.log('Contract generation placeholder');
console.log('');
console.log('For this starter template, the Contract IR is maintained at:');
console.log('  contract/contract.ir.json');
console.log('');
console.log('To validate the contract:');
console.log('  pnpm run contract:validate');
console.log('');
console.log('To compile to OpenAPI:');
console.log('  pnpm run contract:compile');
console.log('');
console.log('Future versions of @docsmyth/cli will support:');
console.log('  acp extract src/ --out contract/contract.ir.json');
console.log('');

// Validate that the contract file exists and is valid JSON
try {
  const contractPath = resolve(__dirname, '../contract/contract.ir.json');
  const contract = JSON.parse((await import('fs')).readFileSync(contractPath, 'utf-8'));

  console.log('✓ Contract file exists and is valid JSON');
  console.log(`  Service: ${contract.service?.name || 'unknown'}`);
  console.log(`  Version: ${contract.service?.version || 'unknown'}`);
  console.log(`  Operations: ${contract.operations?.length || 0}`);
  console.log(`  Schemas: ${Object.keys(contract.schemas || {}).length}`);
} catch (error) {
  console.error('✗ Contract file error:', error);
  process.exit(1);
}
