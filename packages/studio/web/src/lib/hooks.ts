/**
 * React Query Hooks for API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useCallback } from 'react';
import { api, type StreamStateUpdate, type StreamStatusUpdate } from './api';

// Query Keys
export const queryKeys = {
    config: ['config'] as const,
    contract: ['contract'] as const,
    evidenceSummary: ['evidence', 'summary'] as const,
    events: (params?: Record<string, unknown>) => ['evidence', 'events', params] as const,
    event: (index: number) => ['evidence', 'event', index] as const,
    coverage: (includeInvalid?: boolean) => ['coverage', includeInvalid] as const,
    issues: ['issues'] as const,
    examples: (operationId: string) => ['examples', operationId] as const,
    streamStatus: ['stream', 'status'] as const,
};

// Hooks
export function useConfig() {
    return useQuery({
        queryKey: queryKeys.config,
        queryFn: api.getConfig,
        staleTime: Infinity,
    });
}

export function useContract() {
    return useQuery({
        queryKey: queryKeys.contract,
        queryFn: api.getContract,
        retry: false,
    });
}

export function useValidateContract() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: api.validateContract,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.contract });
        },
    });
}

export function useInitContract() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({
            path,
            serviceName,
            version,
        }: {
            path: string;
            serviceName?: string;
            version?: string;
        }) => api.initContract(path, serviceName, version),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.contract });
            queryClient.invalidateQueries({ queryKey: queryKeys.config });
        },
    });
}

export function useEvidenceSummary() {
    return useQuery({
        queryKey: queryKeys.evidenceSummary,
        queryFn: api.getEvidenceSummary,
    });
}

export function useEvents(params?: {
    page?: number;
    pageSize?: number;
    operationId?: string;
    status?: number;
    valid?: boolean;
    q?: string;
}) {
    return useQuery({
        queryKey: queryKeys.events(params),
        queryFn: () => api.getEvents(params),
    });
}

export function useEvent(index: number | null) {
    return useQuery({
        queryKey: queryKeys.event(index ?? -1),
        queryFn: () => api.getEvent(index!),
        enabled: index !== null,
    });
}

export function useVerifyEvidence() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: api.verifyEvidence,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.evidenceSummary });
            queryClient.invalidateQueries({ queryKey: ['evidence', 'events'] });
            queryClient.invalidateQueries({ queryKey: queryKeys.issues });
            queryClient.invalidateQueries({ queryKey: ['coverage'] });
        },
    });
}

export function useCoverage(includeInvalid?: boolean) {
    return useQuery({
        queryKey: queryKeys.coverage(includeInvalid),
        queryFn: () => api.getCoverage(includeInvalid),
    });
}

export function useIssues() {
    return useQuery({
        queryKey: queryKeys.issues,
        queryFn: api.getIssues,
    });
}

export function useExamples(operationId: string | null) {
    return useQuery({
        queryKey: queryKeys.examples(operationId ?? ''),
        queryFn: () => api.getExamples(operationId!),
        enabled: !!operationId,
    });
}

export function useCompile() {
    return useMutation({
        mutationFn: api.compile,
    });
}

/**
 * Live stream state for evidence-only mode
 */
export interface LiveStreamState {
    isConnected: boolean;
    isWaiting: boolean;
    eventCount: number;
    status: 'connecting' | 'waiting' | 'ready' | 'error' | 'disabled';
    message: string;
    lastUpdate?: string;
}

/**
 * Hook for SSE streaming in evidence-only mode
 *
 * Connects to /api/stream and updates React Query cache
 * when server pushes new state after evidence changes.
 */
export function useLiveStream(enabled: boolean = true): LiveStreamState {
    const queryClient = useQueryClient();
    const eventSourceRef = useRef<EventSource | null>(null);
    const [state, setState] = useState<LiveStreamState>({
        isConnected: false,
        isWaiting: true,
        eventCount: 0,
        status: 'connecting',
        message: 'Connecting...',
    });

    const handleStateUpdate = useCallback((event: StreamStateUpdate) => {
        // Update React Query cache with new data
        queryClient.setQueryData(queryKeys.contract, event.data.contract);
        queryClient.setQueryData(queryKeys.evidenceSummary, event.data.evidenceSummary);
        queryClient.setQueryData(queryKeys.issues, event.data.issues);
        queryClient.setQueryData(queryKeys.coverage(true), event.data.coverage);

        // Also invalidate events so they refetch
        queryClient.invalidateQueries({ queryKey: ['evidence', 'events'] });

        setState({
            isConnected: true,
            isWaiting: event.data.isWaiting,
            eventCount: event.data.eventCount,
            status: event.data.isWaiting ? 'waiting' : 'ready',
            message: event.data.isWaiting
                ? 'Waiting for traffic...'
                : `${event.data.eventCount} events, ${event.data.contract.operations.length} operations`,
            lastUpdate: event.timestamp,
        });
    }, [queryClient]);

    const handleStatusUpdate = useCallback((event: StreamStatusUpdate) => {
        setState((prev) => ({
            ...prev,
            isConnected: event.status !== 'error',
            isWaiting: event.status === 'waiting',
            eventCount: event.eventCount,
            status: event.status,
            message: event.message,
            lastUpdate: event.timestamp,
        }));
    }, []);

    useEffect(() => {
        if (!enabled) {
            setState((prev) => ({
                ...prev,
                status: 'disabled',
                message: 'Live updates disabled',
                isConnected: false,
            }));
            return;
        }

        // Create EventSource connection
        const eventSource = new EventSource('/api/stream');
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
            setState((prev) => ({
                ...prev,
                isConnected: true,
                status: 'waiting',
                message: 'Connected, waiting for updates...',
            }));
        };

        eventSource.onerror = () => {
            setState((prev) => ({
                ...prev,
                isConnected: false,
                status: 'error',
                message: 'Connection lost, reconnecting...',
            }));
        };

        // Listen for state-update events
        eventSource.addEventListener('state-update', (e) => {
            try {
                const data = JSON.parse(e.data) as StreamStateUpdate;
                handleStateUpdate(data);
            } catch (err) {
                console.error('Failed to parse state-update:', err);
            }
        });

        // Listen for status events
        eventSource.addEventListener('status', (e) => {
            try {
                const data = JSON.parse(e.data) as StreamStatusUpdate;
                handleStatusUpdate(data);
            } catch (err) {
                console.error('Failed to parse status:', err);
            }
        });

        return () => {
            eventSource.close();
            eventSourceRef.current = null;
        };
    }, [enabled, handleStateUpdate, handleStatusUpdate]);

    return state;
}
