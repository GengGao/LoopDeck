/**
 * OpenTelemetry Trace Adapter
 *
 * Normalizes OpenTelemetry trace exports to ReviewItem format.
 * Supports configurable semantic convention mappings for various GenAI/LLM instrumentation libraries.
 * For MVP, only extracts leaf LLM spans. Hierarchical trace support planned for Phase 2.
 */

import type { ContextChunk, ReviewItem, SpanType } from '@/types/review';
import { v4 as uuidv4 } from 'uuid';
import type { OTelMappingConfig, TraceAdapter } from './index';
import { adapterRegistry } from './index';

const SCHEMA_VERSION = 1;

/**
 * OpenTelemetry Span format
 * Based on OTLP JSON encoding
 */
export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number; // SpanKind enum
  startTimeUnixNano: string | number;
  endTimeUnixNano: string | number;
  attributes?: OTelAttribute[];
  events?: OTelEvent[];
  status?: {
    code?: number;
    message?: string;
  };
  // Flattened attributes format (some exporters use this)
  [key: string]: unknown;
}

export interface OTelAttribute {
  key: string;
  value: OTelAttributeValue;
}

export interface OTelAttributeValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: OTelAttributeValue[] };
  kvlistValue?: { values: OTelAttribute[] };
}

export interface OTelEvent {
  name: string;
  timeUnixNano: string | number;
  attributes?: OTelAttribute[];
}

/**
 * OpenTelemetry Trace export format
 */
export interface OTelTraceExport {
  resourceSpans?: Array<{
    resource?: {
      attributes?: OTelAttribute[];
    };
    scopeSpans?: Array<{
      scope?: {
        name?: string;
        version?: string;
      };
      spans?: OTelSpan[];
    }>;
  }>;
  // Some exporters use a flat spans array
  spans?: OTelSpan[];
  // Or a single trace object
  traceId?: string;
}

/**
 * Convert OTel attribute value to plain JS value
 */
function getAttributeValue(value: OTelAttributeValue): unknown {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.intValue !== undefined) return Number(value.intValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.arrayValue) return value.arrayValue.values.map(getAttributeValue);
  if (value.kvlistValue) {
    const obj: Record<string, unknown> = {};
    for (const attr of value.kvlistValue.values) {
      obj[attr.key] = getAttributeValue(attr.value);
    }
    return obj;
  }
  return undefined;
}

/**
 * Get attribute by key from span (handles both array and object formats)
 */
function getAttribute(span: OTelSpan, keys: string[]): unknown {
  // Try array format first
  if (span.attributes && Array.isArray(span.attributes)) {
    for (const key of keys) {
      const attr = span.attributes.find(a => a.key === key);
      if (attr) {
        return getAttributeValue(attr.value);
      }
    }
  }

  // Try object format (flattened attributes)
  for (const key of keys) {
    if (key in span && span[key] !== undefined) {
      return span[key];
    }
    // Try nested format: span.attributes.key
    if (span.attributes && typeof span.attributes === 'object' && !Array.isArray(span.attributes)) {
      const attrs = span.attributes as Record<string, unknown>;
      if (key in attrs) {
        return attrs[key];
      }
    }
  }

  return undefined;
}

/**
 * Get all attributes as a plain object
 */
function getAttributesObject(span: OTelSpan): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (span.attributes && Array.isArray(span.attributes)) {
    for (const attr of span.attributes) {
      result[attr.key] = getAttributeValue(attr.value);
    }
  } else if (span.attributes && typeof span.attributes === 'object') {
    Object.assign(result, span.attributes);
  }

  return result;
}

/**
 * Check if data is an OTel trace export
 */
function isOTelExport(data: unknown): data is OTelTraceExport {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  // Check for OTLP format with resourceSpans
  if ('resourceSpans' in obj && Array.isArray(obj.resourceSpans)) {
    return true;
  }

  // Check for flat spans array
  if ('spans' in obj && Array.isArray(obj.spans)) {
    const spans = obj.spans as Array<Record<string, unknown>>;
    return spans.length > 0 && 'traceId' in spans[0] && 'spanId' in spans[0];
  }

  // Check if it's a single span
  if ('traceId' in obj && 'spanId' in obj && 'name' in obj) {
    return true;
  }

  return false;
}

