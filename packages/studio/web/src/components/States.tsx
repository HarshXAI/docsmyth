/**
 * Loading and Error States
 */

import { Loader2, AlertCircle, FileQuestion, Radio, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface LoadingProps {
  message?: string;
}

export function Loading({ message = 'Loading...' }: LoadingProps) {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
      <span className="text-muted-foreground">{message}</span>
    </div>
  );
}

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ title = 'Error', message, onRetry }: ErrorDisplayProps) {
  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      {onRetry && (
        <CardContent>
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      {icon || <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4 max-w-md">{description}</p>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}

/**
 * Waiting for traffic banner - shown in evidence-only mode before any requests
 */
export function WaitingForTraffic() {
  return (
    <div className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-purple-500/10 border-b border-purple-200 dark:border-purple-800">
      <div className="px-6 py-4 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Radio className="h-5 w-5 text-purple-500" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-purple-500 animate-ping" />
          </div>
          <span className="font-medium text-purple-700 dark:text-purple-300">
            Waiting for traffic...
          </span>
        </div>
        <div className="text-sm text-purple-600 dark:text-purple-400">
          Send requests through the recording proxy to see operations here
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
          <Wifi className="h-4 w-4 animate-pulse" />
          <span>Live inference enabled</span>
        </div>
      </div>
    </div>
  );
}
