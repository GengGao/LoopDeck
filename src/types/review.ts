/**
 * Core data types for LoopDeck
 * Based on the PRD schema definitions
 */

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'modified';

export type SyncStatus = 'local' | 'synced' | 'conflict';

export interface ContextChunk {
  id: string;
  text: string;
  source: string;
  score: number; // Similarity score (0-1)
  embedding?: number[]; // Optional: for client-side re-ranking
  metadata?: Record<string, unknown>; // Flexible metadata (doc_id, etc.)
  excluded?: boolean; // Marked for exclusion
  rank?: number; // User's reranked position
}

export interface ModelOutput {
  model_id: string;
  text: string;
  token_usage: number;
  latency_ms: number;
  finish_reason?: string; // 'stop', 'max_tokens', etc.
}

export interface HumanFeedback {
  selected_model_id?: string; // Best model (from R2.4)
  ranking?: string[]; // Model IDs in order (from R2.2)
  corrected_text?: string; // Golden edited response (from R2.3)
  golden_context_ids?: string[]; // Which context chunks were used
  comments?: string; // Human review notes
}

/**
 * Trace metadata for observability integrations (LangSmith, OpenTelemetry)
 */
export type TraceSource = 'langsmith' | 'otel' | 'langfuse' | 'manual';
export type SpanType = 'llm' | 'retriever' | 'chain' | 'tool' | 'embedding' | 'unknown';

export interface TraceMetadata {
  trace_id?: string; // Original trace identifier (LangSmith run_id, OTel traceId)
  span_id?: string; // Span identifier if applicable
  parent_id?: string; // Parent span (for Phase 2+ hierarchy support)
  span_type?: SpanType; // Span classification
  source?: TraceSource; // Origin system
  session_id?: string; // Grouping identifier
  error?: string; // Error message if span failed
  latency_ms?: number; // Total latency from trace
  original_data?: Record<string, unknown>; // Preserve original trace data
}

export interface ReviewItem {
  // Core fields
  id: string; // UUID
  version: number; // Schema version (enables migrations)
  created_at: string; // ISO 8601 timestamp
  updated_at: string; // Last modified timestamp
  created_by?: string; // User ID (future: multi-user)

  // Status & metadata
  status: ReviewStatus;
  tags?: string[]; // User-defined tags for filtering
  sync_status?: SyncStatus; // For Phase 3 cloud sync
  trace_metadata?: TraceMetadata; // For observability integrations (LangSmith, OTel)

  // Input context
  input: {
    prompt: string;
    system_prompt?: string; // Often needed for RAG debugging
    context_chunks: ContextChunk[];
  };

  // Model outputs
  outputs: ModelOutput[];

  // Human feedback & corrections
  human_feedback: HumanFeedback;
}

// Sync adapter interface (Phase 3)
export interface SyncAdapter {
  push(items: ReviewItem[]): Promise<void>;
  pull(since: number): Promise<ReviewItem[]>;
  conflict(local: ReviewItem, remote: ReviewItem): ReviewItem;
}

// Filter options for the review queue
export interface ReviewFilters {
  status?: ReviewStatus | 'all';
  tags?: string[];
  modelId?: string;
  search?: string;
  sortBy?: 'created_at' | 'updated_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}

// Statistics for the dashboard
export interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  modified: number;
}

// JSONL import result
export interface ImportResult {
  success: boolean;
  itemsImported: number;
  items: ReviewItem[];
  errors: Array<{ line: number; message: string }>;
}

// Export options
export interface ExportOptions {
  statuses?: ReviewStatus[];
  includeMetadata?: boolean;
  format?: 'jsonl' | 'json';
}
