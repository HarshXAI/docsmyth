/**
 * JSON Viewer Component
 *
 * Pretty JSON display with copy functionality.
 */

import { useState } from 'react';
import { JsonView, allExpanded, defaultStyles } from 'react-json-view-lite';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyToClipboard } from '@/lib/utils';
// CSS is imported in main.tsx

interface JsonViewerProps {
  data: unknown;
  title?: string;
  maxHeight?: string;
}

export function JsonViewer({ data, title, maxHeight = '400px' }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = JSON.stringify(data, null, 2);
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-3 py-2 bg-muted border-b">
          <span className="text-sm font-medium">{title}</span>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      )}
      <div className="p-3 overflow-auto bg-slate-50 dark:bg-slate-900" style={{ maxHeight }}>
        <JsonView
          data={data as Record<string, unknown> | unknown[]}
          shouldExpandNode={allExpanded}
          style={{
            ...defaultStyles,
            container: 'font-mono text-sm',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Raw JSON display (pre-formatted)
 */
export function RawJson({ data, maxHeight = '400px' }: { data: unknown; maxHeight?: string }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 z-10"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </Button>
      <pre
        className="bg-muted p-4 rounded-lg overflow-auto text-sm font-mono"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}
