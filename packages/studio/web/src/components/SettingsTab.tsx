/**
 * Settings Tab Component
 *
 * Shows configuration and settings.
 */

import { useConfig, useContract, useCompile } from '@/lib/hooks';
import { Loading, ErrorDisplay } from '@/components/States';
import { JsonViewer } from '@/components/JsonViewer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Settings, FileJson, ExternalLink, CheckCircle, XCircle, Download } from 'lucide-react';

export function SettingsTab() {
  const { data: config, isLoading, error, refetch } = useConfig();
  const { data: contract } = useContract();
  const compileMutation = useCompile();

  const handleSaveContract = () => {
    if (!contract) return;

    const json = JSON.stringify(contract, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${contract.service.name}-contract.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <Loading message="Loading settings..." />;
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay title="Settings Error" message={error.message} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Save Contract (Evidence-only mode) */}
      {config?.evidenceOnlyMode && contract && (
        <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
              <Download className="h-5 w-5" />
              Save Inferred Contract
            </CardTitle>
            <CardDescription>
              Export the inferred contract from your captured evidence
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="font-medium">Operations:</span>{' '}
                  <span className="text-muted-foreground">{contract.operations.length}</span>
                </div>
                <div>
                  <span className="font-medium">Schemas:</span>{' '}
                  <span className="text-muted-foreground">
                    {Object.keys(contract.schemas).length}
                  </span>
                </div>
              </div>
            </div>
            <Button onClick={handleSaveContract} className="bg-purple-600 hover:bg-purple-700">
              <Download className="h-4 w-4 mr-2" />
              Download Contract JSON
            </Button>
            <p className="text-xs text-muted-foreground">
              Suggested path:{' '}
              <code className="bg-muted px-1 py-0.5 rounded">./docsmyth/contract.json</code>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuration
          </CardTitle>
          <CardDescription>Current studio configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Contract Path</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                  {config?.contractPath}
                </code>
                {config?.hasContract ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Evidence Path</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                  {config?.evidencePath || 'Not configured'}
                </code>
                {config?.hasEvidence ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compile to OpenAPI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Compile to OpenAPI
          </CardTitle>
          <CardDescription>
            Generate an OpenAPI 3.1 specification from your Contract IR
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => compileMutation.mutate()} disabled={compileMutation.isPending}>
            {compileMutation.isPending ? 'Compiling...' : 'Compile Contract'}
          </Button>

          {compileMutation.data?.ok && compileMutation.data.openapiJson != null ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Compilation successful</span>
              </div>
              <JsonViewer
                data={compileMutation.data.openapiJson}
                title="OpenAPI Output"
                maxHeight="400px"
              />
            </div>
          ) : null}

          {compileMutation.data && !compileMutation.data.ok && (
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">{compileMutation.data.error}</span>
            </div>
          )}

          {compileMutation.error && (
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">{compileMutation.error.message}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About Docsmyth Studio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Docsmyth Studio is a first-class UI for exploring API contracts and evidence. It
            provides a modern, fast, and intuitive interface for working with Contract IR documents
            and verifying API traffic against your contracts.
          </p>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="font-medium">Version</div>
              <div className="text-muted-foreground">0.1.1-rc.7</div>
            </div>
            <div>
              <div className="font-medium">Contract IR Version</div>
              <div className="text-muted-foreground">0.1</div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://github.com/HarshXAI/docsmyth"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                GitHub
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="https://docsmyth.dev/docs" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1" />
                Documentation
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
