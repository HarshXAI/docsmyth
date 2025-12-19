/**
 * Studio Types
 *
 * Core type definitions for the Docsmyth Studio server.
 */

import type { ContractIR } from '@docsmyth/ir-spec';
import type { EvidenceEvent, VerificationError } from '@docsmyth/evidence-sdk';

/**
 * Studio configuration
 */
export interface StudioConfig {
    contractPath: string;
    evidencePath?: string;
    port: number;
    host: string;
    enableCaching: boolean;
}

/**
 * Cache entry for file data
 */
export interface CacheEntry<T> {
    data: T;
    mtime: number;
    size: number;
}

/**
 * Evidence summary statistics
 */
export interface EvidenceSummary {
    totalEvents: number;
    validEvents: number;
    invalidEvents: number;
    byOperationId: Record<string, { total: number; valid: number; invalid: number }>;
    byStatus: Record<number, number>;
    firstTimestamp?: string;
    lastTimestamp?: string;
}

/**
 * Lightweight event summary for list views
 */
export interface EventSummary {
    index: number;
    operationId: string;
    method: string;
    path: string;
    status: number;
    timestamp: string;
    valid: boolean;
    errorCount?: number;
}

/**
 * Paginated events response
 */
export interface PaginatedEventsResponse {
    events: EventSummary[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

/**
 * Full event with validation info
 */
export interface FullEventResponse {
    event: EvidenceEvent;
    index: number;
    valid: boolean;
    errors: VerificationError[];
}

/**
 * Coverage for a single operation
 */
export interface OperationCoverage {
    operationId: string;
    method: string;
    path: string;
    definedStatuses: number[];
    coveredStatuses: number[];
    requestCount: number;
    validRequestCount: number;
    invalidRequestCount: number;
    lastSeen?: string;
    coveragePercent: number;
    validCoveragePercent: number;
    statusBreakdown: Record<number, { total: number; valid: number; invalid: number }>;
}

/**
 * Overall coverage response
 */
export interface CoverageResponse {
    operations: OperationCoverage[];
    totalOperations: number;
    coveredOperations: number;
    overallCoveragePercent: number;
    overallValidCoveragePercent: number;
    includesInvalid: boolean;
}

/**
 * Issue types
 */
export type IssueType =
    | 'invalid-evidence'
    | 'schema-mismatch'
    | 'missing-required-field'
    | 'unknown-operation'
    | 'unknown-status'
    | 'extra-field'
    | 'type-mismatch'
    | 'unmapped-event';

/**
 * A single issue
 */
export interface Issue {
    type: IssueType;
    operationId: string;
    eventIndex?: number;
    message: string;
    path?: string;
    expected?: string;
    actual?: string;
    timestamp?: string;
    /** Suggested fix for unmapped events */
    suggestion?: {
        normalizedPath?: string;
        proposedOperationId?: string;
    };
}

/**
 * Grouped issues response
 */
export interface IssuesResponse {
    issues: Issue[];
    byOperationId: Record<string, Issue[]>;
    byType: Record<IssueType, Issue[]>;
    totalCount: number;
}

/**
 * Contract validation result
 */
export interface ContractValidationResult {
    ok: boolean;
    errors: Array<{ path: string; message: string; code: string }>;
    warnings: Array<{ path: string; message: string; code: string }>;
}

/**
 * Evidence verification result
 */
export interface EvidenceVerificationResult {
    ok: boolean;
    totalEvents: number;
    validEvents: number;
    invalidEvents: number;
    errors: VerificationError[];
}

/**
 * Compile result
 */
export interface CompileResult {
    ok: boolean;
    openapiJson?: unknown;
    error?: string;
}

/**
 * Init contract request
 */
export interface InitContractRequest {
    path: string;
    serviceName?: string;
    title?: string;
    version?: string;
}

/**
 * Minimal contract IR for initialization
 */
export function createMinimalContract(
    serviceName: string = 'my-api',
    version: string = '1.0.0'
): ContractIR {
    return {
        irVersion: '0.1',
        service: {
            name: serviceName,
            version: version,
        },
        schemas: {},
        operations: [],
    };
}
