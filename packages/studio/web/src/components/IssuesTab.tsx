/**
 * Issues Tab Component
 *
 * Shows grouped issues from evidence verification.
 */

import { useState } from 'react';
import { useIssues, useEvent } from '@/lib/hooks';
import { Loading, ErrorDisplay, EmptyState } from '@/components/States';
import { MethodBadge, StatusBadge } from '@/components/Badges';
import { JsonViewer } from '@/components/JsonViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileWarning,
  ShieldAlert,
  Database,
} from 'lucide-react';

const issueTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  'invalid-evidence': { label: 'Invalid Evidence', icon: <XCircle className="h-4 w-4" /> },
  'schema-mismatch': { label: 'Schema Mismatch', icon: <AlertCircle className="h-4 w-4" /> },
  'missing-required-field': {
    label: 'Missing Required Field',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  'unknown-operation': { label: 'Unknown Operation', icon: <FileWarning className="h-4 w-4" /> },
  'unknown-status': { label: 'Unknown Status', icon: <ShieldAlert className="h-4 w-4" /> },
  'extra-field': { label: 'Extra Field', icon: <Database className="h-4 w-4" /> },
  'type-mismatch': { label: 'Type Mismatch', icon: <AlertCircle className="h-4 w-4" /> },
};

export function IssuesTab() {
  const { data: issues, isLoading, error, refetch } = useIssues();
  const [groupBy, setGroupBy] = useState<'type' | 'operation'>('type');
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);

  if (isLoading) {
    return <Loading message="Loading issues..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay title="Issues Error" message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!issues || issues.totalCount === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="No Issues Found"
          description="All evidence events are valid and match the contract. Great job!"
          icon={<CheckCircle className="h-12 w-12 text-green-500 mb-4" />}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            {issues.totalCount} Issues Found
          </h2>
          <p className="text-muted-foreground">
            Review and fix these issues to improve your API contract compliance.
          </p>
        </div>

        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as 'type' | 'operation')}>
          <TabsList>
            <TabsTrigger value="type">By Type</TabsTrigger>
            <TabsTrigger value="operation">By Operation</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Issue Type Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(issues.byType)
          .filter(([, typeIssues]) => typeIssues.length > 0)
          .slice(0, 4)
          .map(([type, typeIssues]) => {
            const typeInfo = issueTypeLabels[type] || { label: type, icon: <AlertCircle /> };
            return (
              <Card key={type}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="text-amber-500">{typeInfo.icon}</div>
                    <div>
                      <div className="text-xl font-bold">{typeIssues.length}</div>
                      <div className="text-sm text-muted-foreground">{typeInfo.label}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      {/* Issues List */}
      <Card>
        <CardHeader>
          <CardTitle>Issues</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {groupBy === 'type' ? (
              <Accordion type="multiple" className="space-y-2">
                {Object.entries(issues.byType)
                  .filter(([, typeIssues]) => typeIssues.length > 0)
                  .map(([type, typeIssues]) => {
                    const typeInfo = issueTypeLabels[type] || {
                      label: type,
                      icon: <AlertCircle />,
                    };
                    return (
                      <AccordionItem key={type} value={type}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3">
                            <span className="text-amber-500">{typeInfo.icon}</span>
                            <span className="font-medium">{typeInfo.label}</span>
                            <Badge variant="secondary">{typeIssues.length}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-7">
                            {typeIssues.slice(0, 20).map((issue, idx) => (
                              <div
                                key={idx}
                                className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                                onClick={() =>
                                  issue.eventIndex !== undefined &&
                                  setSelectedEventIndex(issue.eventIndex)
                                }
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <code className="text-sm font-medium">{issue.operationId}</code>
                                    {issue.eventIndex !== undefined && (
                                      <Badge variant="outline" className="ml-2 text-xs">
                                        Event #{issue.eventIndex}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {issue.message}
                                </p>
                                {issue.path && (
                                  <code className="text-xs text-muted-foreground block mt-1">
                                    Path: {issue.path}
                                  </code>
                                )}
                              </div>
                            ))}
                            {typeIssues.length > 20 && (
                              <p className="text-sm text-muted-foreground text-center py-2">
                                ... and {typeIssues.length - 20} more
                              </p>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
              </Accordion>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {Object.entries(issues.byOperationId)
                  .filter(([, opIssues]) => opIssues.length > 0)
                  .map(([operationId, opIssues]) => (
                    <AccordionItem key={operationId} value={operationId}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3">
                          <code className="font-mono">{operationId}</code>
                          <Badge variant="secondary">{opIssues.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pl-4">
                          {opIssues.slice(0, 20).map((issue, idx) => {
                            const typeInfo = issueTypeLabels[issue.type] || {
                              label: issue.type,
                              icon: <AlertCircle />,
                            };
                            return (
                              <div
                                key={idx}
                                className="p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                                onClick={() =>
                                  issue.eventIndex !== undefined &&
                                  setSelectedEventIndex(issue.eventIndex)
                                }
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-amber-500">{typeInfo.icon}</span>
                                  <span className="text-sm font-medium">{typeInfo.label}</span>
                                  {issue.eventIndex !== undefined && (
                                    <Badge variant="outline" className="text-xs">
                                      Event #{issue.eventIndex}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">{issue.message}</p>
                                {issue.path && (
                                  <code className="text-xs text-muted-foreground block mt-1">
                                    Path: {issue.path}
                                  </code>
                                )}
                              </div>
                            );
                          })}
                          {opIssues.length > 20 && (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              ... and {opIssues.length - 20} more
                            </p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Quick Event Dialog */}
      <QuickEventDialog
        eventIndex={selectedEventIndex}
        onClose={() => setSelectedEventIndex(null)}
      />
    </div>
  );
}

interface QuickEventDialogProps {
  eventIndex: number | null;
  onClose: () => void;
}

function QuickEventDialog({ eventIndex, onClose }: QuickEventDialogProps) {
  const { data: eventData, isLoading } = useEvent(eventIndex);

  return (
    <Dialog open={eventIndex !== null} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Event #{eventIndex}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Loading message="Loading event..." />
        ) : eventData ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <MethodBadge method={eventData.event.request.method} />
              <StatusBadge status={eventData.event.response.status} />
              <code className="text-sm">{eventData.event.operationId}</code>
            </div>

            {eventData.errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <h4 className="font-medium text-destructive mb-2">Errors</h4>
                <ul className="space-y-1 text-sm">
                  {eventData.errors.map((err, i) => (
                    <li key={i}>{err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <JsonViewer data={eventData.event} maxHeight="300px" />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
