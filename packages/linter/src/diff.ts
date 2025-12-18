/**
 * @acp/linter - Contract Diff Engine
 *
 * This module provides the main diffContract() function that compares
 * two Contract IR documents and reports breaking changes.
 */

import type { ContractIR } from '@acp/ir-spec';
import type { DiffFinding, DiffOptions, DiffReport, DiffSummary } from './types.js';
import { v1Rules } from './rules.js';

/**
 * Sort findings deterministically for stable output
 * Order: severity (breaking first), ruleId, operationId, method, path, jsonPath
 */
function sortFindings(findings: DiffFinding[]): DiffFinding[] {
    return [...findings].sort((a, b) => {
        // Severity: breaking before non-breaking
        const severityOrder = { breaking: 0, 'non-breaking': 1 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;

        // Rule ID
        const ruleIdDiff = a.ruleId.localeCompare(b.ruleId);
        if (ruleIdDiff !== 0) return ruleIdDiff;

        // OperationId
        const opIdA = a.location.operationId || '';
        const opIdB = b.location.operationId || '';
        const opIdDiff = opIdA.localeCompare(opIdB);
        if (opIdDiff !== 0) return opIdDiff;

        // Method
        const methodA = a.location.method || '';
        const methodB = b.location.method || '';
        const methodDiff = methodA.localeCompare(methodB);
        if (methodDiff !== 0) return methodDiff;

        // Path
        const pathA = a.location.path || '';
        const pathB = b.location.path || '';
        const pathDiff = pathA.localeCompare(pathB);
        if (pathDiff !== 0) return pathDiff;

        // JSON Path
        const jsonPathA = a.location.jsonPath || '';
        const jsonPathB = b.location.jsonPath || '';
        return jsonPathA.localeCompare(jsonPathB);
    });
}

/**
 * Calculate summary statistics from findings
 */
function calculateSummary(findings: DiffFinding[]): DiffSummary {
    let breaking = 0;
    let nonBreaking = 0;

    for (const finding of findings) {
        if (finding.severity === 'breaking') {
            breaking++;
        } else {
            nonBreaking++;
        }
    }

    return {
        total: findings.length,
        breaking,
        nonBreaking,
    };
}

/**
 * Diff two Contract IR documents and return a report of changes
 *
 * @param base - The base (old) contract
 * @param head - The head (new) contract
 * @param options - Diff options
 * @returns A diff report containing all findings
 */
export function diffContract(
    base: ContractIR,
    head: ContractIR,
    options: DiffOptions = {}
): DiffReport {
    const { includeNonBreaking = true } = options;

    // Run all rules and collect findings
    const allFindings: DiffFinding[] = [];

    for (const rule of v1Rules) {
        const findings = rule(base, head);
        allFindings.push(...findings);
    }

    // Filter non-breaking if requested
    let filteredFindings = allFindings;
    if (!includeNonBreaking) {
        filteredFindings = allFindings.filter((f) => f.severity === 'breaking');
    }

    // Sort findings deterministically
    const sortedFindings = sortFindings(filteredFindings);

    // Calculate summary
    const summary = calculateSummary(sortedFindings);

    return {
        version: '1.0',
        timestamp: new Date().toISOString(),
        summary,
        findings: sortedFindings,
        hasBreakingChanges: summary.breaking > 0,
    };
}

/**
 * Format a diff report as human-readable text
 */
export function formatDiffReportText(report: DiffReport): string {
    const lines: string[] = [];

    // Header
    lines.push('═══════════════════════════════════════════════════════════════════════════════');
    lines.push('                        API Contract Breaking Change Report');
    lines.push('═══════════════════════════════════════════════════════════════════════════════');
    lines.push('');

    // Summary
    lines.push('Summary');
    lines.push('───────────────────────────────────────────────────────────────────────────────');
    lines.push(`  Total Changes:     ${report.summary.total}`);
    lines.push(`  Breaking Changes:  ${report.summary.breaking}`);
    lines.push(`  Non-Breaking:      ${report.summary.nonBreaking}`);
    lines.push('');

    if (report.hasBreakingChanges) {
        lines.push('⚠️  BREAKING CHANGES DETECTED');
        lines.push('');
    } else if (report.summary.total > 0) {
        lines.push('✓  No breaking changes detected');
        lines.push('');
    } else {
        lines.push('✓  No changes detected');
        lines.push('');
        return lines.join('\n');
    }

    // Group findings by severity
    const breakingFindings = report.findings.filter((f) => f.severity === 'breaking');
    const nonBreakingFindings = report.findings.filter((f) => f.severity === 'non-breaking');

    // Breaking changes
    if (breakingFindings.length > 0) {
        lines.push('Breaking Changes');
        lines.push('───────────────────────────────────────────────────────────────────────────────');

        for (const finding of breakingFindings) {
            lines.push('');
            lines.push(`  [${finding.ruleId}] ${finding.message}`);

            if (finding.location.method && finding.location.path) {
                lines.push(`    Endpoint:    ${finding.location.method} ${finding.location.path}`);
            }
            if (finding.location.operationId) {
                lines.push(`    operationId: ${finding.location.operationId}`);
            }
            if (finding.location.jsonPath) {
                lines.push(`    Location:    ${finding.location.jsonPath}`);
            }
            if (finding.recommendation) {
                lines.push(`    ⮕ ${finding.recommendation}`);
            }
        }
        lines.push('');
    }

    // Non-breaking changes
    if (nonBreakingFindings.length > 0) {
        lines.push('Non-Breaking Changes');
        lines.push('───────────────────────────────────────────────────────────────────────────────');

        for (const finding of nonBreakingFindings) {
            lines.push('');
            lines.push(`  [${finding.ruleId}] ${finding.message}`);

            if (finding.location.method && finding.location.path) {
                lines.push(`    Endpoint:    ${finding.location.method} ${finding.location.path}`);
            }
        }
        lines.push('');
    }

    // Footer with next steps
    if (report.hasBreakingChanges) {
        lines.push('───────────────────────────────────────────────────────────────────────────────');
        lines.push('Next Steps:');
        lines.push('  1. Review each breaking change and assess the impact on consumers.');
        lines.push('  2. Consider versioning the API if changes are necessary.');
        lines.push('  3. Communicate changes to API consumers before deployment.');
        lines.push('  4. Update documentation and migration guides as needed.');
        lines.push('───────────────────────────────────────────────────────────────────────────────');
    }

    return lines.join('\n');
}

/**
 * Format a diff report as JSON string
 */
export function formatDiffReportJson(report: DiffReport): string {
    return JSON.stringify(report, null, 2);
}
