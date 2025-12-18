import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOverlay } from '../src/hooks/useOverlay.js';
import * as HubClientContext from '../src/context/HubClientContext.js';
import type { ContractIR, Overlay, OverlaySummary } from '@docsmyth/ir-spec';
import type { OpenAPIDocument } from '@docsmyth/hub-client';

// Mock the ir-sdk module
vi.mock('@docsmyth/ir-sdk', () => ({
  applyOverlay: vi.fn((ir: ContractIR, _overlay: Overlay) => {
    const summary: OverlaySummary = {
      hiddenOperationsCount: 2,
      schemaRedactionsCount: 1,
      responseRedactionsCount: 0,
      requestRedactionsCount: 0,
      hasServerOverrides: true,
      hiddenOperationIds: ['op1', 'op2'],
      redactedSchemaIds: ['Schema1'],
    };
    return {
      ir: { ...ir },
      summary,
    };
  }),
}));

describe('useOverlay', () => {
  const mockGetOverlay = vi.fn();

  const baseIR: ContractIR = {
    irVersion: '0.1',
    service: {
      name: 'TestService',
      version: 'v1',
    },
    operations: [
      {
        operationId: 'getOrders',
        method: 'GET',
        path: '/orders',
        responses: [{ statusCode: 200 }],
      },
    ],
    schemas: {},
  };

  const baseOpenApi: OpenAPIDocument = {
    openapi: '3.1.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the useHubClient hook
    vi.spyOn(HubClientContext, 'useHubClient').mockReturnValue({
      getOverlay: mockGetOverlay,
    } as any);
  });

  it('returns base state when no overlay is selected', () => {
    const { result } = renderHook(() =>
      useOverlay({
        serviceName: 'orders',
        version: 'v1',
        baseIR,
        baseOpenApi,
      })
    );

    expect(result.current.selectedOverlay).toBeNull();
    expect(result.current.appliedIR).toBe(baseIR);
    expect(result.current.appliedOpenApi).toBe(baseOpenApi);
    expect(result.current.overlaySummary).toBeNull();
    expect(result.current.applyingOverlay).toBe(false);
    expect(result.current.overlayError).toBeNull();
  });

  it('fetches and applies overlay when selected', async () => {
    const mockOverlay: Overlay = {
      irOverlayVersion: '0.1',
      name: 'public',
      hideOperations: [{ operationId: 'getOrders' }],
    };

    mockGetOverlay.mockResolvedValue(mockOverlay);

    const { result } = renderHook(() =>
      useOverlay({
        serviceName: 'orders',
        version: 'v1',
        baseIR,
        baseOpenApi,
      })
    );

    act(() => {
      result.current.selectOverlay('public');
    });

    expect(result.current.applyingOverlay).toBe(true);

    await waitFor(() => {
      expect(result.current.applyingOverlay).toBe(false);
    });

    expect(result.current.selectedOverlay).toBe('public');
    expect(result.current.appliedIR).toBeTruthy();
    expect(result.current.overlaySummary).toBeTruthy();
  });

  it('returns to base state when overlay is deselected', async () => {
    const mockOverlay: Overlay = {
      irOverlayVersion: '0.1',
      name: 'public',
      hideOperations: [],
    };

    mockGetOverlay.mockResolvedValue(mockOverlay);

    const { result } = renderHook(() =>
      useOverlay({
        serviceName: 'orders',
        version: 'v1',
        baseIR,
        baseOpenApi,
      })
    );

    // Select overlay
    act(() => {
      result.current.selectOverlay('public');
    });

    await waitFor(() => {
      expect(result.current.selectedOverlay).toBe('public');
    });

    // Deselect overlay
    act(() => {
      result.current.selectOverlay(null);
    });

    await waitFor(() => {
      expect(result.current.selectedOverlay).toBeNull();
    });

    expect(result.current.appliedIR).toBe(baseIR);
    expect(result.current.appliedOpenApi).toBe(baseOpenApi);
    expect(result.current.overlaySummary).toBeNull();
  });

  it('handles error when fetching overlay fails', async () => {
    mockGetOverlay.mockRejectedValue(new Error('Overlay not found'));

    const { result } = renderHook(() =>
      useOverlay({
        serviceName: 'orders',
        version: 'v1',
        baseIR,
        baseOpenApi,
      })
    );

    act(() => {
      result.current.selectOverlay('nonexistent');
    });

    await waitFor(() => {
      expect(result.current.overlayError).toBeTruthy();
    });

    expect(result.current.overlayError).toBe('Overlay not found');
    expect(result.current.applyingOverlay).toBe(false);
    expect(result.current.appliedIR).toBe(baseIR);
  });

  it('does not fetch overlay when baseIR is null', async () => {
    const { result } = renderHook(() =>
      useOverlay({
        serviceName: 'orders',
        version: 'v1',
        baseIR: null,
        baseOpenApi,
      })
    );

    act(() => {
      result.current.selectOverlay('public');
    });

    // Give it time to potentially fetch
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetOverlay).not.toHaveBeenCalled();
    expect(result.current.appliedIR).toBeNull();
  });
});
