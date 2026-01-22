'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatRelativeTime, truncateText } from '@/lib/utils';
import { useReviewStore } from '@/store';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CheckCircle, Clock, Edit3, FileText, XCircle } from 'lucide-react';
import { useRef } from 'react';

const statusIcons = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  modified: Edit3,
};

const statusColors = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  modified: 'modified',
} as const;

interface ReviewQueueProps {
  className?: string;
}

export function ReviewQueue({ className }: ReviewQueueProps) {
  const { selectedItemId, selectedIds, setSelectedItem, toggleItemSelection, getFilteredItems } =
    useReviewStore();

  const items = getFilteredItems();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  if (items.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
        <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">No items to review</p>
        <p className="text-xs text-muted-foreground mt-1">Import a JSONL file to get started</p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('h-full', className)} ref={parentRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          const isSelected = selectedItemId === item.id;
          const isChecked = selectedIds.has(item.id);
          const StatusIcon = statusIcons[item.status];

          return (
            <div
              key={item.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className={cn('absolute left-0 top-0 w-full p-2', 'cursor-pointer transition-colors')}
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div
                className={cn(
                  'flex items-start gap-3 rounded-md border p-3 transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:bg-muted/50'
                )}
                onClick={() => setSelectedItem(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedItem(item.id);
                    e.preventDefault();
                  }
                }}
                // biome-ignore lint:a11y/noNoninteractiveTabindex
                tabIndex={0}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleItemSelection(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColors[item.status]} className="text-[10px] px-1.5 py-0">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {item.status}
                    </Badge>
                    {item.outputs.length > 1 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {item.outputs.length} outputs
                      </Badge>
                    )}
                    {item.input.context_chunks.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {item.input.context_chunks.length} chunks
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm line-clamp-2">{truncateText(item.input.prompt, 120)}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {item.outputs[0] && <span>{item.outputs[0].model_id}</span>}
                    <span>•</span>
                    <span>{formatRelativeTime(item.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
