/**
 * Coverage Service
 *
 * Calculates coverage statistics from evidence against contracts.
 */

import type { ContractIR } from '@docsmyth/ir-spec';
import type { CoverageResponse, OperationCoverage } from '../types.js';
import { getEvents } from './evidence-service.js';

/**
 * Get coverage statistics
 */
export async function getCoverage(
    evidencePath: string | undefined,
    contract: ContractIR,
    includeInvalid: boolean = true,
    useCache: boolean = true
): Promise<CoverageResponse> {
    const operations: OperationCoverage[] = [];

    // Build coverage for each operation
    for (const op of contract.operations) {
        const definedStatuses = op.responses.map((r) => r.statusCode);
        const coveredStatuses: number[] = [];
        const statusBreakdown: Record<number, { total: number; valid: number; invalid: number }> = {};
        let requestCount = 0;
        let validRequestCount = 0;
        let invalidRequestCount = 0;
        let lastSeen: string | undefined;

        if (evidencePath) {
            // Get events for this operation
            const result = await getEvents(
                evidencePath,
                contract,
                { operationId: op.operationId, pageSize: 10000 },
                useCache
            );

            for (const event of result.events) {
                requestCount++;
                if (event.valid) {
                    validRequestCount++;
                } else {
                    invalidRequestCount++;
                }

                // Track status breakdown
                if (!statusBreakdown[event.status]) {
                    statusBreakdown[event.status] = { total: 0, valid: 0, invalid: 0 };
                }
                statusBreakdown[event.status].total++;
                if (event.valid) {
                    statusBreakdown[event.status].valid++;
                } else {
                    statusBreakdown[event.status].invalid++;
                }

                // Track covered statuses
                if (!coveredStatuses.includes(event.status)) {
                    coveredStatuses.push(event.status);
                }

                // Track last seen
                if (!lastSeen || event.timestamp > lastSeen) {
                    lastSeen = event.timestamp;
                }
            }
        }

        // Calculate coverage percentages
        const effectiveCoveredStatuses = coveredStatuses.filter((s) => {
            if (!includeInvalid) {
                const breakdown = statusBreakdown[s];
                return breakdown && breakdown.valid > 0;
            }
            return true;
        });

        const coveragePercent =
            definedStatuses.length > 0
                ? Math.round((effectiveCoveredStatuses.length / definedStatuses.length) * 100)
                : 0;

        const validOnlyCoveredStatuses = coveredStatuses.filter((s) => {
            const breakdown = statusBreakdown[s];
            return breakdown && breakdown.valid > 0;
        });
        const validCoveragePercent =
            definedStatuses.length > 0
                ? Math.round((validOnlyCoveredStatuses.length / definedStatuses.length) * 100)
                : 0;

        operations.push({
            operationId: op.operationId,
            method: op.method,
            path: op.path,
            definedStatuses: definedStatuses.sort((a, b) => a - b),
            coveredStatuses: coveredStatuses.sort((a, b) => a - b),
            requestCount,
            validRequestCount,
            invalidRequestCount,
            lastSeen,
            coveragePercent,
            validCoveragePercent,
            statusBreakdown,
        });
    }

    // Calculate overall stats
    const totalOperations = operations.length;
    const coveredOperations = operations.filter((op) => op.requestCount > 0).length;
    const overallCoveragePercent =
        totalOperations > 0 ? Math.round((coveredOperations / totalOperations) * 100) : 0;

    const validCoveredOperations = operations.filter((op) => op.validRequestCount > 0).length;
    const overallValidCoveragePercent =
        totalOperations > 0 ? Math.round((validCoveredOperations / totalOperations) * 100) : 0;

    return {
        operations,
        totalOperations,
        coveredOperations,
        overallCoveragePercent,
        overallValidCoveragePercent,
        includesInvalid: includeInvalid,
    };
}
