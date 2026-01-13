/**
 * Trace Adapter Registry
 *
 * Provides a unified interface for importing traces from various observability platforms
 * (LangSmith, OpenTelemetry, LangFuse) and normalizing them to ReviewItem format.
 */

import type { ReviewItem, TraceSource } from '@/types/review';

/**
 * Base interface for all trace adapters.
 * Each adapter is responsible for detecting and normalizing a specific trace format.
 */
export interface TraceAdapter<T = unknown> {
  /** Unique identifier for the adapter */
  name: TraceSource;

  /** Human-readable description of the format */
  description: string;

  /** File extensions this adapter can handle */
  fileExtensions: string[];

  /**
   * Detect if the data matches this adapter's expected format.
   * Should be fast and check only essential fields.
   */
  detect(data: unknown): boolean;

  /**
   * Normalize the trace data to ReviewItem format.
   * May return a single item or an array (for trace files with multiple spans).
   */
  normalize(data: T): ReviewItem | ReviewItem[];

  /**
   * Optional: Validate the data more thoroughly before normalization.
   * Returns validation errors if any.
   */
  validate?(data: unknown): { valid: boolean; errors: string[] };
}

/**
 * Configuration for semantic convention mappings (primarily for OpenTelemetry).
 * Allows customization of which attributes to extract for prompts, responses, etc.
 */
export interface OTelMappingConfig {
  /** Attribute names to check for prompt content (in priority order) */
  promptAttributes: string[];

  /** Attribute names to check for response/completion content */
  responseAttributes: string[];

  /** Attribute names to check for model identifier */
  modelAttributes: string[];

  /** Attribute names to check for token usage */
  tokenAttributes: {
    input: string[];
    output: string[];
    total: string[];
  };

  /** Span names that indicate LLM operations (used for filtering) */
  llmSpanNames: string[];

  /** Span names that indicate retriever operations */
  retrieverSpanNames: string[];
}

/**
 * Default OpenTelemetry semantic convention mappings.
 * Supports multiple naming schemes as the GenAI conventions are still evolving.
 */
export const DEFAULT_OTEL_MAPPINGS: OTelMappingConfig = {
  promptAttributes: [
    'gen_ai.prompt',
    'gen_ai.prompt.0.content',
    'llm.prompts',
    'llm.prompts.0',
    'ai.prompt.text',
    'openai.prompt',
    'anthropic.prompt',
  ],
  responseAttributes: [
    'gen_ai.completion',
    'gen_ai.completion.0.content',
    'llm.responses',
    'llm.responses.0',
    'ai.response.text',
    'openai.completion',
    'anthropic.completion',
  ],
  modelAttributes: [
    'gen_ai.request.model',
    'gen_ai.response.model',
    'llm.model',
    'llm.model_name',
    'ai.model.id',
    'openai.model',
    'anthropic.model',
  ],
  tokenAttributes: {
    input: [
      'gen_ai.usage.input_tokens',
      'gen_ai.usage.prompt_tokens',
      'llm.token_count.prompt',
      'ai.usage.input_tokens',
    ],
    output: [
      'gen_ai.usage.output_tokens',
      'gen_ai.usage.completion_tokens',
      'llm.token_count.completion',
      'ai.usage.output_tokens',
    ],
    total: [
      'gen_ai.usage.total_tokens',
      'llm.token_count.total',
      'ai.usage.total_tokens',
    ],
  },
  llmSpanNames: [
    'llm.chat',
    'llm.completion',
    'llm',
    'ChatOpenAI',
    'ChatAnthropic',
    'OpenAI',
    'Anthropic',
  ],
  retrieverSpanNames: [
    'retriever',
    'vectorstore',
    'Retriever',
    'VectorStoreRetriever',
  ],
};

/**
 * Result of parsing a file with adapters
 */
export interface AdapterParseResult {
  success: boolean;
  adapter: TraceSource | 'unknown';
  items: ReviewItem[];
  errors: Array<{ line?: number; message: string }>;
  warnings: string[];
}

/**
 * Adapter registry for managing and selecting trace adapters
 */
class AdapterRegistry {
  private adapters: Map<TraceSource, TraceAdapter> = new Map();
  private otelMappings: OTelMappingConfig = DEFAULT_OTEL_MAPPINGS;

  /**
   * Register a new adapter
   */
  register(adapter: TraceAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get a specific adapter by name
   */
  get(name: TraceSource): TraceAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get all registered adapters
   */
  getAll(): TraceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Detect which adapter should handle the given data
   */
  detectAdapter(data: unknown): TraceAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.detect(data)) {
        return adapter;
      }
    }
    return undefined;
  }

  /**
   * Update OpenTelemetry mappings configuration
   */
  setOTelMappings(mappings: Partial<OTelMappingConfig>): void {
    this.otelMappings = { ...this.otelMappings, ...mappings };
  }

  /**
   * Get current OpenTelemetry mappings
   */
  getOTelMappings(): OTelMappingConfig {
    return this.otelMappings;
  }
}

// Global adapter registry instance
export const adapterRegistry = new AdapterRegistry();

// Re-export adapters for convenience
export { langSmithAdapter } from './langsmith';
export { otelAdapter } from './otel';

