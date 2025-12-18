import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { diffContract } from '@acp/linter';
import type { ContractIR } from '@acp/ir-spec';
import { useHubClient } from '../context/HubClientContext';
import { useAsync } from '../hooks/useAsync';
import { Loading } from '../components/Loading';
import { ErrorState } from '../components/ErrorState';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { DiffReportViewer } from '../components/DiffReportViewer';
import type { DiffReport } from '@acp/linter';

export function DiffPage() {
  const { service } = useParams<{ service: string }>();
  const client = useHubClient();

  // Fetch version list
  const {
    data: versionsData,
    loading: versionsLoading,
    error: versionsError,
    isConnectionError,
    refetch,
  } = useAsync(() => client.listVersions(service!), [client, service]);

  // Selected versions
  const [baseVersion, setBaseVersion] = useState<string>('');
  const [headVersion, setHeadVersion] = useState<string>('');

  // Diff state
  const [diffReport, setDiffReport] = useState<DiffReport | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Sort versions (most recent first) and set defaults
  const versions = useMemo(() => {
    const list = versionsData?.versions ?? [];
    // Versions should already be sorted by publish date desc
    return list.map((v) => v.version);
  }, [versionsData]);

  // Auto-select versions when data loads
  useMemo(() => {
    if (versions.length >= 2 && !baseVersion && !headVersion) {
      // Default: compare second-to-last (base) with latest (head)
      setBaseVersion(versions[1]);
      setHeadVersion(versions[0]);
    } else if (versions.length === 1 && !headVersion) {
      setHeadVersion(versions[0]);
    }
  }, [versions, baseVersion, headVersion]);

  // Run diff
  const runDiff = async () => {
    if (!baseVersion || !headVersion) {
      setDiffError('Please select both base and head versions');
      return;
    }

    if (baseVersion === headVersion) {
      setDiffError('Base and head versions must be different');
      return;
    }

    setDiffLoading(true);
    setDiffError(null);
    setDiffReport(null);

    try {
      const { base, head } = await client.getContractsForDiff(service!, baseVersion, headVersion);

      // Run diff using @acp/linter
      const report = diffContract(base.ir as ContractIR, head.ir as ContractIR, {
        includeNonBreaking: true,
      });

      setDiffReport(report);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Failed to compute diff');
    } finally {
      setDiffLoading(false);
    }
  };

  if (versionsLoading) {
    return <Loading message="Loading versions..." />;
  }

  if (versionsError) {
    return (
      <ErrorState
        title={isConnectionError ? 'Hub Unavailable' : 'Error Loading Versions'}
        message={versionsError}
        onRetry={refetch}
      />
    );
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Services', href: '/' },
          { label: service!, href: `/services/${encodeURIComponent(service!)}` },
          { label: 'Compare Versions' },
        ]}
      />

      <h1 style={{ marginBottom: 20 }}>Compare Versions</h1>

      {/* Version Selection */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card__body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 500 }}>Base:</label>
              <select
                className="select"
                value={baseVersion}
                onChange={(e) => setBaseVersion(e.target.value)}
              >
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={v} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </div>

            <span style={{ color: '#6b7280' }}>→</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 500 }}>Head:</label>
              <select
                className="select"
                value={headVersion}
                onChange={(e) => setHeadVersion(e.target.value)}
              >
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={v} value={v}>
                    v{v}
                    {v === versions[0] ? ' (latest)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="btn btn-primary"
              onClick={runDiff}
              disabled={!baseVersion || !headVersion || diffLoading}
            >
              {diffLoading ? 'Comparing...' : 'Compare'}
            </button>
          </div>

          {diffError && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                background: '#fee2e2',
                borderRadius: 6,
                color: '#991b1b',
              }}
            >
              {diffError}
            </div>
          )}
        </div>
      </div>

      {/* Diff Results */}
      {diffLoading && <Loading message="Computing diff..." />}

      {diffReport && !diffLoading && <DiffReportViewer report={diffReport} />}

      {/* Help text when no diff yet */}
      {!diffReport && !diffLoading && versions.length >= 2 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: 8,
            color: '#6b7280',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <div style={{ marginBottom: 8 }}>
            Select two versions and click <strong>Compare</strong> to see the diff
          </div>
          <div style={{ fontSize: 13 }}>Breaking changes will be highlighted in red</div>
        </div>
      )}

      {/* Not enough versions */}
      {versions.length < 2 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: 8,
            color: '#6b7280',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
          <div style={{ marginBottom: 8 }}>At least 2 versions are needed to compare</div>
          <div style={{ fontSize: 13 }}>Currently {versions.length} version(s) published</div>
          <Link
            to={`/services/${encodeURIComponent(service!)}`}
            className="btn btn-secondary"
            style={{ marginTop: 16 }}
          >
            View Versions
          </Link>
        </div>
      )}
    </div>
  );
}
