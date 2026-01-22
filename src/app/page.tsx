'use client';

import {
  BulkActions,
  FileDropZone,
  FilterBar,
  Header,
  ReviewDetail,
  ReviewQueue,
} from '@/components';
import { cn } from '@/lib/utils';
import { useReviewStore } from '@/store';
import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

export default function HomePage() {
  const { items, loadItems, getSelectedItem, isLoading, stats } = useReviewStore();
  const [mounted, setMounted] = useState(false);
  const [importMessage, setImportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const selectedItem = getSelectedItem();

  // Load items on mount
  useEffect(() => {
    setMounted(true);
    loadItems();
  }, [loadItems]);

  const handleImportComplete = (result: { success: boolean; message: string }) => {
    setImportMessage({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });
    setTimeout(() => setImportMessage(null), 5000);
  };

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />

      {/* Import Message Toast */}
      {importMessage && (
        <div
          className={cn(
            'fixed top-16 right-4 z-50 rounded-lg px-4 py-3 shadow-lg transition-all',
            importMessage.type === 'success'
              ? 'bg-success text-success-foreground'
              : 'bg-destructive text-destructive-foreground'
          )}
        >
          {importMessage.text}
        </div>
      )}

      {items.length === 0 ? (
        // Empty State - Show Import UI
        <div className="flex flex-1 flex-col items-center justify-center p-8">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold">Welcome to LoopDeck</h1>
              <p className="text-muted-foreground">
                Import your JSONL file to start reviewing and curating LLM outputs
              </p>
            </div>
            <FileDropZone onImportComplete={handleImportComplete} />
            <div className="text-center text-sm text-muted-foreground space-y-1">
              <p>Supports OpenAI fine-tuning format, RAG logs, and custom formats</p>
              <p className="text-xs">Data is stored locally in your browser</p>
            </div>
          </div>
        </div>
      ) : (
        // Main Review Interface
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Left Panel - Queue */}
          <Panel defaultSize={30} minSize={20} maxSize={50}>
            <div className="flex h-full flex-col border-r">
              {/* Import Zone (Collapsed) */}
              <div className="p-3 border-b">
                <FileDropZone className="h-20" compact onImportComplete={handleImportComplete} />
              </div>

              {/* Filters */}
              <div className="p-3 border-b">
                <FilterBar />
              </div>

              {/* Bulk Actions */}
              <div className="px-3 border-b">
                <BulkActions />
              </div>

              {/* Queue List */}
              <div className="flex-1 overflow-hidden">
                <ReviewQueue className="h-full" />
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/20 transition-colors" />

          {/* Right Panel - Detail */}
          <Panel defaultSize={70} minSize={50}>
            {selectedItem ? (
              <ReviewDetail item={selectedItem} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center p-8">
                <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <h2 className="text-lg font-medium">Select an item to review</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Click on any item in the queue to view details
                </p>
                <div className="mt-6 text-xs text-muted-foreground">
                  <p>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded">Tab</kbd> to navigate
                  </p>
                  <p className="mt-1">
                    <kbd className="px-1.5 py-0.5 bg-muted rounded">1</kbd>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded ml-1">2</kbd>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded ml-1">3</kbd> to vote for models
                  </p>
                </div>
              </div>
            )}
          </Panel>
        </PanelGroup>
      )}
    </div>
  );
}
