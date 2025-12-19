import { useState, useEffect, useCallback } from 'react';
import { HubClientError, HubConnectionError } from '@docsmyth/hub-client';

interface AsyncState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    isConnectionError: boolean;
}

interface UseAsyncResult<T> extends AsyncState<T> {
    refetch: () => Promise<void>;
}

/**
 * Hook for async data fetching with proper error handling
 */
export function useAsync<T>(
    fetcher: () => Promise<T>,
    deps: unknown[] = []
): UseAsyncResult<T> {
    const [state, setState] = useState<AsyncState<T>>({
        data: null,
        loading: true,
        error: null,
        isConnectionError: false,
    });

    const execute = useCallback(async () => {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        try {
            const data = await fetcher();
            setState({ data, loading: false, error: null, isConnectionError: false });
        } catch (err) {
            const isConnectionError = err instanceof HubConnectionError;
            let errorMessage = 'An unexpected error occurred';

            if (err instanceof HubClientError) {
                errorMessage = err.message;
            } else if (err instanceof Error) {
                errorMessage = err.message;
            }

            setState({
                data: null,
                loading: false,
                error: errorMessage,
                isConnectionError,
            });
        }
    }, deps);

    useEffect(() => {
        execute();
    }, [execute]);

    return {
        ...state,
        refetch: execute,
    };
}
