/**
 * Evidence utilities for parsing and coverage analysis
 *
 * Shared helpers for evidence parsing and coverage summarization.
 */

import { readFileSync } from 'node:fs';
import type { EvidenceEvent } from '@acp/evidence-sdk';
import type { ContractIR } from '@acp/ir-spec';

/**
 * Coverage statistics for a single operation
 */
export interface OperationCoverage {
  operationId: string;
  total: number;
  /** Number of events with request bodies */
  requests: number;
  /** Response counts by status code */
  responses: Record<string, number>;
  /** @deprecated Use responses instead */
  byStatus: Record<string, number>;
}

/**
 * Coverage summary for all operations
 */
export interface CoverageSummary {
  totalOps: number;
  opsWithEvidence: number;
  opsMissingEvidence: number;
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  perOp: Record<string, OperationCoverage>;
  missingOps: string[];
}

/**
 * Parse NDJSON evidence file into an array of events
 *
 * @param filePath - Path to the NDJSON file
 * @returns Array of evidence events
 * @throws Error if file cannot be read or parsed
 */
export function parseNdjsonEvidence(filePath: string): EvidenceEvent[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as EvidenceEvent;
    } catch {
      throw new Error(`Failed to parse evidence at line ${index + 1}: invalid JSON`);
    }
  });
}

/**
 * Summarize coverage of evidence events against a contract
 *
 * @param events - Evidence events to summarize
 * @param contract - Contract IR to compare against
 * @param validEvents - Optional count of valid events (if verification was run)
 * @param invalidEvents - Optional count of invalid events (if verification was run)
 * @returns Coverage summary
 */
export function summarizeCoverage(
  events: EvidenceEvent[],
  contract: ContractIR,
  validEvents?: number,
  invalidEvents?: number
): CoverageSummary {
  // Build set of known operation IDs
  const knownOps = new Set<string>(contract.operations.map((op) => op.operationId));

  // Initialize per-operation coverage
  const perOp: Record<string, OperationCoverage> = {};

  // Count events per operation, tracking requests and responses separately
  for (const event of events) {
    const { operationId } = event;

    // Only count events that map to known operations
    if (!knownOps.has(operationId)) {
      continue;
    }

    if (!perOp[operationId]) {
      perOp[operationId] = {
        operationId,
        total: 0,
        requests: 0,
        responses: {},
        byStatus: {}, // deprecated, kept for backwards compatibility
      };
    }

    perOp[operationId].total++;

    // Count request bodies
    if (event.request.body !== undefined) {
      perOp[operationId].requests++;
    }

    // Count responses by status code
    const status = String(event.response.status);
    perOp[operationId].responses[status] = (perOp[operationId].responses[status] || 0) + 1;
    perOp[operationId].byStatus[status] = perOp[operationId].responses[status]; // deprecated alias
  }

  // Find operations without evidence
  const opsWithEvidence = new Set(Object.keys(perOp));
  const missingOps: string[] = [];
  for (const opId of knownOps) {
    if (!opsWithEvidence.has(opId)) {
      missingOps.push(opId);
    }
  }
  missingOps.sort();

  // Sort perOp keys for deterministic output
  const sortedPerOp: Record<string, OperationCoverage> = {};
  const sortedKeys = Object.keys(perOp).sort();
  for (const key of sortedKeys) {
    // Also sort response status keys
    const op = perOp[key];
    const sortedResponses: Record<string, number> = {};
    const statusKeys = Object.keys(op.responses).sort((a, b) => Number(a) - Number(b));
    for (const sk of statusKeys) {
      sortedResponses[sk] = op.responses[sk];
    }
    sortedPerOp[key] = {
      ...op,
      responses: sortedResponses,
      byStatus: sortedResponses, // deprecated alias
    };
  }

  return {
    totalOps: knownOps.size,
    opsWithEvidence: opsWithEvidence.size,
    opsMissingEvidence: missingOps.length,
    totalEvents: events.length,
    validEvents: validEvents ?? events.length,
    invalidEvents: invalidEvents ?? 0,
    perOp: sortedPerOp,
    missingOps,
  };
}

/**
 * Format coverage summary for console output
 *
 * @param coverage - Coverage summary to format
 * @returns Formatted string for console output
 */
export function formatCoverage(coverage: CoverageSummary): string {
  const lines: string[] = [];

  lines.push('─────────────────────────────────────────────────');
  lines.push('Evidence Coverage Report');
  lines.push('─────────────────────────────────────────────────');
  lines.push('');

  // Summary stats
  const coveragePercent =
    coverage.totalOps > 0 ? Math.round((coverage.opsWithEvidence / coverage.totalOps) * 100) : 0;

  lines.push(
    `Operations covered: ${coverage.opsWithEvidence}/${coverage.totalOps} (${coveragePercent}%)`
  );
  lines.push(`Total evidence events: ${coverage.totalEvents}`);

  if (coverage.invalidEvents > 0) {
    lines.push(`Valid events: ${coverage.validEvents}`);
    lines.push(`Invalid events: ${coverage.invalidEvents}`);
  }

  lines.push('');

  // Per-operation breakdown
  if (Object.keys(coverage.perOp).length > 0) {
    lines.push('Per-operation coverage:');
    for (const [opId, op] of Object.entries(coverage.perOp)) {
      const responsesBreakdown = Object.entries(op.responses)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ');
      const parts: string[] = [];
      if (op.requests > 0) {
        parts.push(`requests: ${op.requests}`);
      }
      if (Object.keys(op.responses).length > 0) {
        parts.push(`responses: {${responsesBreakdown}}`);
      }
      const breakdown = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      lines.push(`  ✓ ${opId}: ${op.total} events${breakdown}`);
    }
    lines.push('');
  }

  // Missing operations
  if (coverage.missingOps.length > 0) {
    lines.push('Operations without evidence:');
    for (const opId of coverage.missingOps) {
      lines.push(`  ○ ${opId}`);
    }
    lines.push('');
  }

  lines.push('─────────────────────────────────────────────────');

  return lines.join('\n');
}
