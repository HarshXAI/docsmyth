import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { HubClient, createHubClient } from '@docsmyth/hub-client';

interface HubClientContextValue {
  client: HubClient;
  baseUrl: string;
}

const HubClientContext = createContext<HubClientContextValue | null>(null);

interface HubClientProviderProps {
  children: ReactNode;
  baseUrl?: string;
  token?: string;
}

/**
 * Get the hub base URL from environment or default
 */
function getHubBaseUrl(): string {
  // In development, we proxy through Vite
  if (import.meta.env.DEV) {
    return '/api';
  }
  // In production, use environment variable or same origin
  return import.meta.env.VITE_HUB_URL || window.location.origin;
}

export function HubClientProvider({
  children,
  baseUrl = getHubBaseUrl(),
  token,
}: HubClientProviderProps) {
  const value = useMemo(() => {
    const client = createHubClient({
      baseUrl,
      token,
      timeout: 30000,
    });
    return { client, baseUrl };
  }, [baseUrl, token]);

  return <HubClientContext.Provider value={value}>{children}</HubClientContext.Provider>;
}

export function useHubClient(): HubClient {
  const context = useContext(HubClientContext);
  if (!context) {
    throw new Error('useHubClient must be used within a HubClientProvider');
  }
  return context.client;
}

export function useHubBaseUrl(): string {
  const context = useContext(HubClientContext);
  if (!context) {
    throw new Error('useHubBaseUrl must be used within a HubClientProvider');
  }
  return context.baseUrl;
}
