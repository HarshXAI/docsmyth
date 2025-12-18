import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useHubClient, useHubBaseUrl } from '../context/HubClientContext';
import { useAsync } from '../hooks/useAsync';
import { useOverlay } from '../hooks/useOverlay';
import { Loading } from '../components/Loading';
import { ErrorState } from '../components/ErrorState';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { OpenAPIViewer } from '../components/OpenAPIViewer';
import { CoverageViewer } from '../components/CoverageViewer';
import { OverlaySelector } from '../components/OverlaySelector';
import { OverlaySummaryBadge } from '../components/OverlaySummaryBadge';
import type { CoverageReport, OpenAPIDocument } from '@docsmyth/hub-client';

type TabId = 'docs' | 'coverage' | 'raw';

export function VersionDetailPage() {
  const { service, version } = useParams<{ service: string; version: string }>();
  const client = useHubClient();
  const hubBaseUrl = useHubBaseUrl();
  const [activeTab, setActiveTab] = useState<TabId>('docs');

  // Fetch contract metadata
  const {
    data: contract,
    loading,
    error,
    isConnectionError,
    refetch,
  } = useAsync(() => client.getContract(service!, version!), [client, service, version]);

  // Fetch OpenAPI (lazy, only when docs tab is active)
  const [openApi, setOpenApi] = useState<OpenAPIDocument | null>(null);
  const [openApiLoading, setOpenApiLoading] = useState(false);
  const [openApiError, setOpenApiError] = useState<string | null>(null);

  // Fetch Coverage (lazy)
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  // Overlay state
  const {
    selectedOverlay,
    selectOverlay,
    appliedIR,
    appliedOpenApi,
    overlaySummary,
    applyingOverlay,
    overlayError,
  } = useOverlay({
    serviceName: service!,
    version: version!,
    baseIR: contract?.ir ?? null,
    baseOpenApi: openApi,
  });

  // Load OpenAPI when docs tab is active
  useEffect(() => {
    if (activeTab === 'docs' && !openApi && !openApiLoading && !openApiError) {
      setOpenApiLoading(true);
      client
        .getOpenApi(service!, version!)
        .then((data) => {
          setOpenApi(data);
          setOpenApiLoading(false);
        })
        .catch((err) => {
          setOpenApiError(err.message);
          setOpenApiLoading(false);
        });
    }
  }, [activeTab, openApi, openApiLoading, openApiError, client, service, version]);

  // Load Coverage when coverage tab is active
  useEffect(() => {
    if (activeTab === 'coverage' && !coverage && !coverageLoading && !coverageError) {
      setCoverageLoading(true);
      client
        .getCoverage(service!, version!)
        .then((data) => {
          setCoverage(data);
          setCoverageLoading(false);
        })
        .catch((err) => {
          setCoverageError(err.message);
          setCoverageLoading(false);
        });
    }
  }, [activeTab, coverage, coverageLoading, coverageError, client, service, version]);

  if (loading) {
    return <Loading message="Loading contract..." />;
  }

  if (error) {
    return (
      <ErrorState
        title={isConnectionError ? 'Hub Unavailable' : 'Error Loading Contract'}
        message={error}
        onRetry={refetch}
      />
    );
  }

  if (!contract) {
    return <ErrorState title="Not Found" message="Contract not found" />;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'docs', label: 'Documentation' },
    { id: 'coverage', label: 'Coverage' },
    { id: 'raw', label: 'Raw / Download' },
  ];

  // Build download URLs
  const irDownloadUrl = `${hubBaseUrl}/v1/services/${encodeURIComponent(service!)}/contracts/${encodeURIComponent(version!)}`;
  const openApiDownloadUrl = `${hubBaseUrl}/v1/services/${encodeURIComponent(service!)}/contracts/${encodeURIComponent(version!)}/openapi`;

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Services', href: '/' },
          { label: service!, href: `/services/${encodeURIComponent(service!)}` },
          { label: `v${version!}` },
        ]}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {service} <span style={{ color: '#6b7280' }}>v{version}</span>
          </h1>
          {contract.metadata.description && (
            <p style={{ color: '#6b7280' }}>{contract.metadata.description}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <OverlaySelector
            serviceName={service!}
            version={version!}
            selectedOverlay={selectedOverlay}
            onOverlayChange={selectOverlay}
          />
          <Link to={`/services/${encodeURIComponent(service!)}/diff`} className="btn btn-secondary">
            Compare Versions
          </Link>
        </div>
      </div>

      {/* Overlay Summary Badge */}
      {selectedOverlay && overlaySummary && (
        <OverlaySummaryBadge summary={overlaySummary} overlayName={selectedOverlay} />
      )}

      {/* Overlay Error */}
      {overlayError && (
        <div
          className="card"
          style={{ background: '#fef2f2', border: '1px solid #fecaca', marginBottom: 16 }}
        >
          <div className="card__body">
            <strong style={{ color: '#dc2626' }}>Overlay Error:</strong>{' '}
            <span style={{ color: '#7f1d1d' }}>{overlayError}</span>
          </div>
        </div>
      )}

      {/* Metadata Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card__body" style={{ display: 'flex', gap: 32 }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Published</div>
            <div>{formatDate(contract.metadata.publishedAt)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>IR Hash</div>
            <code
              style={{
                fontSize: 12,
                background: '#f3f4f6',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              {contract.metadata.irHash}
            </code>
          </div>
          {contract.metadata.openApiHash && (
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>OpenAPI Hash</div>
              <code
                style={{
                  fontSize: 12,
                  background: '#f3f4f6',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
              >
                {contract.metadata.openApiHash.substring(0, 16)}...
              </code>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'docs' && (
        <div>
          {openApiLoading || applyingOverlay ? (
            <Loading
              message={applyingOverlay ? 'Applying overlay...' : 'Loading OpenAPI documentation...'}
            />
          ) : openApiError ? (
            <ErrorState
              title="Error Loading Documentation"
              message={openApiError}
              onRetry={() => {
                setOpenApiError(null);
                setOpenApiLoading(true);
                client
                  .getOpenApi(service!, version!)
                  .then((data) => {
                    setOpenApi(data);
                    setOpenApiLoading(false);
                  })
                  .catch((err) => {
                    setOpenApiError(err.message);
                    setOpenApiLoading(false);
                  });
              }}
            />
          ) : appliedOpenApi ? (
            <OpenAPIViewer spec={appliedOpenApi} />
          ) : openApi ? (
            <OpenAPIViewer spec={openApi} />
          ) : null}
        </div>
      )}

      {activeTab === 'coverage' && (
        <CoverageViewer coverage={coverage} loading={coverageLoading} error={coverageError} />
      )}

      {activeTab === 'raw' && (
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">Download / Raw Data</h3>
          </div>
          <div className="card__body">
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <a
                href={irDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Download Contract IR (JSON)
              </a>
              <a
                href={openApiDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Download OpenAPI (JSON)
              </a>
            </div>

            <h4 style={{ marginBottom: 12 }}>
              Contract IR
              {selectedOverlay && (
                <span
                  style={{ marginLeft: 8, fontSize: 12, color: '#f59e0b', fontWeight: 'normal' }}
                >
                  (with "{selectedOverlay}" overlay applied)
                </span>
              )}
            </h4>
            <div className="code-block" style={{ maxHeight: 400, overflow: 'auto' }}>
              {JSON.stringify(appliedIR ?? contract.ir, null, 2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}
