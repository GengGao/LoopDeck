'use client';

import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import type { ModelOutput } from '@/types/review';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ChatBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelId?: string;
  tokenUsage?: number;
  latencyMs?: number;
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
}

export function ChatBubble({
  role,
  content,
  modelId,
  tokenUsage,
  latencyMs,
  isSelected,
  onSelect,
  className,
}: ChatBubbleProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <div
      className={cn(
        'flex w-full',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <Card
        className={cn(
          'max-w-[85%] transition-all',
          isUser && 'bg-primary text-primary-foreground',
          isSystem && 'bg-muted border-dashed',
          isSelected && 'ring-2 ring-primary',
          onSelect && 'cursor-pointer hover:shadow-md'
        )}
        onClick={onSelect}
      >
        {(modelId || tokenUsage || latencyMs) && (
          <CardHeader className="py-2 px-3">
            <div className="flex items-center gap-2 flex-wrap">
              {modelId && (
                <Badge variant={isUser ? 'secondary' : 'outline'} className="text-xs">
                  {modelId}
                </Badge>
              )}
              {tokenUsage !== undefined && tokenUsage > 0 && (
                <span className="text-xs opacity-70">{tokenUsage} tokens</span>
              )}
              {latencyMs !== undefined && latencyMs > 0 && (
                <span className="text-xs opacity-70">{latencyMs}ms</span>
              )}
            </div>
          </CardHeader>
        )}
        <CardContent className={cn('px-3 pb-3', !modelId && !tokenUsage && !latencyMs && 'pt-3')}>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const isInline = !match;
                  
                  if (isInline) {
                    return (
                      <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  }

                  return (
                    <SyntaxHighlighter
                      style={oneDark}
                      language={match[1]}
                      PreTag="div"
                      className="rounded-md text-sm"
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  );
                },
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
                ul({ children }) {
                  return <ul className="list-disc pl-4 mb-2">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal pl-4 mb-2">{children}</ol>;
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ModelComparisonProps {
  outputs: ModelOutput[];
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  className?: string;
}

export function ModelComparison({
  outputs,
  selectedModelId,
  onSelectModel,
  className,
}: ModelComparisonProps) {
  if (outputs.length === 0) {
    return (
      <div className={cn('text-center text-muted-foreground py-8', className)}>
        No model outputs available
      </div>
    );
  }

  if (outputs.length === 1) {
    return (
      <div className={className}>
        <ChatBubble
          role="assistant"
          content={outputs[0].text}
          modelId={outputs[0].model_id}
          tokenUsage={outputs[0].token_usage}
          latencyMs={outputs[0].latency_ms}
          isSelected={selectedModelId === outputs[0].model_id}
          onSelect={onSelectModel ? () => onSelectModel(outputs[0].model_id) : undefined}
        />
      </div>
    );
  }

  // Side-by-side comparison for multiple outputs
  return (
    <div className={cn('grid gap-4', className)} style={{ gridTemplateColumns: `repeat(${Math.min(outputs.length, 3)}, 1fr)` }}>
      {outputs.map((output, index) => (
        <Card
          key={output.model_id}
          className={cn(
            'transition-all',
            selectedModelId === output.model_id && 'ring-2 ring-primary',
            onSelectModel && 'cursor-pointer hover:shadow-md'
          )}
          onClick={onSelectModel ? () => onSelectModel(output.model_id) : undefined}
        >
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">#{index + 1}</Badge>
                <Badge variant="secondary">{output.model_id}</Badge>
              </div>
              {selectedModelId === output.model_id && (
                <Badge variant="success">Selected</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              {output.token_usage > 0 && <span>{output.token_usage} tokens</span>}
              {output.latency_ms > 0 && <span>{output.latency_ms}ms</span>}
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="prose prose-sm dark:prose-invert max-w-none max-h-[400px] overflow-y-auto">
              <ReactMarkdown
                components={{
                  code({ node, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;
                    
                    if (isInline) {
                      return (
                        <code className="bg-muted px-1 py-0.5 rounded text-sm" {...props}>
                          {children}
                        </code>
                      );
                    }

                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md text-sm"
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    );
                  },
                }}
              >
                {output.text}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
