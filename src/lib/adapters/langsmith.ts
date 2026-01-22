/**
 * LangSmith/LangChain Trace Adapter
 *
 * Normalizes LangSmith run exports to ReviewItem format.
 * For MVP, only extracts leaf LLM spans (not retriever/tool intermediate spans).
 * Hierarchical trace support planned for Phase 2.
 */

import type { ContextChunk, ReviewItem, SpanType } from '@/types/review';
import { v4 as uuidv4 } from 'uuid';
import type { TraceAdapter } from './index';

const SCHEMA_VERSION = 1;

/**
 * LangSmith Run export format
 * Based on LangSmith's run export schema
 */
export interface LangSmithRun {
  id?: string;
  run_id?: string;
  name?: string;
  run_type?: string; // 'llm', 'chain', 'retriever', 'tool', 'embedding'
  start_time?: string;
  end_time?: string;
  latency?: number;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  feedback?: LangSmithFeedback[];
  child_runs?: LangSmithRun[];
  extra?: {
    metadata?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
  };
  session_id?: string;
  session_name?: string;
  parent_run_id?: string;
  reference_example_id?: string;
  // Token usage
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  // Model info
  model?: string;
  model_name?: string;
}

export interface LangSmithFeedback {
  id?: string;
  score?: number;
  value?: string | number | boolean;
  comment?: string;
  correction?: string;
  key?: string; // feedback type: 'correctness', 'helpfulness', etc.
}

/**
 * LangSmith trace export format (can contain multiple runs)
 */
export interface LangSmithExport {
  runs?: LangSmithRun[];
  // Single run export
  run?: LangSmithRun;
  // Or the export itself is a run
  run_id?: string;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
}

/**
 * Check if data is a LangSmith run format
 */
function isLangSmithRun(data: unknown): data is LangSmithRun {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  // Exclude ReviewItem format: if outputs is an array, it's our format, not LangSmith
  if ('outputs' in obj && Array.isArray(obj.outputs)) {
    return false;
  }

  // Exclude ReviewItem format: if input.prompt exists and input.context_chunks exists, it's our format
  if ('input' in obj && typeof obj.input === 'object' && obj.input !== null) {
    const input = obj.input as Record<string, unknown>;
    if ('prompt' in input && 'context_chunks' in input) {
      return false;
    }
  }

  // Must have run_id or id, and either inputs/outputs
  const hasId = 'run_id' in obj || 'id' in obj;
  const hasIO = 'inputs' in obj || 'outputs' in obj;
  const hasRunType = 'run_type' in obj || 'name' in obj;

  return hasId && (hasIO || hasRunType);
}

/**
 * Check if data is a LangSmith export (array of runs or container object)
 */
function isLangSmithExport(data: unknown): data is LangSmithExport {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  // Check for array of runs
  if (Array.isArray(data)) {
    return data.length > 0 && data.every((item) => isLangSmithRun(item));
  }

  // Check for container with 'runs' array
  if ('runs' in obj && Array.isArray(obj.runs)) {
    return obj.runs.length > 0 && obj.runs.every((item: unknown) => isLangSmithRun(item));
  }

  // Check for single run export
  if ('run' in obj && isLangSmithRun(obj.run)) {
    return true;
  }

  // Or the object itself is a run
  return isLangSmithRun(data);
}

/**
 * Determine span type from LangSmith run_type
 */
function getSpanType(runType?: string): SpanType {
  if (!runType) return 'unknown';

  const type = runType.toLowerCase();
  if (type === 'llm' || type === 'chat_model') return 'llm';
  if (type === 'retriever') return 'retriever';
  if (type === 'chain') return 'chain';
  if (type === 'tool') return 'tool';
  if (type === 'embedding') return 'embedding';

  return 'unknown';
}

/**
 * Extract prompt from LangSmith inputs
 */
