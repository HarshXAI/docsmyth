import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverlaySummaryBadge } from '../src/components/OverlaySummaryBadge.js';
import type { OverlaySummary } from '@acp/ir-spec';

describe('OverlaySummaryBadge', () => {
  const baseSummary: OverlaySummary = {
    hiddenOperationsCount: 0,
    schemaRedactionsCount: 0,
    responseRedactionsCount: 0,
    requestRedactionsCount: 0,
    hasServerOverrides: false,
    hiddenOperationIds: [],
    redactedSchemaIds: [],
  };

  it('returns null when summary has no effects', () => {
    const { container } = render(
      <OverlaySummaryBadge summary={baseSummary} overlayName="public" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('displays hidden operations count', () => {
    const summary: OverlaySummary = {
      ...baseSummary,
      hiddenOperationsCount: 3,
      hiddenOperationIds: ['op1', 'op2', 'op3'],
    };

    render(<OverlaySummaryBadge summary={summary} overlayName="public" />);
    expect(screen.getByText(/Hidden ops: 3/i)).toBeInTheDocument();
  });

  it('displays schema redactions count', () => {
    const summary: OverlaySummary = {
      ...baseSummary,
      schemaRedactionsCount: 2,
      redactedSchemaIds: ['Schema1', 'Schema2'],
    };

    render(<OverlaySummaryBadge summary={summary} overlayName="internal" />);
    expect(screen.getByText(/Schema redactions: 2/i)).toBeInTheDocument();
  });

  it('displays response redactions count', () => {
    const summary: OverlaySummary = {
      ...baseSummary,
      responseRedactionsCount: 1,
    };

    render(<OverlaySummaryBadge summary={summary} overlayName="public" />);
    expect(screen.getByText(/Response redactions: 1/i)).toBeInTheDocument();
  });

  it('displays request redactions count', () => {
    const summary: OverlaySummary = {
      ...baseSummary,
      requestRedactionsCount: 2,
    };

    render(<OverlaySummaryBadge summary={summary} overlayName="public" />);
    expect(screen.getByText(/Request redactions: 2/i)).toBeInTheDocument();
  });

  it('displays server rewrite indicator', () => {
    const summary: OverlaySummary = {
      ...baseSummary,
      hasServerOverrides: true,
    };

    render(<OverlaySummaryBadge summary={summary} overlayName="external" />);
    expect(screen.getByText(/Servers: Rewritten/i)).toBeInTheDocument();
  });

  it('displays all indicators when all effects are present', () => {
    const summary: OverlaySummary = {
      hiddenOperationsCount: 5,
      schemaRedactionsCount: 3,
      responseRedactionsCount: 2,
      requestRedactionsCount: 1,
      hasServerOverrides: true,
      hiddenOperationIds: ['a', 'b', 'c', 'd', 'e'],
      redactedSchemaIds: ['S1', 'S2', 'S3'],
    };

    render(<OverlaySummaryBadge summary={summary} overlayName="full" />);

    expect(screen.getByText(/Hidden ops: 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Schema redactions: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Response redactions: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Request redactions: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Servers: Rewritten/i)).toBeInTheDocument();
  });

  it('displays overlay name in the label', () => {
    const summary: OverlaySummary = {
      ...baseSummary,
      hiddenOperationsCount: 1,
      hiddenOperationIds: ['test'],
    };

    render(<OverlaySummaryBadge summary={summary} overlayName="public" />);
    expect(screen.getByText(/Public/i)).toBeInTheDocument();
    expect(screen.getByText(/overlay applied:/i)).toBeInTheDocument();
  });
});
