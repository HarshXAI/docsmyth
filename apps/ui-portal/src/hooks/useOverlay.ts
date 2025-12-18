import { useState, useEffect, useCallback } from 'react';
import { useHubClient } from '../context/HubClientContext';
import type { ContractIR, Overlay, OverlaySummary } from '@docsmyth/ir-spec';
import { applyOverlay } from '@docsmyth/ir-sdk';
import type { OpenAPIDocument } from '@docsmyth/hub-client';

export interface UseOverlayState {
    /** Currently selected overlay name (null = base) */
    selectedOverlay: string | null;
    /** Select an overlay */
    selectOverlay: (overlayName: string | null) => void;
    /** The applied contract IR (with overlay applied if selected) */
    appliedIR: ContractIR | null;
    /** The applied OpenAPI document (recompiled if overlay applied client-side) */
    appliedOpenApi: OpenAPIDocument | null;
    /** Summary of overlay effects */
    overlaySummary: OverlaySummary | null;
    /** Loading state for overlay application */
    applyingOverlay: boolean;
    /** Error during overlay application */
    overlayError: string | null;
}

export interface UseOverlayOptions {
    serviceName: string;
    version: string;
    baseIR: ContractIR | null;
    baseOpenApi: OpenAPIDocument | null;
}

/**
 * Hook for managing overlay selection and application
 *
 * Fetches overlay from hub and applies it client-side to the base IR
 */
export function useOverlay({
    serviceName,
    version,
    baseIR,
    baseOpenApi,
}: UseOverlayOptions): UseOverlayState {
    const client = useHubClient();
    const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
    const [appliedIR, setAppliedIR] = useState<ContractIR | null>(null);
    const [appliedOpenApi, setAppliedOpenApi] = useState<OpenAPIDocument | null>(null);
    const [overlaySummary, setOverlaySummary] = useState<OverlaySummary | null>(null);
    const [applyingOverlay, setApplyingOverlay] = useState(false);
    const [overlayError, setOverlayError] = useState<string | null>(null);

    // When base IR or base OpenApi changes, reset applied state
    useEffect(() => {
        if (!selectedOverlay) {
            setAppliedIR(baseIR);
            setAppliedOpenApi(baseOpenApi);
            setOverlaySummary(null);
        }
    }, [baseIR, baseOpenApi, selectedOverlay]);

    // Apply overlay when selected
    useEffect(() => {
        if (!selectedOverlay || !baseIR) {
            // Reset to base
            setAppliedIR(baseIR);
            setAppliedOpenApi(baseOpenApi);
            setOverlaySummary(null);
            setOverlayError(null);
            return;
        }

        let mounted = true;

        const fetchAndApplyOverlay = async () => {
            setApplyingOverlay(true);
            setOverlayError(null);

            try {
                // Fetch overlay from hub
                const overlay = await client.getOverlay<Overlay>(serviceName, version, selectedOverlay);

                if (!mounted) return;

                // Apply overlay to base IR client-side
                const result = applyOverlay(baseIR, overlay);

                if (!mounted) return;

                setAppliedIR(result.ir);
                setOverlaySummary(result.summary);

                // For OpenAPI, we'd ideally recompile the IR
                // For now, just apply server overrides to the existing OpenAPI
                if (baseOpenApi && overlay.serverOverrides) {
                    const modifiedOpenApi = applyServerOverridesToOpenApi(baseOpenApi, overlay.serverOverrides);
                    setAppliedOpenApi(modifiedOpenApi);
                } else {
                    // Keep base OpenAPI for now (full recompilation would require compiler-openapi)
                    setAppliedOpenApi(baseOpenApi);
                }

                setApplyingOverlay(false);
            } catch (err) {
                if (!mounted) return;
                setOverlayError(err instanceof Error ? err.message : 'Failed to apply overlay');
                setApplyingOverlay(false);
                // Fall back to base
                setAppliedIR(baseIR);
                setAppliedOpenApi(baseOpenApi);
                setOverlaySummary(null);
            }
        };

        fetchAndApplyOverlay();

        return () => {
            mounted = false;
        };
    }, [selectedOverlay, baseIR, baseOpenApi, client, serviceName, version]);

    const selectOverlay = useCallback((overlayName: string | null) => {
        setSelectedOverlay(overlayName);
    }, []);

    return {
        selectedOverlay,
        selectOverlay,
        appliedIR,
        appliedOpenApi,
        overlaySummary,
        applyingOverlay,
        overlayError,
    };
}

/**
 * Apply server overrides to an OpenAPI document
 */
function applyServerOverridesToOpenApi(
    openApi: OpenAPIDocument,
    serverOverrides: Overlay['serverOverrides']
): OpenAPIDocument {
    if (!openApi.servers || !serverOverrides || serverOverrides.length === 0) {
        return openApi;
    }

    const newServers = openApi.servers.map((server) => {
        let url = server.url;

        for (const override of serverOverrides) {
            if (override.isRegex) {
                try {
                    const regex = new RegExp(override.pattern, 'g');
                    url = url.replace(regex, override.replacement);
                } catch {
                    // Invalid regex, skip
                }
            } else {
                if (url === override.pattern) {
                    url = override.replacement;
                } else if (url.includes(override.pattern)) {
                    url = url.replace(override.pattern, override.replacement);
                }
            }
        }

        return { ...server, url };
    });

    return { ...openApi, servers: newServers };
}
