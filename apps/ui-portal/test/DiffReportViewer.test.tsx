/**
 * Tests for DiffReportViewer component
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiffReportViewer } from '../src/components/DiffReportViewer';
import type { DiffReport } from '@docsmyth/linter';

const mockDiffReport: DiffReport = {
  version: '1.0',
  timestamp: '2025-01-01T00:00:00Z',
  hasBreakingChanges: true,
  summary: {
    total: 3,
    breaking: 2,
    nonBreaking: 1,
  },
  findings: [
    {
      ruleId: 'BC001_ENDPOINT_REMOVED',
      severity: 'breaking',
      message: 'Endpoint DELETE /users/{id} was removed',
      location: {
        method: 'DELETE',
        path: '/users/{id}',
        operationId: 'deleteUser',
      },
      recommendation: 'Mark the endpoint as deprecated before removing it',
    },
    {
      ruleId: 'BC010_REQUEST_REQUIRED_ADDED',
      severity: 'breaking',
      message: 'Required parameter "email" was added to POST /users',
      location: {
        method: 'POST',
        path: '/users',
        operationId: 'createUser',
        jsonPath: 'requestBody.schema.properties.email',
      },
      previousValue: undefined,
      currentValue: { type: 'string', required: true },
    },
    {
      ruleId: 'NC001_DESCRIPTION_CHANGED',
      severity: 'non-breaking',
      message: 'Description was updated for GET /users',
      location: {
        method: 'GET',
        path: '/users',
        operationId: 'listUsers',
      },
      previousValue: 'List users',
      currentValue: 'List all users in the system',
    },
  ],
};

const emptyDiffReport: DiffReport = {
  version: '1.0',
  timestamp: '2025-01-01T00:00:00Z',
  hasBreakingChanges: false,
  summary: {
    total: 0,
    breaking: 0,
    nonBreaking: 0,
  },
  findings: [],
};

describe('DiffReportViewer', () => {
  it('should render summary statistics', () => {
    render(<DiffReportViewer report={mockDiffReport} />);

    expect(screen.getByText('2')).toBeInTheDocument(); // breaking
    expect(screen.getByText('1')).toBeInTheDocument(); // non-breaking
    expect(screen.getByText('3')).toBeInTheDocument(); // total
    expect(screen.getByText('Yes')).toBeInTheDocument(); // has breaking
  });

  it('should render all findings by default', () => {
    render(<DiffReportViewer report={mockDiffReport} />);

    expect(screen.getByText('Endpoint DELETE /users/{id} was removed')).toBeInTheDocument();
    expect(
      screen.getByText('Required parameter "email" was added to POST /users')
    ).toBeInTheDocument();
    expect(screen.getByText('Description was updated for GET /users')).toBeInTheDocument();
  });

  it('should filter to breaking only when toggle is checked', () => {
    render(<DiffReportViewer report={mockDiffReport} />);

    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);

    expect(screen.getByText('Endpoint DELETE /users/{id} was removed')).toBeInTheDocument();
    expect(
      screen.getByText('Required parameter "email" was added to POST /users')
    ).toBeInTheDocument();
    expect(screen.queryByText('Description was updated for GET /users')).not.toBeInTheDocument();
  });

  it('should display recommendation when present', () => {
    render(<DiffReportViewer report={mockDiffReport} />);

    expect(
      screen.getByText(/Mark the endpoint as deprecated before removing it/)
    ).toBeInTheDocument();
  });

  it('should show empty state when no changes', () => {
    render(<DiffReportViewer report={emptyDiffReport} />);

    expect(screen.getByText('No changes detected between these versions')).toBeInTheDocument();
  });

  it('should show no breaking changes message when filtering empty', () => {
    const noBreakingReport: DiffReport = {
      ...mockDiffReport,
      hasBreakingChanges: false,
      summary: { total: 1, breaking: 0, nonBreaking: 1 },
      findings: [mockDiffReport.findings[2]], // only non-breaking
    };

    render(<DiffReportViewer report={noBreakingReport} />);

    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);

    expect(screen.getByText('No breaking changes found')).toBeInTheDocument();
  });

  it('should display before/after values when present', () => {
    render(<DiffReportViewer report={mockDiffReport} />);

    expect(screen.getByText('List users')).toBeInTheDocument();
    expect(screen.getByText('List all users in the system')).toBeInTheDocument();
  });
});
