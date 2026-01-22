import { adapterRegistry, langSmithAdapter, otelAdapter } from '@/lib/adapters';
import type { ContextChunk, ImportResult, ReviewItem } from '@/types/review';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
const SCHEMA_VERSION = 1;

// Register trace adapters
adapterRegistry.register(langSmithAdapter);
adapterRegistry.register(otelAdapter);

/**
 * Parse a JSONL or JSON file and convert to ReviewItem array.
 * Supports:
 * - JSONL (one JSON object per line)
 * - JSON array of objects
 * - LangSmith run exports
 * - OpenTelemetry trace exports
 */
export async function parseJsonlFile(file: File): Promise<ImportResult> {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      itemsImported: 0,
      items: [],
      errors: [{ line: 0, message: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }],
    };
  }

  const text = await file.text();

  // Try to detect if it's a single JSON object/array (not JSONL)
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return parseJsonData(parsed);
    } catch {
      // Not valid JSON, fall through to JSONL parsing
    }
  }

  // Parse as JSONL (one JSON object per line)
  return parseJsonlLines(text);
}

/**
 * Parse a JSON object or array (LangSmith export, OTel trace, or array of items)
 */
function parseJsonData(data: unknown): ImportResult {
  const items: ReviewItem[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  // Try trace adapters first
  const adapter = adapterRegistry.detectAdapter(data);
  if (adapter) {
    try {
      const result = adapter.normalize(data);
      const normalized = Array.isArray(result) ? result : [result];
      return {
        success: true,
        itemsImported: normalized.length,
        items: normalized,
        errors: [],
      };
    } catch (e) {
      errors.push({
        line: 0,
        message: `${adapter.name} adapter error: ${e instanceof Error ? e.message : 'Unknown error'}`,
      });
    }
  }

  // Handle array of objects
  if (Array.isArray(data)) {
    // Check if it's an array of LangSmith runs
    const langSmithAdapter = adapterRegistry.get('langsmith');
    if (langSmithAdapter?.detect(data)) {
      try {
        const result = langSmithAdapter.normalize(data);
        const normalized = Array.isArray(result) ? result : [result];
        return {
          success: true,
          itemsImported: normalized.length,
          items: normalized,
          errors: [],
        };
      } catch (e) {
        // Fall through to item-by-item processing
      }
    }

    // Process each item individually
    for (let i = 0; i < data.length; i++) {
      try {
        const item = normalizeToReviewItem(data[i] as Record<string, unknown>, i + 1);
        if (item) {
          items.push(item);
        }
      } catch (e) {
        errors.push({
          line: i + 1,
          message: e instanceof Error ? e.message : 'Invalid item',
        });
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    // Single object - try to normalize it
    try {
      const item = normalizeToReviewItem(data as Record<string, unknown>, 1);
      if (item) {
        items.push(item);
      }
    } catch (e) {
      errors.push({
        line: 1,
        message: e instanceof Error ? e.message : 'Invalid item',
      });
    }
  }

  return {
    success: errors.length === 0 || items.length > 0,
    itemsImported: items.length,
    items,
    errors,
  };
}

/**
 * Parse JSONL format (one JSON object per line)
 */
function parseJsonlLines(text: string): ImportResult {
  const lines = text.split('\n').filter((line) => line.trim());

  const items: ReviewItem[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    try {
      const parsed = JSON.parse(line);

      // Check if this line is a trace format
      const adapter = adapterRegistry.detectAdapter(parsed);
      if (adapter) {
        const result = adapter.normalize(parsed);
        const normalized = Array.isArray(result) ? result : [result];
        items.push(...normalized);
      } else {
        // Use standard normalization
        const item = normalizeToReviewItem(parsed, lineNumber);
        if (item) {
          items.push(item);
        }
      }
    } catch (e) {
      errors.push({
        line: lineNumber,
        message: e instanceof Error ? e.message : 'Invalid JSON',
      });
    }
  }

  return {
    success: errors.length === 0 || items.length > 0,
    itemsImported: items.length,
    items,
    errors,
  };
}

/**
 * Normalize various input formats to ReviewItem schema
 * Supports: OpenAI format, custom RAG format, generic format
 */
function normalizeToReviewItem(
  data: Record<string, unknown>,
  lineNumber: number
): ReviewItem | null {
  const now = new Date().toISOString();

  // If it's already in our format
  if (isReviewItemFormat(data)) {
    return {
      ...data,
      id: data.id || uuidv4(),
      version: SCHEMA_VERSION,
      created_at: data.created_at || now,
      updated_at: now,
      status: data.status || 'pending',
    } as ReviewItem;
  }

  // OpenAI chat completion format
  if (isOpenAIFormat(data)) {
    return convertOpenAIFormat(data, now);
  }

  // OpenAI fine-tuning format (messages array)
  if (isOpenAIFineTuneFormat(data)) {
    return convertOpenAIFineTuneFormat(data, now);
  }

  // Generic prompt/response format
  if (isGenericFormat(data)) {
    return convertGenericFormat(data, now);
  }

  // Try to extract what we can
  return convertBestEffort(data, now);
}

function isReviewItemFormat(data: Record<string, unknown>): boolean {
  return (
    typeof data.input === 'object' &&
    data.input !== null &&
    'prompt' in (data.input as object) &&
    Array.isArray(data.outputs)
  );
}

function isOpenAIFormat(data: Record<string, unknown>): boolean {
  return 'model' in data && 'choices' in data && Array.isArray(data.choices);
}

function isOpenAIFineTuneFormat(data: Record<string, unknown>): boolean {
  return 'messages' in data && Array.isArray(data.messages);
}

function isGenericFormat(data: Record<string, unknown>): boolean {
  return (
    ('prompt' in data || 'question' in data || 'input' in data) &&
    ('response' in data || 'answer' in data || 'output' in data || 'completion' in data)
  );
}

function convertOpenAIFormat(data: Record<string, unknown>, now: string): ReviewItem {
  const choices = data.choices as Array<{ message?: { content?: string }; text?: string }>;

  return {
    id: uuidv4(),
    version: SCHEMA_VERSION,
    created_at: now,
    updated_at: now,
    status: 'pending',
    input: {
      prompt: String(data.prompt || ''),
      context_chunks: [],
    },
    outputs: choices.map((choice, index) => ({
      model_id: String(data.model || `model_${index}`),
      text: choice.message?.content || choice.text || '',
      token_usage: Number((data.usage as Record<string, unknown>)?.total_tokens || 0),
      latency_ms: 0,
    })),
    human_feedback: {},
  };
}

function convertOpenAIFineTuneFormat(data: Record<string, unknown>, now: string): ReviewItem {
  const messages = data.messages as Array<{ role: string; content: string }>;

  const systemMessage = messages.find((m) => m.role === 'system');
  const userMessage = messages.find((m) => m.role === 'user');
  const assistantMessage = messages.find((m) => m.role === 'assistant');

  // Extract context chunks if present in metadata
  const contextChunks: ContextChunk[] = [];
  if (data.context && Array.isArray(data.context)) {
    for (const chunk of data.context as Array<Record<string, unknown>>) {
      const metadata = chunk.metadata as Record<string, unknown> | undefined;
      contextChunks.push({
        id: String(chunk.id || uuidv4()),
        text: String(chunk.text || chunk.content || ''),
        source: String(chunk.source || metadata?.source || 'unknown'),
        score: Number(chunk.score || chunk.similarity || 0),
        metadata: metadata,
      });
    }
  }

  return {
    id: uuidv4(),
    version: SCHEMA_VERSION,
    created_at: now,
    updated_at: now,
    status: 'pending',
    input: {
      prompt: userMessage?.content || '',
      system_prompt: systemMessage?.content,
      context_chunks: contextChunks,
    },
    outputs: assistantMessage
      ? [
          {
            model_id: String(data.model || 'assistant'),
            text: assistantMessage.content,
            token_usage: 0,
            latency_ms: 0,
          },
        ]
      : [],
    human_feedback: {},
  };
}

function convertGenericFormat(data: Record<string, unknown>, now: string): ReviewItem {
  // Handle input as object (RAG format: {"input": {"prompt": "...", "context_chunks": [...]}, "output": "..."})
  let prompt = '';
  let systemPrompt: string | undefined;
  const inputContextChunks: ContextChunk[] = [];

  if (typeof data.input === 'object' && data.input !== null && 'prompt' in data.input) {
    const inputObj = data.input as Record<string, unknown>;
    prompt = String(inputObj.prompt || '');
    systemPrompt = inputObj.system_prompt as string | undefined;

    // Extract context_chunks from input object
    if (inputObj.context_chunks && Array.isArray(inputObj.context_chunks)) {
      for (const chunk of inputObj.context_chunks as Array<Record<string, unknown>>) {
        const metadata = chunk.metadata as Record<string, unknown> | undefined;
        inputContextChunks.push({
          id: String(chunk.id || uuidv4()),
          text: String(chunk.text || chunk.content || ''),
          source: String(chunk.source || metadata?.source || 'unknown'),
          score: Number(chunk.score || chunk.similarity || chunk.relevance_score || 0),
          metadata: metadata,
        });
      }
    }
  } else {
    prompt = String(data.prompt || data.question || data.input || '');
    systemPrompt = data.system_prompt as string | undefined;
  }

  const response = String(data.response || data.answer || data.output || data.completion || '');

  // Extract additional context if available (not already extracted from input object)
  const contextChunks: ContextChunk[] = inputContextChunks.length > 0 ? inputContextChunks : [];
  const contextField = data.context || data.contexts || data.documents || data.chunks;

  if (Array.isArray(contextField)) {
    for (const chunk of contextField as Array<Record<string, unknown> | string>) {
      if (typeof chunk === 'string') {
        contextChunks.push({
          id: uuidv4(),
          text: chunk,
          source: 'document',
          score: 0,
        });
      } else {
        const metadata = chunk.metadata as Record<string, unknown> | undefined;
        contextChunks.push({
          id: String(chunk.id || uuidv4()),
          text: String(chunk.text || chunk.content || chunk.page_content || ''),
          source: String(chunk.source || metadata?.source || 'unknown'),
          score: Number(chunk.score || chunk.similarity || chunk.relevance_score || 0),
          metadata: metadata,
        });
      }
    }
  }

  return {
    id: String(data.id || uuidv4()),
    version: SCHEMA_VERSION,
    created_at: String(data.created_at || now),
    updated_at: now,
    status: 'pending',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
    input: {
      prompt,
      system_prompt: systemPrompt,
      context_chunks: contextChunks,
    },
    outputs: [
      {
        model_id: String(data.model || data.model_id || 'default'),
        text: response,
        token_usage: Number(data.tokens || data.token_usage || 0),
        latency_ms: Number(data.latency || data.latency_ms || 0),
      },
    ],
    human_feedback: {},
  };
}

function convertBestEffort(data: Record<string, unknown>, now: string): ReviewItem {
  // Try to extract any text fields we can find
  const textFields = Object.entries(data)
    .filter(([_, value]) => typeof value === 'string' && (value as string).length > 10)
    .map(([key, value]) => ({ key, value: value as string }));

  const prompt = textFields[0]?.value || JSON.stringify(data);
  const response = textFields[1]?.value || '';

  return {
    id: uuidv4(),
    version: SCHEMA_VERSION,
    created_at: now,
    updated_at: now,
    status: 'pending',
    input: {
      prompt,
      context_chunks: [],
    },
    outputs: response
      ? [
          {
            model_id: 'unknown',
            text: response,
            token_usage: 0,
            latency_ms: 0,
          },
        ]
      : [],
    human_feedback: {},
  };
}

/**
 * Export review items to JSONL format
 */
export function exportToJsonl(
  items: ReviewItem[],
  options?: { includeMetadata?: boolean }
): string {
  return items
    .map((item) => {
      if (options?.includeMetadata) {
        return JSON.stringify(item);
      }

      // Export in OpenAI fine-tuning format
      const messages: Array<{ role: string; content: string }> = [];

      if (item.input.system_prompt) {
        messages.push({ role: 'system', content: item.input.system_prompt });
      }

      messages.push({ role: 'user', content: item.input.prompt });

      // Use corrected text if available, otherwise use the first/best output
      const responseText =
        item.human_feedback.corrected_text ||
        (item.human_feedback.selected_model_id
          ? item.outputs.find((o) => o.model_id === item.human_feedback.selected_model_id)?.text
          : item.outputs[0]?.text) ||
        '';

      if (responseText) {
        messages.push({ role: 'assistant', content: responseText });
      }

      return JSON.stringify({ messages });
    })
    .join('\n');
}

/**
 * Export for training with additional context metadata
 */
export function exportForTraining(items: ReviewItem[]): string {
  return items
    .map((item) => {
      const exported = {
        id: item.id,
        messages: [] as Array<{ role: string; content: string }>,
        context: item.input.context_chunks
          .filter((c) => !c.excluded)
          .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
          .map((c) => ({
            text: c.text,
            source: c.source,
            score: c.score,
          })),
        human_feedback: item.human_feedback,
      };

      if (item.input.system_prompt) {
        exported.messages.push({ role: 'system', content: item.input.system_prompt });
      }

      exported.messages.push({ role: 'user', content: item.input.prompt });

      const responseText =
        item.human_feedback.corrected_text ||
        (item.human_feedback.selected_model_id
          ? item.outputs.find((o) => o.model_id === item.human_feedback.selected_model_id)?.text
          : item.outputs[0]?.text) ||
        '';

      if (responseText) {
        exported.messages.push({ role: 'assistant', content: responseText });
      }

      return JSON.stringify(exported);
    })
    .join('\n');
}