/**
 * Determine if a span is an LLM span based on name and attributes
 */
function isLLMSpan(span: OTelSpan, mappings: OTelMappingConfig): boolean {
  const name = span.name.toLowerCase();

  // Check span name against configured LLM span names
  for (const llmName of mappings.llmSpanNames) {
    if (name.includes(llmName.toLowerCase())) {
      return true;
    }
  }

  // Check for LLM-specific attributes
  const hasPrompt = mappings.promptAttributes.some(key => getAttribute(span, [key]) !== undefined);
  const hasResponse = mappings.responseAttributes.some(key => getAttribute(span, [key]) !== undefined);

  return hasPrompt || hasResponse;
}

/**
 * Determine if a span is a retriever span
 */
function isRetrieverSpan(span: OTelSpan, mappings: OTelMappingConfig): boolean {
  const name = span.name.toLowerCase();

  for (const retrieverName of mappings.retrieverSpanNames) {
    if (name.includes(retrieverName.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Determine span type from OTel span
 */
function getSpanType(span: OTelSpan, mappings: OTelMappingConfig): SpanType {
  if (isLLMSpan(span, mappings)) return 'llm';
  if (isRetrieverSpan(span, mappings)) return 'retriever';

  const name = span.name.toLowerCase();
  if (name.includes('tool') || name.includes('function')) return 'tool';
  if (name.includes('chain')) return 'chain';
  if (name.includes('embed')) return 'embedding';

  return 'unknown';
}

/**
 * Extract prompt from span attributes
 */
function extractPrompt(span: OTelSpan, mappings: OTelMappingConfig): { prompt: string; systemPrompt?: string } {
  let prompt: unknown = undefined;

  // Try each configured prompt attribute
  for (const key of mappings.promptAttributes) {
    prompt = getAttribute(span, [key]);
    if (prompt !== undefined) break;
  }

  if (prompt === undefined) {
    // Fallback: look for input-like attributes
    prompt = getAttribute(span, ['input', 'query', 'question', 'user_input']);
  }

  // Handle array of messages
  if (Array.isArray(prompt)) {
    const messages = prompt as Array<{ role?: string; content?: string } | string>;
    const systemMsg = messages.find(m => typeof m === 'object' && m.role === 'system') as { content?: string } | undefined;
    const userMsg = messages.find(m => typeof m === 'object' && m.role === 'user') as { content?: string } | undefined;

    return {
      prompt: userMsg?.content || (typeof messages[0] === 'string' ? messages[0] : JSON.stringify(messages)),
      systemPrompt: systemMsg?.content,
    };
  }

  // Handle object with messages
  if (typeof prompt === 'object' && prompt !== null && 'messages' in (prompt as object)) {
    const msgObj = prompt as { messages: Array<{ role?: string; content?: string }> };
    const systemMsg = msgObj.messages.find(m => m.role === 'system');
    const userMsg = msgObj.messages.find(m => m.role === 'user');

    return {
      prompt: userMsg?.content || '',
      systemPrompt: systemMsg?.content,
    };
  }

  return { prompt: String(prompt || '') };
}

/**
 * Extract response from span attributes
 */
function extractResponse(span: OTelSpan, mappings: OTelMappingConfig): string {
  let response: unknown = undefined;

  // Try each configured response attribute
  for (const key of mappings.responseAttributes) {
    response = getAttribute(span, [key]);
    if (response !== undefined) break;
  }

  if (response === undefined) {
    // Fallback: look for output-like attributes
    response = getAttribute(span, ['output', 'answer', 'response', 'completion']);
  }

  // Handle array of completions
  if (Array.isArray(response)) {
    const completions = response as Array<{ content?: string; text?: string; message?: { content?: string } } | string>;
    if (completions.length > 0) {
      const first = completions[0];
      if (typeof first === 'string') return first;
      return first.content || first.text || first.message?.content || JSON.stringify(first);
    }
  }

  // Handle object with content
  if (typeof response === 'object' && response !== null) {
    const respObj = response as { content?: string; text?: string; message?: { content?: string } };
    return respObj.content || respObj.text || respObj.message?.content || JSON.stringify(response);
  }

  return String(response || '');
}

/**
 * Extract model from span attributes
 */
function extractModel(span: OTelSpan, mappings: OTelMappingConfig): string {
  for (const key of mappings.modelAttributes) {
    const model = getAttribute(span, [key]);
    if (model !== undefined) {
      return String(model);
    }
  }
  return 'unknown';
}

/**
 * Extract token usage from span attributes
 */
function extractTokenUsage(span: OTelSpan, mappings: OTelMappingConfig): number {
  // Try total tokens first
  for (const key of mappings.tokenAttributes.total) {
    const total = getAttribute(span, [key]);
    if (total !== undefined) {
      return Number(total);
    }
  }

  // Calculate from input + output
  let inputTokens = 0;
  let outputTokens = 0;

  for (const key of mappings.tokenAttributes.input) {
    const input = getAttribute(span, [key]);
    if (input !== undefined) {
      inputTokens = Number(input);
      break;
    }
  }

  for (const key of mappings.tokenAttributes.output) {
    const output = getAttribute(span, [key]);
    if (output !== undefined) {
      outputTokens = Number(output);
      break;
    }
  }

  return inputTokens + outputTokens;
}

/**
 * Extract context chunks from retriever spans
 */
function extractContextFromRetrievers(spans: OTelSpan[], mappings: OTelMappingConfig): ContextChunk[] {
  const chunks: ContextChunk[] = [];

  for (const span of spans) {
    if (!isRetrieverSpan(span, mappings)) continue;

    // Look for documents in attributes
    const docs = getAttribute(span, ['documents', 'retriever.documents', 'docs', 'results']);

    if (Array.isArray(docs)) {
      docs.forEach((doc: Record<string, unknown> | string, index: number) => {
        if (typeof doc === 'string') {
          chunks.push({
            id: uuidv4(),
            text: doc,
            source: span.name,
            score: 0,
          });
        } else {
          const metadata = doc.metadata as Record<string, unknown> | undefined;
          chunks.push({
            id: String(doc.id || uuidv4()),
            text: String(doc.page_content || doc.content || doc.text || ''),
            source: String(doc.source || metadata?.source || span.name),
            score: Number(doc.score || doc.similarity || 0),
            metadata: metadata,
          });
        }
      });
    }
  }

  return chunks;
}

/**
 * Convert nanoseconds to milliseconds
 */
function nanoToMs(nano: string | number): number {
  const n = typeof nano === 'string' ? BigInt(nano) : BigInt(nano);
  return Number(n / BigInt(1_000_000));
}

/**
 * Convert nanoseconds to ISO string
 */
function nanoToIso(nano: string | number): string {
  const ms = nanoToMs(nano);
  return new Date(ms).toISOString();
}

/**
 * Calculate latency from start and end time
 */
function calculateLatency(span: OTelSpan): number {
  try {
    const startMs = nanoToMs(span.startTimeUnixNano);
    const endMs = nanoToMs(span.endTimeUnixNano);
    return endMs - startMs;
  } catch {
    return 0;
  }
}

/**
 * Extract all spans from an OTel export
 */
function extractSpans(data: OTelTraceExport): OTelSpan[] {
  const spans: OTelSpan[] = [];

  // OTLP format with resourceSpans
  if (data.resourceSpans) {
    for (const resourceSpan of data.resourceSpans) {
      if (resourceSpan.scopeSpans) {
        for (const scopeSpan of resourceSpan.scopeSpans) {
          if (scopeSpan.spans) {
            spans.push(...scopeSpan.spans);
          }
        }
      }
    }
  }

  // Flat spans array
  if (data.spans) {
    spans.push(...data.spans);
  }

  // Single span (data itself is a span)
  if ('spanId' in data && 'traceId' in data && 'name' in data) {
    spans.push(data as unknown as OTelSpan);
  }

  return spans;
}

/**
 * Find leaf LLM spans (spans with no LLM children)
 */
function findLeafLLMSpans(spans: OTelSpan[], mappings: OTelMappingConfig): OTelSpan[] {
  const llmSpans = spans.filter(s => isLLMSpan(s, mappings));

  // Build parent-child map
  const childMap = new Map<string, Set<string>>();
  for (const span of spans) {
    if (span.parentSpanId) {
      const children = childMap.get(span.parentSpanId) || new Set();
      children.add(span.spanId);
      childMap.set(span.parentSpanId, children);
    }
  }

  // Find LLM spans that have no LLM children
  const llmSpanIds = new Set(llmSpans.map(s => s.spanId));
  const leafLLMSpans = llmSpans.filter(span => {
    const children = childMap.get(span.spanId);
    if (!children) return true;
    // Check if any child is an LLM span
    return !Array.from(children).some(childId => llmSpanIds.has(childId));
  });

  return leafLLMSpans;
}

/**
 * Convert an OTel span to ReviewItem
 */
function convertSpanToReviewItem(
  span: OTelSpan,
  contextChunks: ContextChunk[],
  mappings: OTelMappingConfig,
  now: string
): ReviewItem {
  const { prompt, systemPrompt } = extractPrompt(span, mappings);
  const response = extractResponse(span, mappings);
  const model = extractModel(span, mappings);
  const tokenUsage = extractTokenUsage(span, mappings);
  const latencyMs = calculateLatency(span);

  let createdAt: string;
  try {
    createdAt = nanoToIso(span.startTimeUnixNano);
  } catch {
    createdAt = now;
  }

  // Check for error
  const error = span.status?.code === 2 ? span.status.message : undefined;

  return {
    id: span.spanId || uuidv4(),
    version: SCHEMA_VERSION,
    created_at: createdAt,
    updated_at: now,
    status: 'pending',
    trace_metadata: {
      trace_id: span.traceId,
      span_id: span.spanId,
      parent_id: span.parentSpanId,
      span_type: getSpanType(span, mappings),
      source: 'otel',
      error,
      latency_ms: latencyMs,
      original_data: getAttributesObject(span),
    },
    input: {
      prompt,
      system_prompt: systemPrompt,
      context_chunks: contextChunks,
    },
    outputs: response ? [{
      model_id: model,
      text: response,
      token_usage: tokenUsage,
      latency_ms: latencyMs,
    }] : [],
    human_feedback: {},
  };
}

/**
 * OpenTelemetry adapter implementation
 */
export const otelAdapter: TraceAdapter<OTelTraceExport | OTelSpan | OTelSpan[]> = {
  name: 'otel',
  description: 'OpenTelemetry trace exports (OTLP JSON)',
  fileExtensions: ['.json'],

  detect(data: unknown): boolean {
    return isOTelExport(data);
  },

  validate(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!isOTelExport(data)) {
      errors.push('Data does not match OpenTelemetry trace format');
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  },

  normalize(data: OTelTraceExport | OTelSpan | OTelSpan[]): ReviewItem | ReviewItem[] {
    const now = new Date().toISOString();
    const mappings = adapterRegistry.getOTelMappings();

    // Extract all spans
    let spans: OTelSpan[];
    if (Array.isArray(data)) {
      spans = data;
    } else {
      spans = extractSpans(data as OTelTraceExport);
    }

    if (spans.length === 0) {
      return [];
    }

    // Extract context from retriever spans
    const contextChunks = extractContextFromRetrievers(spans, mappings);

    // Find leaf LLM spans (MVP: only import leaf LLM calls)
    const leafLLMSpans = findLeafLLMSpans(spans, mappings);

    if (leafLLMSpans.length > 0) {
      const items = leafLLMSpans.map(span =>
        convertSpanToReviewItem(span, contextChunks, mappings, now)
      );
      return items.length === 1 ? items[0] : items;
    }

    // No LLM spans found, try to convert all spans with prompt/response data
    const llmLikeSpans = spans.filter(s => {
      const hasPrompt = mappings.promptAttributes.some(key => getAttribute(s, [key]) !== undefined);
      const hasResponse = mappings.responseAttributes.some(key => getAttribute(s, [key]) !== undefined);
      return hasPrompt || hasResponse;
    });

    if (llmLikeSpans.length > 0) {
      const items = llmLikeSpans.map(span =>
        convertSpanToReviewItem(span, contextChunks, mappings, now)
      );
      return items.length === 1 ? items[0] : items;
    }

    // Last resort: convert root spans
    const rootSpans = spans.filter(s => !s.parentSpanId);
    const items = rootSpans.map(span =>
      convertSpanToReviewItem(span, contextChunks, mappings, now)
    );

    return items.length === 1 ? items[0] : items;
  },
};
