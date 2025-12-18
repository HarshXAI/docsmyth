/**
 * Health endpoint for the proxy
 */

import type { ContractIR } from '@acp/ir-spec';

/**
 * Proxy health status response
 */
export interface ProxyHealthStatus {
    status: 'ok' | 'degraded' | 'error';
    proxy: {
        listening: boolean;
        listenAddress: string;
        targetUrl: string;
    };
    contract: {
        loaded: boolean;
        serviceName?: string;
        serviceVersion?: string;
        operationCount?: number;
    };
    capture: {
        enabled: boolean;
        eventsWritten: number;
        eventsDropped: number;
    };
    uptime: number;
}

/**
 * Create health status from current state
 */
export function createHealthStatus(
    listenAddress: string,
    targetUrl: string,
    contract: ContractIR | null,
    captureEnabled: boolean,
    eventsWritten: number,
    eventsDropped: number,
    startTime: number
): ProxyHealthStatus {
    const hasContract = contract !== null;

    return {
        status: hasContract ? 'ok' : 'degraded',
        proxy: {
            listening: true,
            listenAddress,
            targetUrl,
        },
        contract: {
            loaded: hasContract,
            serviceName: contract?.service.name,
            serviceVersion: contract?.service.version,
            operationCount: contract?.operations.length,
        },
        capture: {
            enabled: captureEnabled,
            eventsWritten,
            eventsDropped,
        },
        uptime: Math.floor((Date.now() - startTime) / 1000),
    };
}
