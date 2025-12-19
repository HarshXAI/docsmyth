/**
 * Issues Service
 *
 * Aggregates and categorizes issues from evidence verification.
 */

import type { ContractIR } from '@docsmyth/ir-spec';
import type { VerificationError } from '@docsmyth/evidence-sdk';
import type { Issue, IssueType, IssuesResponse } from '../types.js';
import { verifyEvidence, getEvents, getEvent } from './evidence-service.js';

/**
 * UUID patterns for path normalization
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_PATTERN = /^\d+$/;
const OBJECTID_PATTERN = /^[0-9a-f]{24}$/i;

/**
 * Check if segment is likely a parameter
 */
function isLikelyParameter(segment: string): boolean {
    if (!segment) return false;
    if (NUMERIC_PATTERN.test(segment)) return true;
    if (UUID_PATTERN.test(segment)) return true;
    if (OBJECTID_PATTERN.test(segment)) return true;
    return false;
}

/**
 * Normalize path and suggest template
 */
function normalizePath(path: string): { template: string; paramCount: number } {
    const segments = path.split('/').filter(Boolean);
    const templateSegments: string[] = [];
    let paramCount = 0;

    for (const segment of segments) {
        if (isLikelyParameter(segment)) {
            paramCount++;
            templateSegments.push(`{param${paramCount}}`);
        } else {
            templateSegments.push(segment);
        }
    }

    return {
        template: '/' + templateSegments.join('/'),
        paramCount,
    };
}

/**
 * Infer semantic operation ID from method and path
 */
function inferOperationId(method: string, normalizedPath: string): string {
    const segments = normalizedPath.split('/').filter(Boolean);
    let lastNonParam: string | undefined;
    for (let i = segments.length - 1; i >= 0; i--) {
        if (!segments[i].startsWith('{')) {
            lastNonParam = segments[i];
            break;
        }
    }
    const hasParam = segments.some((s: string) => s.startsWith('{'));
    const resource = lastNonParam || 'resource';

    const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource;
    const plural = resource.endsWith('s') ? resource : resource + 's';
    const upperMethod = method.toUpperCase();

    const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

    if (upperMethod === 'GET' && !hasParam) return `list${capitalize(plural)}`;
    if (upperMethod === 'GET' && hasParam) return `get${capitalize(singular)}`;
    if (upperMethod === 'POST' && !hasParam) return `create${capitalize(singular)}`;
    if (upperMethod === 'PUT' && hasParam) return `update${capitalize(singular)}`;
    if (upperMethod === 'PATCH' && hasParam) return `patch${capitalize(singular)}`;
    if (upperMethod === 'DELETE' && hasParam) return `delete${capitalize(singular)}`;

    return `${method.toLowerCase()}${capitalize(resource)}`;
}

/**
 * Categorize a verification error into an issue type
 * In evidence-only mode, "unknown operation" should become "unmapped-event"
 */
function categorizeError(error: VerificationError, isEvidenceOnlyMode: boolean = false): IssueType {
    const message = error.message.toLowerCase();

    if (message.includes('unknown operation')) {
        // In evidence-only mode, treat as unmapped rather than unknown
        return isEvidenceOnlyMode ? 'unmapped-event' : 'unknown-operation';
    }
    if (message.includes('unexpected status')) {
        return 'unknown-status';
    }
    if (message.includes('required')) {
        return 'missing-required-field';
    }
    if (message.includes('type') || message.includes('should be')) {
        return 'type-mismatch';
    }
    if (message.includes('additional')) {
        return 'extra-field';
    }
    if (message.includes('schema') || message.includes('match')) {
        return 'schema-mismatch';
    }

    return 'invalid-evidence';
}

/**
 * Get all issues from evidence verification
 * @param isEvidenceOnlyMode - When true, use inferred contract as source of truth
 */
