/**
 * Method and Status Badges
 */

import { cn, getMethodClass, getStatusClass } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface MethodBadgeProps {
  method: string;
  className?: string;
}

export function MethodBadge({ method, className }: MethodBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase',
        getMethodClass(method),
        className
      )}
    >
      {method}
    </span>
  );
}

interface StatusBadgeProps {
  status: number;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold',
        getStatusClass(status),
        className
      )}
    >
      {status}
    </span>
  );
}

interface ValidityBadgeProps {
  valid: boolean;
  errorCount?: number;
  className?: string;
}

export function ValidityBadge({ valid, errorCount, className }: ValidityBadgeProps) {
  return (
    <Badge variant={valid ? 'success' : 'destructive'} className={className}>
      {valid ? 'Valid' : `Invalid${errorCount ? ` (${errorCount})` : ''}`}
    </Badge>
  );
}

interface CoverageBadgeProps {
  percent: number;
  className?: string;
}

export function CoverageBadge({ percent, className }: CoverageBadgeProps) {
  let variant: 'success' | 'warning' | 'destructive' = 'destructive';
  if (percent >= 80) variant = 'success';
  else if (percent >= 50) variant = 'warning';

  return (
    <Badge variant={variant} className={className}>
      {percent}%
    </Badge>
  );
}
