import type { OverlaySummary } from '@acp/ir-spec';

export interface OverlaySummaryBadgeProps {
  summary: OverlaySummary;
  overlayName: string;
}

/**
 * Badge showing summary of overlay effects
 */
export function OverlaySummaryBadge({ summary, overlayName }: OverlaySummaryBadgeProps) {
  const items: { label: string; value: string | number; type: 'warning' | 'info' }[] = [];

  if (summary.hiddenOperationsCount > 0) {
    items.push({
      label: 'Hidden ops',
      value: summary.hiddenOperationsCount,
      type: 'warning',
    });
  }

  if (summary.schemaRedactionsCount > 0) {
    items.push({
      label: 'Schema redactions',
      value: summary.schemaRedactionsCount,
      type: 'warning',
    });
  }

  if (summary.responseRedactionsCount > 0) {
    items.push({
      label: 'Response redactions',
      value: summary.responseRedactionsCount,
      type: 'info',
    });
  }

  if (summary.requestRedactionsCount > 0) {
    items.push({
      label: 'Request redactions',
      value: summary.requestRedactionsCount,
      type: 'info',
    });
  }

  if (summary.hasServerOverrides) {
    items.push({
      label: 'Servers',
      value: 'Rewritten',
      type: 'info',
    });
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="overlay-summary-badge">
      <span className="overlay-summary-badge__label">
        <strong>{capitalizeFirst(overlayName)}</strong> overlay applied:
      </span>
      <div className="overlay-summary-badge__items">
        {items.map((item, index) => (
          <span
            key={index}
            className={`overlay-summary-badge__item overlay-summary-badge__item--${item.type}`}
            title={getTooltip(item.label, summary)}
          >
            {item.label}: {item.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getTooltip(label: string, summary: OverlaySummary): string {
  switch (label) {
    case 'Hidden ops':
      return `Hidden operations: ${summary.hiddenOperationIds.join(', ')}`;
    case 'Schema redactions':
      return `Redacted schemas: ${summary.redactedSchemaIds.join(', ')}`;
    default:
      return '';
  }
}
