import { Link } from 'react-router-dom';
import { useHubClient } from '../context/HubClientContext';
import { useAsync } from '../hooks/useAsync';
import { Loading } from '../components/Loading';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';

export function ServicesPage() {
  const client = useHubClient();

  const { data, loading, error, isConnectionError, refetch } = useAsync(
    () => client.listServices(),
    [client]
  );

  if (loading) {
    return <Loading message="Loading services..." />;
  }

  if (error) {
    return (
      <ErrorState
        title={isConnectionError ? 'Hub Unavailable' : 'Error Loading Services'}
        message={
          isConnectionError
            ? 'Cannot connect to the Contract Hub. Please ensure the hub is running and try again.'
            : error
        }
        onRetry={refetch}
      />
    );
  }

  if (!data?.services || data.services.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="📦"
          title="No Services Found"
          description="No API contracts have been published yet. Use the CLI to publish your first contract."
        />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Services</h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Service Name</th>
              <th>Latest Version</th>
              <th>Versions</th>
              <th>Last Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((service) => (
              <tr key={service.serviceName}>
                <td>
                  <Link
                    to={`/services/${encodeURIComponent(service.serviceName)}`}
                    style={{ fontWeight: 500, textDecoration: 'none' }}
                  >
                    {service.serviceName}
                  </Link>
                </td>
                <td>
                  <span className="badge badge-info">v{service.latestVersion}</span>
                </td>
                <td>{service.versionCount}</td>
                <td style={{ color: '#6b7280' }}>{formatDate(service.lastUpdated)}</td>
                <td style={{ textAlign: 'right' }}>
                  <Link
                    to={`/services/${encodeURIComponent(service.serviceName)}/diff`}
                    className="btn btn-secondary btn-sm"
                  >
                    Compare Versions
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
