'use client';

import { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, RotateCcw } from 'lucide-react';
import type { ContextChunk } from '@/types/review';
import { useReviewStore } from '@/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, getScoreEmoji, truncateText, estimateTokenCount } from '@/lib/utils';

interface SortableChunkProps {
  chunk: ContextChunk;
  index: number;
  onExclude: (id: string) => void;
  onRestore: (id: string) => void;
}

function SortableChunk({ chunk, index, onExclude, onRestore }: SortableChunkProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chunk.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const tokenCount = estimateTokenCount(chunk.text);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-lg border bg-card p-3 transition-all',
        isDragging && 'z-50 shadow-lg opacity-90',
        chunk.excluded && 'opacity-50 bg-muted'
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                #{index + 1}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {chunk.source}
              </Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={chunk.score >= 0.9 ? 'success' : chunk.score >= 0.7 ? 'warning' : 'destructive'}
                      className="text-xs"
                    >
                      {getScoreEmoji(chunk.score)} {(chunk.score * 100).toFixed(0)}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Similarity score: {chunk.score.toFixed(4)}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-xs text-muted-foreground">~{tokenCount} tokens</span>
            </div>

            {chunk.excluded ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRestore(chunk.id)}
                className="h-7 px-2"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restore
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onExclude(chunk.id)}
                className="h-7 px-2 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Exclude
              </Button>
            )}
          </div>

          <p className={cn('text-sm whitespace-pre-wrap', chunk.excluded && 'line-through')}>
            {chunk.text}
          </p>
        </div>
      </div>
    </div>
  );
}

interface ContextRerankerProps {
  itemId: string;
  chunks: ContextChunk[];
  className?: string;
}

export function ContextReranker({ itemId, chunks, className }: ContextRerankerProps) {
  const { updateContextChunks } = useReviewStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Separate active and excluded chunks
  const { activeChunks, excludedChunks } = useMemo(() => {
    const active = chunks.filter((c) => !c.excluded);
    const excluded = chunks.filter((c) => c.excluded);
    return { activeChunks: active, excludedChunks: excluded };
  }, [chunks]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeChunks.findIndex((c) => c.id === active.id);
      const newIndex = activeChunks.findIndex((c) => c.id === over.id);

      const reordered = arrayMove(activeChunks, oldIndex, newIndex).map((chunk, index) => ({
        ...chunk,
        rank: index,
      }));

      // Combine with excluded chunks
      const updatedChunks = [...reordered, ...excludedChunks];
      updateContextChunks(itemId, updatedChunks);
    }
  };

  const handleExclude = (chunkId: string) => {
    const updatedChunks = chunks.map((c) =>
      c.id === chunkId ? { ...c, excluded: true } : c
    );
    updateContextChunks(itemId, updatedChunks);
  };

  const handleRestore = (chunkId: string) => {
    const updatedChunks = chunks.map((c) =>
      c.id === chunkId ? { ...c, excluded: false } : c
    );
    updateContextChunks(itemId, updatedChunks);
  };

  if (chunks.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Context Chunks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No context chunks available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Context Chunks ({activeChunks.length} active, {excludedChunks.length} excluded)
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] px-4 pb-4">
          <div className="space-y-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeChunks.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {activeChunks.map((chunk, index) => (
                  <SortableChunk
                    key={chunk.id}
                    chunk={chunk}
                    index={index}
                    onExclude={handleExclude}
                    onRestore={handleRestore}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {excludedChunks.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-4 pb-2">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    Excluded Chunks
                  </span>
                </div>
                {excludedChunks.map((chunk, index) => (
                  <SortableChunk
                    key={chunk.id}
                    chunk={chunk}
                    index={activeChunks.length + index}
                    onExclude={handleExclude}
                    onRestore={handleRestore}
                  />
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
