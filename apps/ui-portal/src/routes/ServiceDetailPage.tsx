import { Link, useParams } from 'react-router-dom';
import { useHubClient } from '../context/HubClientContext';
import { useAsync } from '../hooks/useAsync';
import { Loading } from '../components/Loading';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { Breadcrumbs } from '../components/Breadcrumbs';

export function ServiceDetailPage() {
  const { service } = useParams<{ service: string }>();
  const client = useHubClient();

  const { data, loading, error, isConnectionError, refetch } = useAsync(
    () => client.listVersions(service!),
    [client, service]
  );

  if (loading) {
    return <Loading message="Loading versions..." />;
  }

  if (error) {
    return (
      <ErrorState
        title={isConnectionError ? 'Hub Unavailable' : 'Error Loading Versions'}
        message={error}
        onRetry={refetch}
      />
    );
  }

  const versions = data?.versions ?? [];
  const latestVersion = versions[0]?.version;

  return (
    <div>
      <Breadcrumbs items={[{ label: 'Services', href: '/' }, { label: service! }]} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h1>{service}</h1>
        <Link to={`/services/${encodeURIComponent(service!)}/diff`} className="btn btn-secondary">
          Compare Versions
        </Link>
      </div>

      {versions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="📭"
            title="No Versions Found"
            description="No contract versions have been published for this service."
          />
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Published</th>
                <th>Description</th>
                <th>Integrity (IR Hash)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((meta) => (
                <tr key={meta.version}>
                  <td>
                    <Link
                      to={`/services/${encodeURIComponent(service!)}/versions/${encodeURIComponent(meta.version)}`}
                      style={{ fontWeight: 500, textDecoration: 'none' }}
                    >
                      v{meta.version}
                    </Link>
                    {meta.version === latestVersion && (
                      <span className="badge badge-success" style={{ marginLeft: 8 }}>
                        latest
                      </span>
                    )}
                  </td>
                  <td style={{ color: '#6b7280' }}>{formatDate(meta.publishedAt)}</td>
                  <td style={{ color: '#6b7280' }}>{meta.description || '—'}</td>
                  <td>
                    <code
                      style={{
                        fontSize: 11,
                        color: '#6b7280',
                        background: '#f3f4f6',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {meta.irHash.substring(0, 12)}...
                    </code>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Link
                      to={`/services/${encodeURIComponent(service!)}/versions/${encodeURIComponent(meta.version)}`}
                      className="btn btn-secondary btn-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
