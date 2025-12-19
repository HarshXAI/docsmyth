/**
 * Docsmyth Studio App
 */

import { useState } from 'react';
import { useConfig, useContract, useEvidenceSummary, useIssues, useLiveStream } from '@/lib/hooks';
import { ContractTab } from '@/components/ContractTab';
import { EvidenceTab } from '@/components/EvidenceTab';
import { CoverageTab } from '@/components/CoverageTab';
import { IssuesTab } from '@/components/IssuesTab';
import { SettingsTab } from '@/components/SettingsTab';
import { Loading, WaitingForTraffic } from '@/components/States';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  FileCode,
  Activity,
  Grid,
  AlertTriangle,
  Settings,
  CheckCircle,
  XCircle,
  Radio,
  WifiOff,
} from 'lucide-react';

type TabValue = 'contract' | 'evidence' | 'coverage' | 'issues' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabValue>('contract');
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: contract } = useContract();
  const { data: evidenceSummary } = useEvidenceSummary();
  const { data: issues } = useIssues();

  // Connect to live stream in evidence-only mode
  const streamEnabled = config?.streamEnabled ?? false;
  const liveStream = useLiveStream(streamEnabled);

  if (configLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loading message="Starting Docsmyth Studio..." />
      </div>
    );
  }

  // Show waiting state when in evidence-only mode with no traffic yet
  const showWaiting = streamEnabled && liveStream.isWaiting && liveStream.eventCount === 0;

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <FileCode className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-lg">Docsmyth Studio</span>
              </div>

              {contract && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{contract.service.name}</Badge>
                  <Badge variant="secondary">{contract.service.version}</Badge>
                </div>
              )}

              {config?.evidenceOnlyMode && (
                <Badge
                  variant="secondary"
                  className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                >
                  Inference Mode
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm">
              {/* Live Stream Indicator */}
              {streamEnabled && (
                <div className="flex items-center gap-2">
                  {liveStream.isConnected ? (
                    <>
                      <Radio className="h-4 w-4 text-green-500 animate-pulse" />
                      <span className="text-green-600 dark:text-green-400">Live</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-4 w-4 text-yellow-500" />
                      <span className="text-yellow-600 dark:text-yellow-400">Reconnecting...</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Contract:</span>
                {config?.hasContract ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : config?.evidenceOnlyMode ? (
                  <Badge variant="secondary" className="text-xs">
                    inferred
                  </Badge>
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Evidence:</span>
                {config?.hasEvidence || liveStream.eventCount > 0 ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Waiting State Banner */}
        {showWaiting && <WaitingForTraffic />}

        {/* Main Content */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          {/* Tab Navigation */}
          <div className="border-b bg-card px-6">
            <TabsList className="h-12 bg-transparent p-0">
              <TabsTrigger
                value="contract"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4"
              >
                <FileCode className="h-4 w-4 mr-2" />
                Contract
                {contract?.operations?.length ? (
                  <Badge variant="outline" className="ml-2">
                    {contract.operations.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="evidence"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4"
              >
                <Activity className="h-4 w-4 mr-2" />
                Evidence
                {evidenceSummary?.totalEvents || liveStream.eventCount ? (
                  <Badge variant="secondary" className="ml-2">
                    {evidenceSummary?.totalEvents || liveStream.eventCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="coverage"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4"
              >
                <Grid className="h-4 w-4 mr-2" />
                Coverage
              </TabsTrigger>
              <TabsTrigger
                value="issues"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Issues
                {issues?.totalCount ? (
                  <Badge variant="destructive" className="ml-2">
                    {issues.totalCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            <TabsContent value="contract" className="h-full m-0">
              <ContractTab />
            </TabsContent>
            <TabsContent value="evidence" className="h-full m-0">
              <EvidenceTab />
            </TabsContent>
            <TabsContent value="coverage" className="h-full m-0 overflow-auto">
              <CoverageTab />
            </TabsContent>
            <TabsContent value="issues" className="h-full m-0 overflow-auto">
              <IssuesTab />
            </TabsContent>
            <TabsContent value="settings" className="h-full m-0 overflow-auto">
              <SettingsTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
