import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OverlaySelector } from '../src/components/OverlaySelector.js';
import * as HubClientContext from '../src/context/HubClientContext.js';

describe('OverlaySelector', () => {
  const mockListOverlays = vi.fn();
  const mockOnOverlayChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the useHubClient hook
    vi.spyOn(HubClientContext, 'useHubClient').mockReturnValue({
      listOverlays: mockListOverlays,
    } as any);
  });

  it('shows loading state initially', () => {
    mockListOverlays.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <OverlaySelector
        serviceName="orders"
        version="v1"
        selectedOverlay={null}
        onOverlayChange={mockOnOverlayChange}
      />
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders nothing when no overlays are available', async () => {
    mockListOverlays.mockResolvedValue({ overlays: [] });

    const { container } = render(
      <OverlaySelector
        serviceName="orders"
        version="v1"
        selectedOverlay={null}
        onOverlayChange={mockOnOverlayChange}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(container.firstChild).toBeNull();
  });

  it('loads and displays available overlays', async () => {
    mockListOverlays.mockResolvedValue({
      overlays: [
        { name: 'public', artifactPath: 'overlay.public.json' },
        { name: 'internal', artifactPath: 'overlay.internal.json' },
      ],
    });

    render(
      <OverlaySelector
        serviceName="orders"
        version="v1"
        selectedOverlay={null}
        onOverlayChange={mockOnOverlayChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('');

    // Check options
    expect(screen.getByText('Base (Full)')).toBeInTheDocument();
    expect(screen.getByText(/public/i)).toBeInTheDocument();
    expect(screen.getByText(/internal/i)).toBeInTheDocument();
  });

  it('calls onOverlayChange when overlay is selected', async () => {
    mockListOverlays.mockResolvedValue({
      overlays: [{ name: 'public', artifactPath: 'overlay.public.json' }],
    });

    render(
      <OverlaySelector
        serviceName="orders"
        version="v1"
        selectedOverlay={null}
        onOverlayChange={mockOnOverlayChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'public' } });

    expect(mockOnOverlayChange).toHaveBeenCalledWith('public');
  });

  it('calls onOverlayChange with null when Base view is selected', async () => {
    mockListOverlays.mockResolvedValue({
      overlays: [{ name: 'public', artifactPath: 'overlay.public.json' }],
    });

    render(
      <OverlaySelector
        serviceName="orders"
        version="v1"
        selectedOverlay="public"
        onOverlayChange={mockOnOverlayChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });

    expect(mockOnOverlayChange).toHaveBeenCalledWith(null);
  });

  it('displays selected overlay value', async () => {
    mockListOverlays.mockResolvedValue({
      overlays: [
        { name: 'public', artifactPath: 'overlay.public.json' },
        { name: 'internal', artifactPath: 'overlay.internal.json' },
      ],
    });

    render(
      <OverlaySelector
        serviceName="orders"
        version="v1"
        selectedOverlay="internal"
        onOverlayChange={mockOnOverlayChange}
      />
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox');
      expect(select).toHaveValue('internal');
    });
  });
});