function extractPrompt(inputs: Record<string, unknown>): { prompt: string; systemPrompt?: string } {
  // Handle various input formats

  // Chat messages format: { messages: [{ role: 'user', content: '...' }] }
  if ('messages' in inputs && Array.isArray(inputs.messages)) {
    const messages = inputs.messages as Array<{ role?: string; content?: string }>;
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsg = messages.find((m) => m.role === 'user');
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');

    return {
      prompt: lastUserMsg?.content || userMsg?.content || '',
      systemPrompt: systemMsg?.content,
    };
  }

  // Simple prompt format
  if ('prompt' in inputs) {
    if (typeof inputs.prompt === 'string') {
      return { prompt: inputs.prompt };
    }
    // Prompt templates: { prompt: { template: '...', input_variables: {...} } }
    if (typeof inputs.prompt === 'object' && inputs.prompt !== null) {
      const promptObj = inputs.prompt as Record<string, unknown>;
      return { prompt: String(promptObj.template || promptObj.text || JSON.stringify(promptObj)) };
    }
  }

  // Input key format
  if ('input' in inputs) {
    return { prompt: String(inputs.input) };
  }

  // Question format (common in RAG)
  if ('question' in inputs) {
    return { prompt: String(inputs.question) };
  }

  // Query format
  if ('query' in inputs) {
    return { prompt: String(inputs.query) };
  }

  // Fallback: stringify the entire inputs
  return { prompt: JSON.stringify(inputs) };
}

/**
 * Extract response from LangSmith outputs
 */
function extractResponse(outputs: Record<string, unknown>): string {
  // Chat completion format: { generations: [[{ text: '...' }]] }
  if ('generations' in outputs && Array.isArray(outputs.generations)) {
    const gens = outputs.generations as Array<
      Array<{ text?: string; message?: { content?: string } }>
    >;
    if (gens[0]?.[0]) {
      return gens[0][0].text || gens[0][0].message?.content || '';
    }
  }

  // Message format: { message: { content: '...' } }
  if ('message' in outputs && typeof outputs.message === 'object' && outputs.message !== null) {
    return String((outputs.message as Record<string, unknown>).content || '');
  }

  // Output key format
  if ('output' in outputs) {
    return String(outputs.output);
  }

  // Text format
  if ('text' in outputs) {
    return String(outputs.text);
  }

  // Answer format (common in RAG)
  if ('answer' in outputs) {
    return String(outputs.answer);
  }

  // Response format
  if ('response' in outputs) {
    return String(outputs.response);
  }

  // Fallback: stringify outputs
  return JSON.stringify(outputs);
}

/**
 * Extract context chunks from retriever runs
 */
function extractContextFromRetriever(run: LangSmithRun): ContextChunk[] {
  const chunks: ContextChunk[] = [];

  if (!run.outputs) return chunks;

  // Documents format: { documents: [{ page_content: '...', metadata: {...} }] }
  const docs = run.outputs.documents || run.outputs.docs || run.outputs.results;

  if (Array.isArray(docs)) {
    docs.forEach((doc: Record<string, unknown>, index: number) => {
      const metadata = doc.metadata as Record<string, unknown> | undefined;
      chunks.push({
        id: String(doc.id || uuidv4()),
        text: String(doc.page_content || doc.content || doc.text || ''),
        source: String(metadata?.source || doc.source || `retrieved_${index}`),
        score: Number(doc.score || doc.similarity || metadata?.score || 0),
        metadata: metadata,
      });
    });
  }

  return chunks;
}

/**
 * Recursively find all LLM leaf spans in a run tree
 */
function findLLMLeafSpans(run: LangSmithRun): LangSmithRun[] {
  const llmSpans: LangSmithRun[] = [];

  const spanType = getSpanType(run.run_type);

  // If this is an LLM span with no children, it's a leaf
  if (spanType === 'llm') {
    if (!run.child_runs || run.child_runs.length === 0) {
      llmSpans.push(run);
    } else {
      // Check if any children are LLM spans
      const childLLMSpans = run.child_runs.flatMap((child) => findLLMLeafSpans(child));
      if (childLLMSpans.length === 0) {
        // No LLM children, so this is the leaf LLM span
        llmSpans.push(run);
      } else {
        llmSpans.push(...childLLMSpans);
      }
    }
  } else if (run.child_runs && run.child_runs.length > 0) {
    // Not an LLM span, recurse into children
    llmSpans.push(...run.child_runs.flatMap((child) => findLLMLeafSpans(child)));
  }

  return llmSpans;
}

/**
 * Find retriever spans that are siblings or ancestors of an LLM span
 */
function findRelatedRetrieverSpans(run: LangSmithRun, targetSpanId?: string): LangSmithRun[] {
  const retrieverSpans: LangSmithRun[] = [];

  const spanType = getSpanType(run.run_type);

  if (spanType === 'retriever') {
    retrieverSpans.push(run);
  }

  if (run.child_runs) {
    retrieverSpans.push(
      ...run.child_runs.flatMap((child) => findRelatedRetrieverSpans(child, targetSpanId))
    );
  }

  return retrieverSpans;
}

