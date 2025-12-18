/**
 * @acp/linter - Types for breaking change detection
 */

/**
 * Severity levels for diff findings
 */
export type Severity = 'breaking' | 'non-breaking';

/**
 * Rule IDs for breaking change detection (v1)
 */
export type RuleId =
    // Endpoint changes
    | 'BC001_ENDPOINT_REMOVED'
    | 'BC002_OPERATION_ID_CHANGED'
    // Request schema changes
    | 'BC010_REQUEST_REQUIRED_ADDED'
    | 'BC011_TYPE_NARROWED'
    | 'BC012_ENUM_NARROWED'
    // Response changes
    | 'BC020_RESPONSE_STATUS_REMOVED'
    | 'BC021_RESPONSE_SCHEMA_NARROWED'
    // Non-breaking changes
    | 'NC001_DESCRIPTION_CHANGED';

/**
 * Location of a diff finding
 */
export interface DiffLocation {
    /** HTTP method */
    method?: string;
    /** HTTP path */
    path?: string;
    /** operationId */
    operationId?: string;
    /** JSON path within the operation (e.g., "requestBody.schema.properties.name") */
    jsonPath?: string;
}

/**
 * A single diff finding
 */
export interface DiffFinding {
    /** Rule ID */
    ruleId: RuleId;
    /** Severity level */
    severity: Severity;
    /** Location of the change */
    location: DiffLocation;
    /** Human-readable message */
    message: string;
    /** Recommended fix */
    recommendation?: string;
    /** Previous value (for context) */
    previousValue?: unknown;
    /** Current value (for context) */
    currentValue?: unknown;
}

/**
 * Summary of diff findings
 */
export interface DiffSummary {
    /** Total number of findings */
    total: number;
    /** Number of breaking changes */
    breaking: number;
    /** Number of non-breaking changes */
    nonBreaking: number;
}

/**
 * Complete diff report
 */
export interface DiffReport {
    /** Version of the diff report format */
    version: '1.0';
    /** Timestamp of when the diff was generated */
    timestamp: string;
    /** Summary of findings */
    summary: DiffSummary;
    /** All findings, sorted deterministically */
    findings: DiffFinding[];
    /** Whether the diff contains breaking changes */
    hasBreakingChanges: boolean;
}

/**
 * Options for diffing contracts
 */
export interface DiffOptions {
    /** Include non-breaking changes in the report */
    includeNonBreaking?: boolean;
}

/**
 * Rule definition for the diff engine
 */
export interface DiffRule {
    /** Rule ID */
    id: RuleId;
    /** Rule description */
    description: string;
    /** Severity level */
    severity: Severity;
    /** Check function that returns findings */
    check: (base: unknown, head: unknown) => DiffFinding[];
}
