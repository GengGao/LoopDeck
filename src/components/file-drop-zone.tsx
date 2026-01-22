'use client';

import { cn } from '@/lib/utils';
import { useReviewStore } from '@/store';
import { FileJson, Upload } from 'lucide-react';
import { useCallback } from 'react';

interface FileDropZoneProps {
  className?: string;
  onImportComplete?: (result: { success: boolean; message: string }) => void;
  compact?: boolean;
}

export function FileDropZone({ className, onImportComplete, compact }: FileDropZoneProps) {
  const { importFile, isLoading } = useReviewStore();

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files);
      const jsonlFile = files.find(
        (file) => file.name.endsWith('.jsonl') || file.name.endsWith('.json')
      );

      if (jsonlFile) {
        const result = await importFile(jsonlFile);
        onImportComplete?.(result);
      }
    },
    [importFile, onImportComplete]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const result = await importFile(file);
        onImportComplete?.(result);
      }
      // Reset input
      e.target.value = '';
    },
    [importFile, onImportComplete]
  );

  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-muted-foreground/50',
        compact ? 'p-4' : 'flex-col p-8',
        isLoading && 'opacity-50 pointer-events-none',
        className
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        type="file"
        accept=".jsonl,.json"
        onChange={handleFileSelect}
        className="absolute inset-0 cursor-pointer opacity-0"
        disabled={isLoading}
      />
      <div
        className={cn(
          'flex items-center text-center',
          compact ? 'flex-row gap-3' : 'flex-col gap-2'
        )}
      >
        <div className={cn('rounded-full bg-muted', compact ? 'p-2' : 'p-3')}>
          {isLoading ? (
            <div
              className={cn(
                'animate-spin rounded-full border-2 border-primary border-t-transparent',
                compact ? 'h-4 w-4' : 'h-6 w-6'
              )}
            />
          ) : (
            <Upload className={cn('text-muted-foreground', compact ? 'h-4 w-4' : 'h-6 w-6')} />
          )}
        </div>
        <div className="space-y-1">
          <p className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
            {isLoading ? 'Importing...' : compact ? 'Import File' : 'Drop JSONL or JSON file here'}
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground">or click to browse (max 50MB)</p>
          )}
        </div>
        {!compact && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileJson className="h-3 w-3" />
            <span>Supports OpenAI, LangSmith, OpenTelemetry, custom RAG logs</span>
          </div>
        )}
      </div>
    </div>
  );
}
