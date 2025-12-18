import { useState } from 'react';
import type { OpenAPIDocument, OpenAPIOperation, PathItem } from '@docsmyth/hub-client';

interface OpenAPIViewerProps {
  spec: OpenAPIDocument;
}

interface OperationDisplay {
  method: string;
  path: string;
  operation: OpenAPIOperation;
  tag: string;
}

export function OpenAPIViewer({ spec }: OpenAPIViewerProps) {
  const operations = extractOperations(spec);
  const operationsByTag = groupByTag(operations);
  const tags = Object.keys(operationsByTag).sort();

  return (
    <div className="openapi-viewer">
      {/* Info Section */}
      <div className="openapi-info">
        <h2 className="openapi-info__title">{spec.info.title}</h2>
        <span className="openapi-info__version">Version {spec.info.version}</span>
        {spec.info.description && (
          <p className="openapi-info__description">{spec.info.description}</p>
        )}
      </div>

      {/* Servers */}
      {spec.servers && spec.servers.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: '#6b7280' }}>Servers</h3>
          {spec.servers.map((server, i) => (
            <div
              key={i}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                padding: '8px 12px',
                background: '#f3f4f6',
                borderRadius: 4,
                marginBottom: 4,
              }}
            >
              {server.url}
              {server.description && (
                <span style={{ color: '#6b7280', marginLeft: 8 }}>— {server.description}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Operations by Tag */}
      {tags.map((tag) => (
        <div key={tag} className="openapi-tag">
          <h3 className="openapi-tag__name">{tag}</h3>
          {operationsByTag[tag].map((op) => (
            <OperationCard
              key={`${op.method}-${op.path}`}
              method={op.method}
              path={op.path}
              operation={op.operation}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface OperationCardProps {
  method: string;
  path: string;
  operation: OpenAPIOperation;
}

function OperationCard({ method, path, operation }: OperationCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="openapi-operation">
      <div className="openapi-operation__header" onClick={() => setExpanded(!expanded)}>
        <span className={`openapi-operation__method ${method.toLowerCase()}`}>{method}</span>
        <span className="openapi-operation__path">{path}</span>
        {operation.summary && (
          <span className="openapi-operation__summary">{operation.summary}</span>
        )}
        {operation.deprecated && (
          <span className="badge badge-warning" style={{ marginLeft: 'auto' }}>
            deprecated
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="openapi-operation__body">
          {/* Description */}
          {operation.description && (
            <div className="openapi-operation__section">
              <p style={{ color: '#4b5563' }}>{operation.description}</p>
            </div>
          )}

          {/* Operation ID */}
          {operation.operationId && (
            <div className="openapi-operation__section">
              <div className="openapi-operation__section-title">Operation ID</div>
              <code
                style={{
                  fontSize: 13,
                  background: '#f3f4f6',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
              >
                {operation.operationId}
              </code>
            </div>
          )}

          {/* Parameters */}
          {operation.parameters && operation.parameters.length > 0 && (
            <div className="openapi-operation__section">
              <div className="openapi-operation__section-title">Parameters</div>
              {operation.parameters.map((param, i) => (
                <div key={i} className="openapi-param">
                  <span className={`openapi-param__name ${param.required ? 'required' : ''}`}>
                    {param.name}
                  </span>
                  <span className="openapi-param__in">{param.in}</span>
                  <span className="openapi-param__description">
                    {param.description || getSchemaType(param.schema)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Request Body */}
          {operation.requestBody && (
            <div className="openapi-operation__section">
              <div className="openapi-operation__section-title">
                Request Body
                {operation.requestBody.required && (
                  <span style={{ color: '#ef4444', marginLeft: 4 }}>(required)</span>
                )}
              </div>
              {operation.requestBody.description && (
                <p style={{ color: '#6b7280', marginBottom: 8 }}>
                  {operation.requestBody.description}
                </p>
              )}
              {operation.requestBody.content &&
                Object.entries(operation.requestBody.content).map(([contentType, media]) => (
                  <div key={contentType}>
                    <code
                      style={{
                        fontSize: 12,
                        color: '#6b7280',
                        marginBottom: 8,
                        display: 'block',
                      }}
                    >
                      {contentType}
                    </code>
                    {media.schema ? (
                      <div className="openapi-schema">{formatSchema(media.schema)}</div>
                    ) : null}
                  </div>
                ))}
            </div>
          )}

          {/* Responses */}
          {operation.responses && (
            <div className="openapi-operation__section">
              <div className="openapi-operation__section-title">Responses</div>
              {Object.entries(operation.responses).map(([status, response]) => (
                <div key={status} className={`openapi-response ${getStatusClass(status)}`}>
                  <span className="openapi-response__status">{status}</span>
                  <span className="openapi-response__description">{response.description}</span>
                  {response.content ? (
                    <>
                      {Object.entries(response.content).map(([contentType, media]) =>
                        media.schema ? (
                          <div key={contentType} style={{ marginTop: 8 }}>
                            <div className="openapi-schema">{formatSchema(media.schema)}</div>
                          </div>
                        ) : null
                      )}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function extractOperations(spec: OpenAPIDocument): OperationDisplay[] {
  const operations: OperationDisplay[] = [];
  const paths = spec.paths ?? {};

  const methods: (keyof PathItem)[] = [
    'get',
    'post',
    'put',
    'patch',
    'delete',
    'options',
    'head',
    'trace',
  ];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (operation) {
        const tag = operation.tags?.[0] ?? 'default';
        operations.push({
          method: method.toUpperCase(),
          path,
          operation,
          tag,
        });
      }
    }
  }

  return operations;
}

function groupByTag(operations: OperationDisplay[]): Record<string, OperationDisplay[]> {
  const grouped: Record<string, OperationDisplay[]> = {};

  for (const op of operations) {
    if (!grouped[op.tag]) {
      grouped[op.tag] = [];
    }
    grouped[op.tag].push(op);
  }

  return grouped;
}

function getSchemaType(schema: unknown): string {
  if (!schema || typeof schema !== 'object') return 'any';
  const s = schema as Record<string, unknown>;

  if (s.$ref && typeof s.$ref === 'string') {
    const parts = s.$ref.split('/');
    return parts[parts.length - 1];
  }

  if (s.type === 'array' && s.items) {
    return `${getSchemaType(s.items)}[]`;
  }

  return (s.type as string) ?? 'object';
}

function formatSchema(schema: unknown): string {
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return String(schema);
  }
}

function getStatusClass(status: string): string {
  const code = parseInt(status, 10);
  if (code >= 200 && code < 300) return 'success';
  if (code >= 400) return 'error';
  return '';
}
