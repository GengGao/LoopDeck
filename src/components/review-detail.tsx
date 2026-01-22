'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useReviewStore } from '@/store';
import type { ReviewItem } from '@/types/review';
import { Check, CheckCircle, Copy, Edit3, MessageSquare, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChatBubble, ModelComparison } from './chat-bubble';
import { ContextReranker } from './context-reranker';

interface ReviewDetailProps {
  item: ReviewItem;
  className?: string;
}

export function ReviewDetail({ item, className }: ReviewDetailProps) {
  const { updateItemStatus, updateHumanFeedback } = useReviewStore();
  const [activeTab, setActiveTab] = useState<string>(
    item.outputs.length > 1 ? 'compare' : 'context'
  );
  const [isEditing, setIsEditing] = useState(false);
  const [goldenText, setGoldenText] = useState(item.human_feedback.corrected_text || '');
  const [comments, setComments] = useState(item.human_feedback.comments || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setGoldenText(item.human_feedback.corrected_text || '');
    setComments(item.human_feedback.comments || '');
    setActiveTab(item.outputs.length > 1 ? 'compare' : 'context');
  }, [item.human_feedback.corrected_text, item.human_feedback.comments, item.outputs.length]);

  const handleApprove = () => {
    updateItemStatus(item.id, 'approved');
    if (goldenText && goldenText !== item.human_feedback.corrected_text) {
      updateHumanFeedback(item.id, { corrected_text: goldenText });
    }
    if (comments && comments !== item.human_feedback.comments) {
      updateHumanFeedback(item.id, { comments });
    }
  };

  const handleReject = () => {
    updateItemStatus(item.id, 'rejected');
    if (comments && comments !== item.human_feedback.comments) {
      updateHumanFeedback(item.id, { comments });
    }
  };

  const handleSelectModel = (modelId: string) => {
    updateHumanFeedback(item.id, { selected_model_id: modelId });
  };

  const handleSaveGolden = () => {
    updateHumanFeedback(item.id, { corrected_text: goldenText });
    setIsEditing(false);
  };

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(item.input.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement) return;

    if (item.outputs.length > 1) {
      const key = Number.parseInt(e.key);
      if (key >= 1 && key <= item.outputs.length) {
        handleSelectModel(item.outputs[key - 1].model_id);
      }
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)} onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={item.status as 'pending' | 'approved' | 'rejected' | 'modified'}>
              {item.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Updated {formatRelativeTime(item.updated_at)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{item.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReject}>
            <XCircle className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Button variant="success" size="sm" onClick={handleApprove}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Approve
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Prompt Section */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Prompt</CardTitle>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={handleCopyPrompt}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy prompt</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {item.input.system_prompt && (
                <div className="mb-3">
                  <Badge variant="outline" className="mb-2 text-xs">
                    System
                  </Badge>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {item.input.system_prompt}
                  </p>
                </div>
              )}
              <ChatBubble variant="user" content={item.input.prompt} />
            </CardContent>
          </Card>

          {/* Tabs for Context, Compare, Golden */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="context" className="text-xs">
                Context ({item.input.context_chunks.length})
              </TabsTrigger>
              <TabsTrigger value="compare" className="text-xs">
                {item.outputs.length > 1 ? 'Compare' : 'Response'}
              </TabsTrigger>
              <TabsTrigger value="golden" className="text-xs">
                Golden Response
              </TabsTrigger>
            </TabsList>

            <TabsContent value="context" className="mt-4">
              <ContextReranker itemId={item.id} chunks={item.input.context_chunks} />
            </TabsContent>

            <TabsContent value="compare" className="mt-4">
              {item.outputs.length > 1 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Press 1, 2, 3... to quickly select the best response
                    </p>
                    {item.human_feedback.selected_model_id && (
                      <Badge variant="success">
                        Selected: {item.human_feedback.selected_model_id}
                      </Badge>
                    )}
                  </div>
                  <ModelComparison
                    outputs={item.outputs}
                    selectedModelId={item.human_feedback.selected_model_id}
                    onSelectModel={handleSelectModel}
                  />
                </div>
              ) : (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">Model Response</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ChatBubble
                      variant="assistant"
                      content={item.outputs[0]?.text || 'No response available'}
                      modelId={item.outputs[0]?.model_id}
                      tokenUsage={item.outputs[0]?.token_usage}
                      latencyMs={item.outputs[0]?.latency_ms}
                    />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="golden" className="mt-4">
              <Card>
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Golden Response</CardTitle>
                    {!isEditing && (
                      <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit3 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Create the ideal response by editing or combining outputs
                  </p>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={goldenText}
                        onChange={(e) => setGoldenText(e.target.value)}
                        placeholder="Enter the golden response..."
                        className="min-h-[200px] font-mono text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveGolden}>
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : goldenText ? (
                    <ChatBubble variant="assistant" content={goldenText} modelId="golden" />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No golden response yet</p>
                      <p className="text-xs">Click Edit to create one</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Comments Section */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">Review Notes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add notes about this review..."
                className="min-h-[80px]"
              />
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
