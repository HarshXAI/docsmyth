/**
 * API Client
 *
 * Functions for interacting with the Studio API.
 */

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
}

// Types
export interface StudioConfig {
    contractPath: string;
    evidencePath?: string;
    hasEvidence: boolean;
    hasContract: boolean;
    evidenceOnlyMode?: boolean;
}

export interface ContractIR {
    irVersion: string;
    service: {
        name: string;
        version: string;
        description?: string;
        baseUrls?: string[];
    };
    schemas: Record<string, unknown>;
    operations: Operation[];
    securitySchemes?: Record<string, unknown>;
}

export interface Operation {
    operationId: string;
    method: string;
    path: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses: Response[];
    deprecated?: boolean;
}

export interface Parameter {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: unknown;
}

export interface RequestBody {
    description?: string;
    required?: boolean;
    contentType?: string;
    schema?: unknown;
}

export interface Response {
    statusCode: number;
    description?: string;
    contentType?: string;
    schema?: unknown;
}

export interface ValidationResult {
    ok: boolean;
    errors: Array<{ path: string; message: string; code: string }>;
    warnings: Array<{ path: string; message: string; code: string }>;
}

export interface EvidenceSummary {
    totalEvents: number;
    validEvents: number;
    invalidEvents: number;
    byOperationId: Record<string, { total: number; valid: number; invalid: number }>;
    byStatus: Record<number, number>;
    firstTimestamp?: string;
    lastTimestamp?: string;
    hasEvidence: boolean;
}

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

export interface PaginatedEvents {
    events: EventSummary[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

export interface FullEvent {
    event: {
        evidenceVersion: string;
        operationId: string;
        protocol: string;
        timestamp: string;
        traceId?: string;
        request: {
            method: string;
            path: string;
            query?: Record<string, unknown>;
            params?: Record<string, string>;
            headers?: Record<string, string>;
            body?: unknown;
        };
        response: {
            status: number;
            headers?: Record<string, string>;
            body?: unknown;
        };
    };
    index: number;
    valid: boolean;
    errors: VerificationError[];
}

export interface VerificationError {
    eventIndex: number;
    operationId: string;
    phase: string;
    schemaPath: string;
    message: string;
    dataPath?: string;
}

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

export interface CoverageResponse {
    operations: OperationCoverage[];
    totalOperations: number;
    coveredOperations: number;
    overallCoveragePercent: number;
    overallValidCoveragePercent: number;
    includesInvalid: boolean;
}

export interface Issue {
    type: string;
    operationId: string;
    eventIndex?: number;
    message: string;
    path?: string;
    expected?: string;
    actual?: string;
    timestamp?: string;
    suggestion?: {
        normalizedPath?: string;
        proposedOperationId?: string;
    };
}

export interface IssuesResponse {
    issues: Issue[];
    byOperationId: Record<string, Issue[]>;
    byType: Record<string, Issue[]>;
    totalCount: number;
}

export interface ExamplesResponse {
    examples: Array<{
        request: unknown;
        response: unknown;
        status: number;
        timestamp: string;
    }>;
}

export interface CompileResult {
    ok: boolean;
    openapiJson?: unknown;
    error?: string;
}

export interface VerifyResult {
    ok: boolean;
    totalEvents: number;
    validEvents: number;
    invalidEvents: number;
    errors: VerificationError[];
}

/**
 * SSE Stream state update from server
 */
export interface StreamStateUpdate {
    type: 'state-update';
    timestamp: string;
    data: {
        contract: ContractIR;
        evidenceSummary: EvidenceSummary;
        issues: IssuesResponse;
        coverage: CoverageResponse;
        eventCount: number;
        isWaiting: boolean;
    };
}

/**
 * SSE Stream status update
 */
export interface StreamStatusUpdate {
    type: 'status';
    timestamp: string;
    status: 'waiting' | 'ready' | 'error';
    message: string;
    eventCount: number;
}

export type StreamEvent = StreamStateUpdate | StreamStatusUpdate;

/**
 * Stream status for the UI
 */
export interface StreamStatus {
    enabled: boolean;
    evidencePath?: string;
    serviceName?: string;
    reason?: string;
}

// API Functions
export const api = {
    // Config
    getConfig: () => fetchJson<StudioConfig & { streamEnabled?: boolean }>('/config'),

    // Contract
    getContract: () => fetchJson<ContractIR>('/contract'),
    validateContract: () =>
        fetchJson<ValidationResult>('/contract/validate', { method: 'POST', body: '{}' }),
    initContract: (path: string, serviceName?: string, version?: string) =>
        fetchJson<{ ok: boolean; path: string }>('/contract/init', {
            method: 'POST',
            body: JSON.stringify({ path, serviceName, version }),
        }),

    // Evidence
    getEvidenceSummary: () => fetchJson<EvidenceSummary>('/evidence/summary'),
    getEvents: (params?: {
        page?: number;
        pageSize?: number;
        operationId?: string;
        status?: number;
        valid?: boolean;
        q?: string;
    }) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
        if (params?.operationId) searchParams.set('operationId', params.operationId);
        if (params?.status) searchParams.set('status', String(params.status));
        if (params?.valid !== undefined) searchParams.set('valid', String(params.valid));
        if (params?.q) searchParams.set('q', params.q);
        const query = searchParams.toString();
        return fetchJson<PaginatedEvents>(`/evidence/events${query ? `?${query}` : ''}`);
    },
    getEvent: (index: number) => fetchJson<FullEvent>(`/evidence/event/${index}`),
    verifyEvidence: () =>
        fetchJson<VerifyResult>('/evidence/verify', { method: 'POST', body: '{}' }),

    // Coverage
    getCoverage: (includeInvalid?: boolean) => {
        const query = includeInvalid === false ? '?includeInvalid=false' : '';
        return fetchJson<CoverageResponse>(`/coverage${query}`);
    },

    // Issues
    getIssues: () => fetchJson<IssuesResponse>('/issues'),

    // Examples
    getExamples: (operationId: string, maxExamples?: number, validOnly?: boolean) => {
        const searchParams = new URLSearchParams();
        if (maxExamples) searchParams.set('maxExamples', String(maxExamples));
        if (validOnly !== undefined) searchParams.set('validOnly', String(validOnly));
        const query = searchParams.toString();
        return fetchJson<ExamplesResponse>(`/examples/${operationId}${query ? `?${query}` : ''}`);
    },

    // Compile
    compile: () => fetchJson<CompileResult>('/compile', { method: 'POST', body: '{}' }),

    // SSE Stream
    getStreamStatus: () => fetchJson<StreamStatus>('/stream/status'),
    triggerStreamRefresh: () =>
        fetchJson<{ ok: boolean; message: string }>('/stream/refresh', {
            method: 'POST',
            body: '{}',
        }),
};
