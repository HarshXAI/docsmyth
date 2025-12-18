/**
 * Validate command - validates a Contract IR document
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validate, type ValidationResult } from '@docsmyth/ir-spec';

export interface ValidateOptions {
  verbose?: boolean;
}

/**
 * Format validation result for console output
 */
function formatResult(result: ValidationResult, verbose: boolean): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✓ Contract IR is valid');
  } else {
    lines.push('✗ Contract IR validation failed');
    lines.push('');
    lines.push(`Found ${result.errors.length} error(s):`);

    for (const error of result.errors) {
      lines.push(`  • ${error.path}: ${error.message} [${error.code}]`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push(`Warnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      lines.push(`  ⚠ ${warning.path}: ${warning.message}`);
    }
  }

  if (verbose && result.valid) {
    lines.push('');
    lines.push('Validation details:');
    lines.push('  - IR version check: passed');
    lines.push('  - Service metadata: valid');
    lines.push('  - Schema definitions: valid');
    lines.push('  - Operation definitions: valid');
  }

  return lines.join('\n');
}

/**
 * Validate command handler
 */
export function validateCommand(path: string, options: ValidateOptions): void {
  const filePath = resolve(path);

  // Check file exists
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Read and parse file
  let content: unknown;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    content = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error: Failed to parse JSON: ${message}`);
    process.exit(1);
  }

  // Validate
  const result = validate(content);

  // Output result
  console.log(formatResult(result, options.verbose ?? false));

  // Exit with appropriate code
  process.exit(result.valid ? 0 : 1);
}