/**
 * Convert a LangSmith run to ReviewItem
 */
function convertRunToReviewItem(
  run: LangSmithRun,
  now: string,
  contextChunks: ContextChunk[] = []
): ReviewItem {
  const runId = run.run_id || run.id || uuidv4();
  const inputs = run.inputs || {};
  const outputs = run.outputs || {};

  const { prompt, systemPrompt } = extractPrompt(inputs);
  const response = extractResponse(outputs);

  // Calculate latency
  let latencyMs = run.latency || 0;
  if (!latencyMs && run.start_time && run.end_time) {
    const start = new Date(run.start_time).getTime();
    const end = new Date(run.end_time).getTime();
    latencyMs = end - start;
  }

  // Extract model info
  const modelId =
    run.model ||
    run.model_name ||
    ((run.extra?.metadata as Record<string, unknown>)?.model as string) ||
    'langsmith';

  // Process feedback
  const humanFeedback: ReviewItem['human_feedback'] = {};
  if (run.feedback && run.feedback.length > 0) {
    const corrections = run.feedback.filter((f) => f.correction);
    if (corrections.length > 0) {
      humanFeedback.corrected_text = corrections[0].correction;
    }

    const comments = run.feedback
      .filter((f) => f.comment)
      .map((f) => `[${f.key || 'feedback'}] ${f.comment}`)
      .join('\n');
    if (comments) {
      humanFeedback.comments = comments;
    }
  }

  return {
    id: runId,
    version: SCHEMA_VERSION,
    created_at: run.start_time || now,
    updated_at: now,
    status: 'pending',
    tags: run.session_name ? [run.session_name] : undefined,
    trace_metadata: {
      trace_id: runId,
      span_id: runId,
      parent_id: run.parent_run_id,
      span_type: getSpanType(run.run_type),
      source: 'langsmith',
      session_id: run.session_id,
      error: run.error,
      latency_ms: latencyMs,
      original_data: {
        run_type: run.run_type,
        name: run.name,
        extra: run.extra,
      },
    },
    input: {
      prompt,
      system_prompt: systemPrompt,
      context_chunks: contextChunks,
    },
    outputs: response
      ? [
          {
            model_id: modelId,
            text: response,
            token_usage:
              run.total_tokens || (run.prompt_tokens || 0) + (run.completion_tokens || 0),
            latency_ms: latencyMs,
          },
        ]
      : [],
    human_feedback: humanFeedback,
  };
}

/**
 * LangSmith adapter implementation
 */
export const langSmithAdapter: TraceAdapter<LangSmithRun | LangSmithRun[] | LangSmithExport> = {
  name: 'langsmith',
  description: 'LangSmith/LangChain run exports',
  fileExtensions: ['.json', '.jsonl'],

  detect(data: unknown): boolean {
    return isLangSmithExport(data);
  },

  validate(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!isLangSmithExport(data)) {
      errors.push('Data does not match LangSmith run format');
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  },

  normalize(data: LangSmithRun | LangSmithRun[] | LangSmithExport): ReviewItem | ReviewItem[] {
    const now = new Date().toISOString();
    const items: ReviewItem[] = [];

    // Normalize to array of runs
    let runs: LangSmithRun[];

    if (Array.isArray(data)) {
      runs = data;
    } else if ('runs' in data && Array.isArray(data.runs)) {
      runs = data.runs;
    } else if ('run' in data && data.run) {
      runs = [data.run];
    } else if (isLangSmithRun(data)) {
      runs = [data];
    } else {
      return [];
    }

    // Process each root run
    for (const run of runs) {
      // Find all retriever spans to extract context
      const retrieverSpans = findRelatedRetrieverSpans(run);
      const contextChunks = retrieverSpans.flatMap((r) => extractContextFromRetriever(r));

      // Find leaf LLM spans (MVP: only import leaf LLM calls)
      const llmSpans = findLLMLeafSpans(run);

      if (llmSpans.length > 0) {
        // Create a ReviewItem for each LLM span
        for (const llmSpan of llmSpans) {
          items.push(convertRunToReviewItem(llmSpan, now, contextChunks));
        }
      } else {
        // No LLM spans found, convert the root run directly
        // This handles non-LLM chains or tool-only runs
        items.push(convertRunToReviewItem(run, now, contextChunks));
      }
    }

    return items.length === 1 ? items[0] : items;
  },
};
