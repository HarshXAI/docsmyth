/**
 * @acp/linter - Diff Engine Tests
 *
 * Tests for breaking change detection across all v1 rules.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ContractIR } from '@acp/ir-spec';
import { diffContract, formatDiffReportText, formatDiffReportJson } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

function loadFixture(name: string): ContractIR {
    const content = readFileSync(join(fixturesDir, name), 'utf-8');
    return JSON.parse(content) as ContractIR;
}

describe('diffContract', () => {
    const base = loadFixture('base.json');

    describe('No changes', () => {
        it('should return empty findings when contracts are identical', () => {
            const head = loadFixture('head-no-changes.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(false);
            expect(report.summary.breaking).toBe(0);
            expect(report.summary.total).toBe(0);
            expect(report.findings).toHaveLength(0);
        });
    });

    describe('BC001_ENDPOINT_REMOVED', () => {
        it('should detect when an endpoint is removed', () => {
            const head = loadFixture('head-endpoint-removed.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);
            expect(report.summary.breaking).toBeGreaterThanOrEqual(1);

            const finding = report.findings.find((f) => f.ruleId === 'BC001_ENDPOINT_REMOVED');
            expect(finding).toBeDefined();
            expect(finding!.location.method).toBe('DELETE');
            expect(finding!.location.path).toBe('/users/{id}');
            expect(finding!.location.operationId).toBe('deleteUser');
            expect(finding!.severity).toBe('breaking');
        });
    });

    describe('BC002_OPERATION_ID_CHANGED', () => {
        it('should detect when operationId changes', () => {
            const head = loadFixture('head-operation-id-changed.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            const finding = report.findings.find((f) => f.ruleId === 'BC002_OPERATION_ID_CHANGED');
            expect(finding).toBeDefined();
            expect(finding!.location.method).toBe('POST');
            expect(finding!.location.path).toBe('/users');
            expect(finding!.previousValue).toBe('createUser');
            expect(finding!.currentValue).toBe('addUser');
            expect(finding!.severity).toBe('breaking');
        });
    });

    describe('BC010_REQUEST_REQUIRED_ADDED', () => {
        it('should detect when a request body field becomes required', () => {
            const head = loadFixture('head-required-added.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            const finding = report.findings.find(
                (f) =>
                    f.ruleId === 'BC010_REQUEST_REQUIRED_ADDED' && f.message.includes('"email" became required')
            );
            expect(finding).toBeDefined();
            expect(finding!.location.operationId).toBe('createUser');
            expect(finding!.severity).toBe('breaking');
        });

        it('should detect when a new required parameter is added', () => {
            const head = loadFixture('head-required-param-added.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            const finding = report.findings.find(
                (f) => f.ruleId === 'BC010_REQUEST_REQUIRED_ADDED' && f.message.includes('tenantId')
            );
            expect(finding).toBeDefined();
            expect(finding!.location.operationId).toBe('listUsers');
            expect(finding!.severity).toBe('breaking');
        });

        it('should detect when an optional parameter becomes required', () => {
            const head = loadFixture('head-param-became-required.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            const finding = report.findings.find(
                (f) =>
                    f.ruleId === 'BC010_REQUEST_REQUIRED_ADDED' && f.message.includes('"limit"')
            );
            expect(finding).toBeDefined();
            expect(finding!.location.operationId).toBe('listUsers');
            expect(finding!.severity).toBe('breaking');
        });
    });

    describe('BC011_TYPE_NARROWED', () => {
        it('should detect when type constraints are narrowed', () => {
            const head = loadFixture('head-type-narrowed.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            // Check for maxLength narrowing
            const maxLengthFinding = report.findings.find(
                (f) => f.ruleId === 'BC011_TYPE_NARROWED' && f.message.includes('maxLength')
            );
            expect(maxLengthFinding).toBeDefined();
            expect(maxLengthFinding!.previousValue).toBe(100);
            expect(maxLengthFinding!.currentValue).toBe(50);

            // Check for pattern addition
            const patternFinding = report.findings.find(
                (f) => f.ruleId === 'BC011_TYPE_NARROWED' && f.message.includes('pattern')
            );
            expect(patternFinding).toBeDefined();

            // Check for minimum increase
            const minimumFinding = report.findings.find(
                (f) => f.ruleId === 'BC011_TYPE_NARROWED' && f.message.includes('minimum')
            );
            expect(minimumFinding).toBeDefined();
            expect(minimumFinding!.previousValue).toBe(0);
            expect(minimumFinding!.currentValue).toBe(18);

            // Check for maximum decrease
            const maximumFinding = report.findings.find(
                (f) => f.ruleId === 'BC011_TYPE_NARROWED' && f.message.includes('maximum')
            );
            expect(maximumFinding).toBeDefined();
            expect(maximumFinding!.previousValue).toBe(150);
            expect(maximumFinding!.currentValue).toBe(100);
        });
    });

    describe('BC012_ENUM_NARROWED', () => {
        it('should detect when enum values are removed', () => {
            const head = loadFixture('head-enum-narrowed.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            const finding = report.findings.find((f) => f.ruleId === 'BC012_ENUM_NARROWED');
            expect(finding).toBeDefined();
            expect(finding!.message).toContain('guest');
            expect(finding!.severity).toBe('breaking');
        });
    });

    describe('BC020_RESPONSE_STATUS_REMOVED', () => {
        it('should detect when a response status code is removed', () => {
            const head = loadFixture('head-response-status-removed.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            const finding = report.findings.find((f) => f.ruleId === 'BC020_RESPONSE_STATUS_REMOVED');
            expect(finding).toBeDefined();
            expect(finding!.location.operationId).toBe('getUser');
            expect(finding!.previousValue).toBe(404);
            expect(finding!.severity).toBe('breaking');
        });
    });

    describe('BC021_RESPONSE_SCHEMA_NARROWED', () => {
        it('should detect when response schema properties are removed', () => {
            const head = loadFixture('head-response-schema-narrowed.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);

            const finding = report.findings.find((f) => f.ruleId === 'BC021_RESPONSE_SCHEMA_NARROWED');
            expect(finding).toBeDefined();
            expect(finding!.message).toContain('email');
            expect(finding!.severity).toBe('breaking');
        });
    });

    describe('NC001_DESCRIPTION_CHANGED', () => {
        it('should detect when description/summary/tags change (non-breaking)', () => {
            const head = loadFixture('head-description-changed.json');
            const report = diffContract(base, head);

            // Description changes are non-breaking
            expect(report.hasBreakingChanges).toBe(false);
            expect(report.summary.nonBreaking).toBeGreaterThanOrEqual(1);

            const findings = report.findings.filter((f) => f.ruleId === 'NC001_DESCRIPTION_CHANGED');
            expect(findings.length).toBeGreaterThanOrEqual(1);
            expect(findings[0]!.severity).toBe('non-breaking');
        });

        it('should exclude non-breaking changes when option is set', () => {
            const head = loadFixture('head-description-changed.json');
            const report = diffContract(base, head, { includeNonBreaking: false });

            expect(report.findings).toHaveLength(0);
            expect(report.summary.total).toBe(0);
        });
    });

    describe('Multiple breaking changes', () => {
        it('should detect multiple breaking changes in one diff', () => {
            const head = loadFixture('head-multiple-breaking.json');
            const report = diffContract(base, head);

            expect(report.hasBreakingChanges).toBe(true);
            expect(report.summary.breaking).toBeGreaterThanOrEqual(3);

            // Should have endpoint removed
            expect(report.findings.some((f) => f.ruleId === 'BC001_ENDPOINT_REMOVED')).toBe(true);

            // Should have operationId changed
            expect(report.findings.some((f) => f.ruleId === 'BC002_OPERATION_ID_CHANGED')).toBe(true);

            // Should have required field added
            expect(report.findings.some((f) => f.ruleId === 'BC010_REQUEST_REQUIRED_ADDED')).toBe(true);
        });
    });

    describe('Deterministic ordering', () => {
        it('should produce consistently sorted findings', () => {
            const head = loadFixture('head-multiple-breaking.json');
            const report1 = diffContract(base, head);
            const report2 = diffContract(base, head);

            // Run multiple times to ensure determinism
            for (let i = 0; i < 5; i++) {
                const report = diffContract(base, head);
                expect(report.findings.map((f) => f.ruleId)).toEqual(report1.findings.map((f) => f.ruleId));
                expect(report.findings.map((f) => f.location.operationId)).toEqual(
                    report1.findings.map((f) => f.location.operationId)
                );
            }

            // Breaking changes should come before non-breaking
            const breakingIndices = report1.findings
                .map((f, i) => (f.severity === 'breaking' ? i : -1))
                .filter((i) => i >= 0);
            const nonBreakingIndices = report1.findings
                .map((f, i) => (f.severity === 'non-breaking' ? i : -1))
                .filter((i) => i >= 0);

            if (breakingIndices.length > 0 && nonBreakingIndices.length > 0) {
                expect(Math.max(...breakingIndices)).toBeLessThan(Math.min(...nonBreakingIndices));
            }
        });
    });
});

describe('formatDiffReportText', () => {
    const base = loadFixture('base.json');

    it('should format report with no changes', () => {
        const head = loadFixture('head-no-changes.json');
        const report = diffContract(base, head);
        const text = formatDiffReportText(report);

        expect(text).toContain('No changes detected');
        expect(text).toContain('Total Changes:     0');
    });

    it('should format report with breaking changes', () => {
        const head = loadFixture('head-endpoint-removed.json');
        const report = diffContract(base, head);
        const text = formatDiffReportText(report);

        expect(text).toContain('BREAKING CHANGES DETECTED');
        expect(text).toContain('BC001_ENDPOINT_REMOVED');
        expect(text).toContain('DELETE');
        expect(text).toContain('/users/{id}');
        expect(text).toContain('Next Steps');
    });

    it('should format report with non-breaking changes only', () => {
        const head = loadFixture('head-description-changed.json');
        const report = diffContract(base, head);
        const text = formatDiffReportText(report);

        expect(text).toContain('No breaking changes detected');
        expect(text).toContain('Non-Breaking Changes');
        expect(text).toContain('NC001_DESCRIPTION_CHANGED');
    });
});

describe('formatDiffReportJson', () => {
    const base = loadFixture('base.json');

    it('should format report as valid JSON', () => {
        const head = loadFixture('head-endpoint-removed.json');
        const report = diffContract(base, head);
        const json = formatDiffReportJson(report);

        const parsed = JSON.parse(json);
        expect(parsed.version).toBe('1.0');
        expect(parsed.hasBreakingChanges).toBe(true);
        expect(Array.isArray(parsed.findings)).toBe(true);
        expect(parsed.summary).toHaveProperty('total');
        expect(parsed.summary).toHaveProperty('breaking');
        expect(parsed.summary).toHaveProperty('nonBreaking');
    });

    it('should produce stable JSON output', () => {
        const head = loadFixture('head-multiple-breaking.json');
        const report1 = diffContract(base, head);
        const report2 = diffContract(base, head);

        // Remove timestamp for comparison
        const json1 = JSON.parse(formatDiffReportJson(report1));
        const json2 = JSON.parse(formatDiffReportJson(report2));
        delete json1.timestamp;
        delete json2.timestamp;

        expect(JSON.stringify(json1)).toBe(JSON.stringify(json2));
    });
});
