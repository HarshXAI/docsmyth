import { useState, useEffect } from 'react';
import { useHubClient } from '../context/HubClientContext';
import type { OverlayInfo, OverlaysListResponse } from '@docsmyth/hub-client';

export interface OverlaySelectorProps {
  serviceName: string;
  version: string;
  selectedOverlay: string | null;
  onOverlayChange: (overlayName: string | null) => void;
}

/**
 * Overlay selector component for switching between Base/Public/Internal views
 */
export function OverlaySelector({
  serviceName,
  version,
  selectedOverlay,
  onOverlayChange,
}: OverlaySelectorProps) {
  const client = useHubClient();
  const [overlays, setOverlays] = useState<OverlayInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchOverlays = async () => {
      try {
        setLoading(true);
        setError(null);
        const response: OverlaysListResponse = await client.listOverlays(serviceName, version);
        if (mounted) {
          setOverlays(response.overlays);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load overlays');
          setLoading(false);
        }
      }
    };

    fetchOverlays();

    return () => {
      mounted = false;
    };
  }, [client, serviceName, version]);

  // Don't render if loading or error or no overlays available
  if (loading) {
    return (
      <div className="overlay-selector overlay-selector--loading">
        <span className="overlay-selector__label">View:</span>
        <span className="overlay-selector__loading">Loading...</span>
      </div>
    );
  }

  if (error) {
    return null; // Silently fail - base view will be shown
  }

  if (overlays.length === 0) {
    return null; // No overlays available
  }

  return (
    <div className="overlay-selector">
      <span className="overlay-selector__label">View:</span>
      <select
        className="overlay-selector__select"
        value={selectedOverlay ?? ''}
        onChange={(e) => onOverlayChange(e.target.value || null)}
        aria-label="Select overlay view"
      >
        <option value="">Base (Full)</option>
        {overlays.map((overlay) => (
          <option key={overlay.name} value={overlay.name}>
            {capitalizeFirst(overlay.name)}
          </option>
        ))}
      </select>
    </div>
  );
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
