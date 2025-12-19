/**
 * Coverage Tab Component
 *
 * Shows coverage heatmap and statistics.
 */

import { useState } from 'react';
import { useCoverage } from '@/lib/hooks';
import { Loading, ErrorDisplay, EmptyState } from '@/components/States';
import { MethodBadge, StatusBadge, CoverageBadge } from '@/components/Badges';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, Activity, Grid } from 'lucide-react';
import { formatRelativeTime, cn } from '@/lib/utils';

export function CoverageTab() {
  const [includeInvalid, setIncludeInvalid] = useState(true);
  const { data: coverage, isLoading, error, refetch } = useCoverage(includeInvalid);

  if (isLoading) {
    return <Loading message="Loading coverage data..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay title="Coverage Error" message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!coverage || coverage.totalOperations === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="No Operations"
          description="No operations found in the contract. Add some operations to see coverage data."
          icon={<Grid className="h-12 w-12 text-muted-foreground mb-4" />}
        />
      </div>
    );
  }

  // Get all unique status codes across all operations
  const allStatuses = new Set<number>();
  coverage.operations.forEach((op) => {
    op.definedStatuses.forEach((s) => allStatuses.add(s));
    op.coveredStatuses.forEach((s) => allStatuses.add(s));
  });
  const statusColumns = Array.from(allStatuses).sort((a, b) => a - b);

  return (
    <div className="p-6 space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{coverage.overallCoveragePercent}%</div>
                <div className="text-sm text-muted-foreground">Overall Coverage</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {coverage.coveredOperations} / {coverage.totalOperations}
            </div>
            <div className="text-sm text-muted-foreground">Operations Covered</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {coverage.overallValidCoveragePercent}%
            </div>
            <div className="text-sm text-muted-foreground">Valid-only Coverage</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Include Invalid</div>
              <div className="text-xs text-muted-foreground">Show invalid events in counts</div>
            </div>
            <Select
              value={includeInvalid ? 'true' : 'false'}
              onValueChange={(v) => setIncludeInvalid(v === 'true')}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Coverage Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid className="h-5 w-5" />
            Coverage Heatmap
          </CardTitle>
          <CardDescription>
            Status code coverage per operation. Green = covered, gray = defined but not covered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 text-sm font-medium sticky left-0 bg-background z-10 min-w-[250px]">
                      Operation
                    </th>
                    {statusColumns.map((status) => (
                      <th key={status} className="text-center p-2 text-sm font-medium w-16">
                        <StatusBadge status={status} />
                      </th>
                    ))}
                    <th className="text-center p-2 text-sm font-medium w-20">Coverage</th>
                    <th className="text-center p-2 text-sm font-medium w-20">Requests</th>
                    <th className="text-left p-2 text-sm font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.operations.map((op) => (
                    <tr key={op.operationId} className="border-b hover:bg-accent/50">
                      <td className="p-2 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={op.method} />
                          <div>
                            <code className="text-sm font-mono">{op.path}</code>
                            <div className="text-xs text-muted-foreground">{op.operationId}</div>
                          </div>
                        </div>
                      </td>
                      {statusColumns.map((status) => {
                        const isDefined = op.definedStatuses.includes(status);
                        const isCovered = op.coveredStatuses.includes(status);
                        const breakdown = op.statusBreakdown[status];

                        return (
                          <td key={status} className="p-2 text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    'w-8 h-8 rounded mx-auto flex items-center justify-center text-xs font-medium',
                                    isCovered && breakdown?.valid > 0
                                      ? 'bg-green-500 text-white'
                                      : isCovered && breakdown?.invalid > 0
                                        ? 'bg-amber-500 text-white'
                                        : isDefined
                                          ? 'bg-muted text-muted-foreground'
                                          : 'bg-transparent'
                                  )}
                                >
                                  {isCovered && breakdown?.total}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {isCovered ? (
                                  <div className="text-xs">
                                    <div>Total: {breakdown?.total}</div>
                                    <div>Valid: {breakdown?.valid}</div>
                                    <div>Invalid: {breakdown?.invalid}</div>
                                  </div>
                                ) : isDefined ? (
                                  'Defined but not covered'
                                ) : (
                                  'Not in contract'
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center">
                        <CoverageBadge
                          percent={includeInvalid ? op.coveragePercent : op.validCoveragePercent}
                        />
                      </td>
                      <td className="p-2 text-center text-sm">
                        {includeInvalid ? op.requestCount : op.validRequestCount}
                      </td>
                      <td className="p-2 text-sm text-muted-foreground">
                        {op.lastSeen ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(op.lastSeen)}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500" />
          <span>Covered (valid)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-500" />
          <span>Covered (invalid only)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-muted" />
          <span>Defined but not covered</span>
        </div>
      </div>
    </div>
  );
}
