import type { CoverageReport } from '@acp/hub-client';
import { EmptyState } from './EmptyState';

interface CoverageViewerProps {
  coverage: CoverageReport | null;
  loading?: boolean;
  error?: string | null;
}

export function CoverageViewer({ coverage, loading, error }: CoverageViewerProps) {
  if (loading) {
    return (
      <div className="loading">
        <div className="loading__spinner" />
        <span>Loading coverage...</span>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="📊"
        title="Coverage Not Available"
        description="No coverage data has been published for this version. Run your tests with evidence collection and publish coverage using the CLI."
      />
    );
  }

  if (!coverage) {
    return (
      <EmptyState
        icon="📊"
        title="No Coverage Data"
        description="Coverage information has not been collected for this contract version."
      />
    );
  }

  const { summary, operations } = coverage;
  const coveragePercent = Math.round(summary.coveragePercent);

  return (
    <div>
      {/* Summary Stats */}
      <div className="coverage-summary">
        <div className="coverage-stat">
          <div
            className="coverage-stat__value"
            style={{
              color:
                coveragePercent >= 80 ? '#10b981' : coveragePercent >= 50 ? '#f59e0b' : '#ef4444',
            }}
          >
            {coveragePercent}%
          </div>
          <div className="coverage-stat__label">Coverage</div>
          <div className="coverage-bar">
            <div
              className="coverage-bar__fill"
              style={{
                width: `${coveragePercent}%`,
                background:
                  coveragePercent >= 80 ? '#10b981' : coveragePercent >= 50 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
        </div>
        <div className="coverage-stat">
          <div className="coverage-stat__value" style={{ color: '#10b981' }}>
            {summary.coveredOperations}
          </div>
          <div className="coverage-stat__label">Covered Operations</div>
        </div>
        <div className="coverage-stat">
          <div className="coverage-stat__value" style={{ color: '#6b7280' }}>
            {summary.totalOperations - summary.coveredOperations}
          </div>
          <div className="coverage-stat__label">Missing</div>
        </div>
        <div className="coverage-stat">
          <div className="coverage-stat__value">{summary.totalOperations}</div>
          <div className="coverage-stat__label">Total Operations</div>
        </div>
      </div>

      {/* Operations List */}
      <div className="card">
        <div className="card__header">
          <h3 className="card__title">Operations</h3>
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            {summary.coveredOperations} of {summary.totalOperations} covered
          </span>
        </div>
        <div>
          {operations.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>
              No operations found
            </div>
          ) : (
            operations.map((op) => (
              <div key={op.operationId} className="operation-coverage">
                <div
                  className={`operation-coverage__status ${op.covered ? 'covered' : 'missing'}`}
                />
                <span className={`operation-coverage__method ${op.method.toLowerCase()}`}>
                  {op.method}
                </span>
                <span className="operation-coverage__path">{op.path}</span>
                <span className="operation-coverage__id">
                  {op.operationId}
                  {op.covered && op.exampleCount > 0 && (
                    <span style={{ marginLeft: 8 }} title={`${op.exampleCount} example(s)`}>
                      ({op.exampleCount})
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