export async function getIssues(
    evidencePath: string | undefined,
    contract: ContractIR,
    useCache: boolean = true,
    isEvidenceOnlyMode: boolean = false
): Promise<IssuesResponse> {
    const issues: Issue[] = [];
    const byOperationId: Record<string, Issue[]> = {};
    const byType: Record<IssueType, Issue[]> = {
        'invalid-evidence': [],
        'schema-mismatch': [],
        'missing-required-field': [],
        'unknown-operation': [],
        'unknown-status': [],
        'extra-field': [],
        'type-mismatch': [],
        'unmapped-event': [],
    };

    if (!evidencePath) {
        return { issues, byOperationId, byType, totalCount: 0 };
    }

    // Get verification result
    const verification = await verifyEvidence(evidencePath, contract, useCache);

    // Convert errors to issues
    for (const error of verification.errors) {
        const type = categorizeError(error, isEvidenceOnlyMode);

        const issue: Issue = {
            type,
            operationId: error.operationId,
            eventIndex: error.eventIndex,
            message: error.message,
            path: error.schemaPath,
        };

        // For unmapped events, add suggestions
        if (type === 'unmapped-event' && error.eventIndex !== undefined) {
            try {
                const event = await getEvent(evidencePath, contract, error.eventIndex, useCache);
                const { template } = normalizePath(event.event.request.path);
                const proposedOpId = inferOperationId(event.event.request.method, template);
                issue.suggestion = {
                    normalizedPath: template,
                    proposedOperationId: proposedOpId,
                };
                issue.message = `Event could not be mapped to an inferred operation. Suggested: ${proposedOpId} (${event.event.request.method} ${template})`;
            } catch {
                // Keep original message if we can't get event details
            }
        }

        issues.push(issue);

        // Group by operation
        if (!byOperationId[error.operationId]) {
            byOperationId[error.operationId] = [];
        }
        byOperationId[error.operationId].push(issue);

        // Group by type
        byType[type].push(issue);
    }

    // Check for drift: operations in contract but not in evidence
    const coveredOps = new Set<string>();
    const events = await getEvents(evidencePath, contract, { pageSize: 10000 }, useCache);
    for (const event of events.events) {
        coveredOps.add(event.operationId);
    }

    // Note: We don't add "missing coverage" as an issue type, just for reference
    // The coverage service handles that

    return {
        issues,
        byOperationId,
        byType,
        totalCount: issues.length,
    };
}

/**
 * Get examples from evidence for an operation
 */
export async function getExamplesFromEvidence(
    evidencePath: string,
    contract: ContractIR,
    operationId: string,
    maxExamples: number = 3,
    validOnly: boolean = true,
    useCache: boolean = true
): Promise<Array<{ request: unknown; response: unknown; status: number; timestamp: string }>> {
    const examples: Array<{
        request: unknown;
        response: unknown;
        status: number;
        timestamp: string;
    }> = [];

    // Get events for this operation
    const result = await getEvents(
        evidencePath,
        contract,
        {
            operationId,
            valid: validOnly ? true : undefined,
            pageSize: maxExamples * 2, // Get a bit more to have variety
        },
        useCache
    );

    // Collect examples by status to get variety
    const byStatus = new Map<number, typeof examples>();

    for (const eventSummary of result.events) {
        if (!byStatus.has(eventSummary.status)) {
            byStatus.set(eventSummary.status, []);
        }
        const statusExamples = byStatus.get(eventSummary.status)!;
        if (statusExamples.length < maxExamples) {
            try {
                const fullEvent = await getEvent(evidencePath, contract, eventSummary.index, useCache);
                statusExamples.push({
                    request: fullEvent.event.request.body,
                    response: fullEvent.event.response.body,
                    status: fullEvent.event.response.status,
                    timestamp: fullEvent.event.timestamp,
                });
            } catch {
                // Skip failed reads
            }
        }
    }

    // Flatten and limit
    for (const statusExamples of byStatus.values()) {
        examples.push(...statusExamples);
    }

    return examples.slice(0, maxExamples);
}
