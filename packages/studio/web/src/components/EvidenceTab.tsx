/**
 * Evidence Tab Component
 *
 * Shows evidence events timeline with filtering and inspection.
 */

import { useState } from 'react';
import { useEvents, useEvent, useEvidenceSummary, useVerifyEvidence } from '@/lib/hooks';
import { Loading, ErrorDisplay, EmptyState } from '@/components/States';
import { MethodBadge, StatusBadge, ValidityBadge } from '@/components/Badges';
import { JsonViewer } from '@/components/JsonViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, ChevronLeft, ChevronRight, Activity, AlertTriangle } from 'lucide-react';
import { formatTimestamp, formatRelativeTime } from '@/lib/utils';

export function EvidenceTab() {
  const { data: summary, isLoading: summaryLoading } = useEvidenceSummary();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOperationId, setFilterOperationId] = useState<string>('');
  const [filterValid, setFilterValid] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [selectedEventIndex, setSelectedEventIndex] = useState<number | null>(null);

  const { data: events, isLoading: eventsLoading } = useEvents({
    page,
    pageSize: 50,
    operationId: filterOperationId || undefined,
    valid: filterValid,
    q: searchQuery || undefined,
  });

  const verifyMutation = useVerifyEvidence();

  if (summaryLoading) {
    return <Loading message="Loading evidence summary..." />;
  }

  if (!summary?.hasEvidence) {
    return (
      <div className="p-6">
        <EmptyState
          title="No Evidence"
          description="No evidence file is configured or the file doesn't exist. Start capturing API traffic to see evidence here."
          icon={<Activity className="h-12 w-12 text-muted-foreground mb-4" />}
        />
      </div>
    );
  }

  const operationIds = Object.keys(summary.byOperationId);

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Summary Stats */}
        <div className="p-4 border-b">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{summary.totalEvents}</div>
                <div className="text-sm text-muted-foreground">Total Events</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-600">{summary.validEvents}</div>
                <div className="text-sm text-muted-foreground">Valid</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-red-600">{summary.invalidEvents}</div>
                <div className="text-sm text-muted-foreground">Invalid</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{operationIds.length}</div>
                <div className="text-sm text-muted-foreground">Operations</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filters */}
        <div className="p-4 border-b flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>

          <Select
            value={filterOperationId}
            onValueChange={(v) => {
              setFilterOperationId(v === 'all' ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All operations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All operations</SelectItem>
              {operationIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterValid === undefined ? 'all' : filterValid ? 'valid' : 'invalid'}
            onValueChange={(v) => {
              setFilterValid(v === 'all' ? undefined : v === 'valid');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="valid">Valid only</SelectItem>
              <SelectItem value="invalid">Invalid only</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => verifyMutation.mutate()}
            disabled={verifyMutation.isPending}
          >
            {verifyMutation.isPending ? 'Verifying...' : 'Re-verify All'}
          </Button>
        </div>

        {/* Events Table */}
        <ScrollArea className="flex-1">
          {eventsLoading ? (
            <Loading message="Loading events..." />
          ) : events && events.events.length > 0 ? (
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-3 text-sm font-medium">#</th>
                  <th className="text-left p-3 text-sm font-medium">Operation</th>
                  <th className="text-left p-3 text-sm font-medium">Method</th>
                  <th className="text-left p-3 text-sm font-medium">Path</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                  <th className="text-left p-3 text-sm font-medium">Valid</th>
                  <th className="text-left p-3 text-sm font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {events.events.map((event) => (
                  <tr
                    key={event.index}
                    onClick={() => setSelectedEventIndex(event.index)}
                    className="border-b hover:bg-accent cursor-pointer transition-colors"
                  >
                    <td className="p-3 text-sm text-muted-foreground">{event.index}</td>
                    <td className="p-3">
                      <code className="text-sm">{event.operationId}</code>
                    </td>
                    <td className="p-3">
                      <MethodBadge method={event.method} />
                    </td>
                    <td className="p-3">
                      <code className="text-sm font-mono truncate max-w-[200px] block">
                        {event.path}
                      </code>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={event.status} />
                    </td>
                    <td className="p-3">
                      <ValidityBadge valid={event.valid} errorCount={event.errorCount} />
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {formatRelativeTime(event.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-muted-foreground">
              No events found matching your filters
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {events && events.total > 0 && (
          <div className="p-4 border-t flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * events.pageSize + 1} -{' '}
              {Math.min(page * events.pageSize, events.total)} of {events.total}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!events.hasMore}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Event Inspector Dialog */}
      <EventInspectorDialog
        eventIndex={selectedEventIndex}
        onClose={() => setSelectedEventIndex(null)}
      />
    </div>
  );
}

interface EventInspectorDialogProps {
  eventIndex: number | null;
  onClose: () => void;
}

function EventInspectorDialog({ eventIndex, onClose }: EventInspectorDialogProps) {
  const { data: eventData, isLoading, error } = useEvent(eventIndex);

  return (
    <Dialog open={eventIndex !== null} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Event #{eventIndex}
            {eventData && (
              <>
                <MethodBadge method={eventData.event.request.method} />
                <StatusBadge status={eventData.event.response.status} />
                <ValidityBadge valid={eventData.valid} />
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <Loading message="Loading event..." />
          ) : error ? (
            <ErrorDisplay message={error.message} />
          ) : eventData ? (
            <div className="space-y-4 p-1">
              {/* Meta Info */}
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Operation ID:</span>
                  <div className="font-mono">{eventData.event.operationId}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Timestamp:</span>
                  <div>{formatTimestamp(eventData.event.timestamp)}</div>
                </div>
                {eventData.event.traceId && (
                  <div>
                    <span className="text-muted-foreground">Trace ID:</span>
                    <div className="font-mono text-xs">{eventData.event.traceId}</div>
                  </div>
                )}
              </div>

              {/* Errors */}
              {eventData.errors.length > 0 && (
                <Card className="border-destructive">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Validation Errors ({eventData.errors.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {eventData.errors.map((err, i) => (
                        <li key={i} className="text-sm">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="shrink-0">
                              {err.phase}
                            </Badge>
                            <div>
                              <div>{err.message}</div>
                              {err.dataPath && (
                                <code className="text-xs text-muted-foreground">
                                  Path: {err.dataPath}
                                </code>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Request/Response */}
              <Tabs defaultValue="request">
                <TabsList>
                  <TabsTrigger value="request">Request</TabsTrigger>
                  <TabsTrigger value="response">Response</TabsTrigger>
                  <TabsTrigger value="raw">Raw Event</TabsTrigger>
                </TabsList>

                <TabsContent value="request" className="space-y-4">
                  <div className="flex items-center gap-2">
                    <MethodBadge method={eventData.event.request.method} />
                    <code className="font-mono">{eventData.event.request.path}</code>
                  </div>

                  {eventData.event.request.headers &&
                    Object.keys(eventData.event.request.headers).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Headers</h4>
                        <div className="bg-muted rounded-lg p-3 text-sm font-mono">
                          {Object.entries(eventData.event.request.headers).map(([k, v]) => (
                            <div key={k}>
                              <span className="text-muted-foreground">{k}:</span> {v}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {eventData.event.request.query &&
                    Object.keys(eventData.event.request.query).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Query Parameters</h4>
                        <JsonViewer data={eventData.event.request.query} maxHeight="150px" />
                      </div>
                    )}

                  {eventData.event.request.params &&
                    Object.keys(eventData.event.request.params).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Path Parameters</h4>
                        <JsonViewer data={eventData.event.request.params} maxHeight="150px" />
                      </div>
                    )}

                  {eventData.event.request.body !== undefined && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Body</h4>
                      <JsonViewer data={eventData.event.request.body} maxHeight="300px" />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="response" className="space-y-4">
                  <StatusBadge status={eventData.event.response.status} />

                  {eventData.event.response.headers &&
                    Object.keys(eventData.event.response.headers).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Headers</h4>
                        <div className="bg-muted rounded-lg p-3 text-sm font-mono">
                          {Object.entries(eventData.event.response.headers).map(([k, v]) => (
                            <div key={k}>
                              <span className="text-muted-foreground">{k}:</span> {v}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {eventData.event.response.body !== undefined && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Body</h4>
                      <JsonViewer data={eventData.event.response.body} maxHeight="300px" />
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="raw">
                  <JsonViewer data={eventData.event} maxHeight="500px" />
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
