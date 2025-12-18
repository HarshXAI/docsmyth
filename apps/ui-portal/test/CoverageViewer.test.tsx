/**
 * Tests for CoverageViewer component
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoverageViewer } from '../src/components/CoverageViewer';
import type { CoverageReport } from '@docsmyth/hub-client';

const mockCoverageReport: CoverageReport = {
  version: '1.0',
  generatedAt: '2025-01-01T00:00:00Z',
  contract: {
    serviceName: 'orders-api',
    version: '1.0.0',
  },
  summary: {
    totalOperations: 5,
    coveredOperations: 3,
    coveragePercent: 60,
  },
  operations: [
    {
      operationId: 'listOrders',
      method: 'GET',
      path: '/orders',
      covered: true,
      exampleCount: 2,
    },
    {
      operationId: 'createOrder',
      method: 'POST',
      path: '/orders',
      covered: true,
      exampleCount: 1,
    },
    {
      operationId: 'getOrder',
      method: 'GET',
      path: '/orders/{id}',
      covered: true,
      exampleCount: 3,
    },
    {
      operationId: 'updateOrder',
      method: 'PUT',
      path: '/orders/{id}',
      covered: false,
      exampleCount: 0,
    },
    {
      operationId: 'deleteOrder',
      method: 'DELETE',
      path: '/orders/{id}',
      covered: false,
      exampleCount: 0,
    },
  ],
};

describe('CoverageViewer', () => {
  it('should render coverage percentage', () => {
    render(<CoverageViewer coverage={mockCoverageReport} />);

    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('should render coverage summary stats', () => {
    render(<CoverageViewer coverage={mockCoverageReport} />);

    expect(screen.getByText('3')).toBeInTheDocument(); // covered
    expect(screen.getByText('2')).toBeInTheDocument(); // missing
    expect(screen.getByText('5')).toBeInTheDocument(); // total
  });

  it('should render all operations', () => {
    render(<CoverageViewer coverage={mockCoverageReport} />);

    // /orders appears twice (GET and POST), so use getAllByText
    expect(screen.getAllByText('/orders')).toHaveLength(2);
    // /orders/{id} appears 3 times (GET, PUT, DELETE)
    expect(screen.getAllByText('/orders/{id}')).toHaveLength(3);
    expect(screen.getByText('listOrders')).toBeInTheDocument();
    expect(screen.getByText('createOrder')).toBeInTheDocument();
  });

  it('should show example counts for covered operations', () => {
    render(<CoverageViewer coverage={mockCoverageReport} />);

    expect(screen.getByText('(2)')).toBeInTheDocument(); // listOrders
    expect(screen.getByText('(3)')).toBeInTheDocument(); // getOrder
  });

  it('should show loading state', () => {
    render(<CoverageViewer coverage={null} loading={true} />);

    expect(screen.getByText('Loading coverage...')).toBeInTheDocument();
  });

  it('should show empty state when coverage not available', () => {
    render(<CoverageViewer coverage={null} error="Not found" />);

    expect(screen.getByText('Coverage Not Available')).toBeInTheDocument();
  });

  it('should show empty state when coverage is null without error', () => {
    render(<CoverageViewer coverage={null} />);

    expect(screen.getByText('No Coverage Data')).toBeInTheDocument();
  });
});
