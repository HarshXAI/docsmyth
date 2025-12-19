/**
 * Contract Tab Component
 *
 * Shows contract operations, schemas, and details.
 */

import { useState } from 'react';
import {
  useContract,
  useExamples,
  useValidateContract,
  useInitContract,
  useConfig,
} from '@/lib/hooks';
import type { Operation } from '@/lib/api';
import { Loading, ErrorDisplay } from '@/components/States';
import { MethodBadge, StatusBadge } from '@/components/Badges';
import { JsonViewer } from '@/components/JsonViewer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, CheckCircle, AlertCircle, Plus, FileCode } from 'lucide-react';

export function ContractTab() {
  const { data: config } = useConfig();
  const { data: contract, isLoading, error, refetch } = useContract();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOperation, setSelectedOperation] = useState<Operation | null>(null);
  const [showInitDialog, setShowInitDialog] = useState(false);

  const validateMutation = useValidateContract();

  if (isLoading) {
    return <Loading message="Loading contract..." />;
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <ErrorDisplay title="Contract Error" message={error.message} onRetry={() => refetch()} />
        <InitContractCTA
          contractPath={config?.contractPath || ''}
          onInit={() => setShowInitDialog(true)}
        />
        <InitContractDialog
          open={showInitDialog}
          onOpenChange={setShowInitDialog}
          contractPath={config?.contractPath || ''}
        />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="p-6">
        <InitContractCTA
          contractPath={config?.contractPath || ''}
          onInit={() => setShowInitDialog(true)}
        />
        <InitContractDialog
          open={showInitDialog}
          onOpenChange={setShowInitDialog}
          contractPath={config?.contractPath || ''}
        />
      </div>
    );
  }

  const filteredOperations = contract.operations.filter((op) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      op.operationId.toLowerCase().includes(q) ||
      op.path.toLowerCase().includes(q) ||
      op.method.toLowerCase().includes(q) ||
      op.summary?.toLowerCase().includes(q) ||
      op.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-full">
      {/* Operations List */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold">{contract.service.name}</h2>
            <Badge variant="secondary">{contract.service.version}</Badge>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search operations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filteredOperations.map((op) => (
              <button
                key={op.operationId}
                onClick={() => setSelectedOperation(op)}
                className={`w-full text-left p-3 rounded-lg mb-1 transition-colors hover:bg-accent ${
                  selectedOperation?.operationId === op.operationId ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MethodBadge method={op.method} />
                  <span className="text-sm font-mono truncate flex-1">{op.path}</span>
                </div>
                <div className="text-sm text-muted-foreground truncate">{op.operationId}</div>
                {op.tags && op.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {op.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => validateMutation.mutate()}
              disabled={validateMutation.isPending}
            >
              {validateMutation.isPending ? (
                'Validating...'
              ) : validateMutation.data?.ok ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" /> Valid
                </>
              ) : validateMutation.data ? (
                <>
                  <AlertCircle className="h-4 w-4 text-destructive" /> Invalid
                </>
              ) : (
                'Validate'
              )}
            </Button>
          </div>
          {validateMutation.data && !validateMutation.data.ok && (
            <div className="mt-2 text-xs text-destructive">
              {validateMutation.data.errors.length} error(s) found
            </div>
          )}
        </div>
      </div>

      {/* Operation Detail */}
      <div className="flex-1 overflow-auto">
        {selectedOperation ? (
          <OperationDetail operation={selectedOperation} schemas={contract.schemas} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select an operation to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface OperationDetailProps {
  operation: Operation;
  schemas: Record<string, unknown>;
}

function OperationDetail({ operation, schemas }: OperationDetailProps) {
  const { data: examplesData } = useExamples(operation.operationId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <MethodBadge method={operation.method} className="text-sm" />
          <code className="text-lg font-mono">{operation.path}</code>
          {operation.deprecated && <Badge variant="warning">Deprecated</Badge>}
        </div>
        <h1 className="text-2xl font-bold">{operation.operationId}</h1>
        {operation.summary && <p className="text-muted-foreground mt-1">{operation.summary}</p>}
        {operation.description && <p className="text-sm mt-2">{operation.description}</p>}
        {operation.tags && operation.tags.length > 0 && (
          <div className="flex gap-2 mt-3">
            {operation.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Parameters */}
      {operation.parameters && operation.parameters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {operation.parameters.map((param) => (
                <div key={param.name} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="font-semibold">{param.name}</code>
                      <Badge variant="outline" className="text-xs">
                        {param.in}
                      </Badge>
                      {param.required ? (
                        <Badge variant="destructive" className="text-xs">
                          required
                        </Badge>
                      ) : null}
                    </div>
                    {param.description ? (
                      <p className="text-sm text-muted-foreground mt-1">{param.description}</p>
                    ) : null}
                    {param.schema != null ? (
                      <div className="mt-2">
                        <JsonViewer data={param.schema} maxHeight="150px" />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request Body */}
      {operation.requestBody && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request Body</CardTitle>
            {operation.requestBody.description && (
              <CardDescription>{operation.requestBody.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="schema">
              <TabsList>
                <TabsTrigger value="schema">Schema</TabsTrigger>
                <TabsTrigger value="examples">Examples</TabsTrigger>
              </TabsList>
              <TabsContent value="schema">
                <JsonViewer
                  data={resolveSchemaRef(operation.requestBody.schema, schemas)}
                  maxHeight="300px"
                />
              </TabsContent>
              <TabsContent value="examples">
                {examplesData?.examples && examplesData.examples.length > 0 ? (
                  <div className="space-y-2">
                    {examplesData.examples.map((ex, i) => (
                      <JsonViewer
                        key={i}
                        data={ex.request}
                        title={`Example ${i + 1}`}
                        maxHeight="200px"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm p-4">No examples from evidence</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Responses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Responses</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion
            type="single"
            collapsible
            defaultValue={String(operation.responses[0]?.statusCode)}
          >
            {operation.responses.map((response) => (
              <AccordionItem key={response.statusCode} value={String(response.statusCode)}>
                <AccordionTrigger>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={response.statusCode} />
                    {response.description && (
                      <span className="text-sm">{response.description}</span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {response.schema ? (
                    <Tabs defaultValue="schema">
                      <TabsList>
                        <TabsTrigger value="schema">Schema</TabsTrigger>
                        <TabsTrigger value="examples">Examples</TabsTrigger>
                      </TabsList>
                      <TabsContent value="schema">
                        <JsonViewer
                          data={resolveSchemaRef(response.schema, schemas)}
                          maxHeight="300px"
                        />
                      </TabsContent>
                      <TabsContent value="examples">
                        {examplesData?.examples && examplesData.examples.length > 0 ? (
                          <div className="space-y-2">
                            {examplesData.examples
                              .filter((ex) => ex.status === response.statusCode)
                              .map((ex, i) => (
                                <JsonViewer
                                  key={i}
                                  data={ex.response}
                                  title={`Example ${i + 1}`}
                                  maxHeight="200px"
                                />
                              ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-sm p-4">
                            No examples from evidence
                          </p>
                        )}
                      </TabsContent>
                    </Tabs>
                  ) : (
                    <p className="text-muted-foreground text-sm">No schema defined</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

function resolveSchemaRef(schema: unknown, schemas: Record<string, unknown>): unknown {
  if (!schema) return null;
  if (typeof schema === 'object' && schema !== null && '$ref' in schema) {
    const ref = (schema as { $ref: string }).$ref;
    if (ref.startsWith('schema:')) {
      const id = ref.slice(7);
      return schemas[id] || { $ref: ref };
    }
  }
  return schema;
}

interface InitContractCTAProps {
  contractPath: string;
  onInit: () => void;
}

function InitContractCTA({ contractPath, onInit }: InitContractCTAProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Initialize Contract
        </CardTitle>
        <CardDescription>
          No valid contract found. Create a minimal Contract IR file to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Path: <code>{contractPath}</code>
        </p>
        <Button onClick={onInit}>Initialize Contract</Button>
      </CardContent>
    </Card>
  );
}

interface InitContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractPath: string;
}

function InitContractDialog({ open, onOpenChange, contractPath }: InitContractDialogProps) {
  const [serviceName, setServiceName] = useState('my-api');
  const [version, setVersion] = useState('1.0.0');
  const initMutation = useInitContract();

  const handleInit = () => {
    initMutation.mutate(
      { path: contractPath, serviceName, version },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Initialize Contract</DialogTitle>
          <DialogDescription>
            Create a minimal Contract IR file with the basic structure.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium">Service Name</label>
            <Input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="my-api"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Version</label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Path</label>
            <Input value={contractPath} disabled />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleInit} disabled={initMutation.isPending}>
            {initMutation.isPending ? 'Creating...' : 'Create Contract'}
          </Button>
        </DialogFooter>
        {initMutation.error && (
          <p className="text-sm text-destructive mt-2">{initMutation.error.message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
