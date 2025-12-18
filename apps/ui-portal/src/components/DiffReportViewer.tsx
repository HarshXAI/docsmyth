import { useState } from 'react';
import type { DiffReport, DiffFinding } from '@acp/linter';

interface DiffReportViewerProps {
  report: DiffReport;
}

export function DiffReportViewer({ report }: DiffReportViewerProps) {
  const [showBreakingOnly, setShowBreakingOnly] = useState(false);

  const findings = showBreakingOnly
    ? report.findings.filter((f) => f.severity === 'breaking')
    : report.findings;

  return (
    <div>
      {/* Summary */}
      <div className="coverage-summary" style={{ marginBottom: 24 }}>
        <div className="coverage-stat">
          <div
            className="coverage-stat__value"
            style={{ color: report.hasBreakingChanges ? '#ef4444' : '#10b981' }}
          >
            {report.hasBreakingChanges ? 'Yes' : 'No'}
          </div>
          <div className="coverage-stat__label">Breaking Changes</div>
        </div>
        <div className="coverage-stat">
          <div className="coverage-stat__value" style={{ color: '#ef4444' }}>
            {report.summary.breaking}
          </div>
          <div className="coverage-stat__label">Breaking</div>
        </div>
        <div className="coverage-stat">
          <div className="coverage-stat__value" style={{ color: '#f59e0b' }}>
            {report.summary.nonBreaking}
          </div>
          <div className="coverage-stat__label">Non-Breaking</div>
        </div>
        <div className="coverage-stat">
          <div className="coverage-stat__value">{report.summary.total}</div>
          <div className="coverage-stat__label">Total Changes</div>
        </div>
      </div>

      {/* Filter Toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h3>Changes ({findings.length})</h3>
        <label className="toggle">
          <input
            type="checkbox"
            className="toggle__input"
            checked={showBreakingOnly}
            onChange={(e) => setShowBreakingOnly(e.target.checked)}
          />
          <span>Show breaking only</span>
        </label>
      </div>

      {/* Findings List */}
      {findings.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: 8,
            color: '#6b7280',
          }}
        >
          {showBreakingOnly ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div>No breaking changes found</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div>No changes detected between these versions</div>
            </>
          )}
        </div>
      ) : (
        <div>
          {findings.map((finding, index) => (
            <DiffFindingCard key={index} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}

interface DiffFindingCardProps {
  finding: DiffFinding;
}

function DiffFindingCard({ finding }: DiffFindingCardProps) {
  const isBreaking = finding.severity === 'breaking';

  return (
    <div className={`diff-finding ${isBreaking ? 'breaking' : 'non-breaking'}`}>
      <div className="diff-finding__header">
        <span className={`badge ${isBreaking ? 'badge-danger' : 'badge-warning'}`}>
          {isBreaking ? 'Breaking' : 'Non-Breaking'}
        </span>
        <span className="diff-finding__rule">{finding.ruleId}</span>
      </div>

      <div className="diff-finding__message">{finding.message}</div>

      {/* Location */}
      {(finding.location.method || finding.location.path) && (
        <div className="diff-finding__location">
          {finding.location.method && (
            <span
              style={{
                fontWeight: 600,
                marginRight: 8,
                textTransform: 'uppercase',
              }}
            >
              {finding.location.method}
            </span>
          )}
          {finding.location.path && <span>{finding.location.path}</span>}
          {finding.location.operationId && (
            <span style={{ color: '#6b7280', marginLeft: 8 }}>
              ({finding.location.operationId})
            </span>
          )}
          {finding.location.jsonPath && (
            <span
              style={{
                display: 'block',
                marginTop: 4,
                fontSize: 12,
                color: '#6b7280',
              }}
            >
              {finding.location.jsonPath}
            </span>
          )}
        </div>
      )}

      {/* Values */}
      {(finding.previousValue !== undefined || finding.currentValue !== undefined) && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {finding.previousValue !== undefined && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: '#6b7280' }}>Before: </span>
              <code
                style={{
                  background: '#fee2e2',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {formatValue(finding.previousValue)}
              </code>
            </div>
          )}
          {finding.currentValue !== undefined && (
            <div>
              <span style={{ color: '#6b7280' }}>After: </span>
              <code
                style={{
                  background: '#dcfce7',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {formatValue(finding.currentValue)}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Recommendation */}
      {finding.recommendation && (
        <div className="diff-finding__recommendation">
          <strong>💡 Recommendation:</strong> {finding.recommendation}
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
