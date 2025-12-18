/**
 * @acp/linter - API Contract Linter
 *
 * Breaking change detection and contract diffing for the API Contract Platform.
 */

export { diffContract, formatDiffReportText, formatDiffReportJson } from './diff.js';
export {
    checkEndpointRemoved,
    checkOperationIdChanged,
    checkRequestRequiredAdded,
    checkTypeNarrowed,
    checkEnumNarrowed,
    checkResponseStatusRemoved,
    checkResponseSchemaNarrowed,
    checkDescriptionChanged,
    v1Rules,
} from './rules.js';
export type {
    Severity,
    RuleId,
    DiffLocation,
    DiffFinding,
    DiffSummary,
    DiffReport,
    DiffOptions,
    DiffRule,
} from './types.js';
