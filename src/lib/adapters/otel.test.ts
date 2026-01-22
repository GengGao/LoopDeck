import type { ReviewItem } from '@/types/review';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OTEL_MAPPINGS, adapterRegistry } from './index';
import { otelAdapter } from './otel';

describe('OpenTelemetry Adapter', () => {
  beforeEach(() => {
    // Reset mappings to default
    adapterRegistry.setOTelMappings(DEFAULT_OTEL_MAPPINGS);
  });

  describe('detect', () => {
    it('should detect OTLP format with resourceSpans', () => {
      const data = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [{ traceId: 'abc', spanId: '123', name: 'test' }],
              },
            ],
          },
        ],
      };
      expect(otelAdapter.detect(data)).toBe(true);
    });

    it('should detect flat spans array', () => {
      const data = {
        spans: [{ traceId: 'abc', spanId: '123', name: 'test' }],
      };
      expect(otelAdapter.detect(data)).toBe(true);
    });

    it('should detect a single span object', () => {
      const data = {
        traceId: 'abc',
        spanId: '123',
        name: 'llm.chat',
        startTimeUnixNano: '1000000000',
        endTimeUnixNano: '2000000000',
      };
      expect(otelAdapter.detect(data)).toBe(true);
    });

    it('should not detect LangSmith data', () => {
      const data = {
        run_id: 'run_123',
        inputs: { prompt: 'test' },
        outputs: { text: 'response' },
      };
      expect(otelAdapter.detect(data)).toBe(false);
    });

    it('should not detect generic JSON', () => {
      const data = { prompt: 'Hello', response: 'World' };
      expect(otelAdapter.detect(data)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should normalize a span with gen_ai attributes', () => {
      const data = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace123',
                    spanId: 'span456',
                    name: 'llm.chat',
                    startTimeUnixNano: '1736506800000000000',
                    endTimeUnixNano: '1736506802500000000',
                    attributes: [
                      { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4' } },
                      { key: 'gen_ai.prompt', value: { stringValue: 'What is AI?' } },
                      {
                        key: 'gen_ai.completion',
                        value: { stringValue: 'AI stands for Artificial Intelligence.' },
                      },
                      { key: 'gen_ai.usage.input_tokens', value: { intValue: 10 } },
                      { key: 'gen_ai.usage.output_tokens', value: { intValue: 20 } },
                    ],
                    status: { code: 1 },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = otelAdapter.normalize(data) as ReviewItem;

      expect(result.id).toBe('span456');
      expect(result.input.prompt).toBe('What is AI?');
      expect(result.outputs[0].text).toBe('AI stands for Artificial Intelligence.');
      expect(result.outputs[0].model_id).toBe('gpt-4');
      expect(result.outputs[0].token_usage).toBe(30); // 10 + 20
      expect(result.trace_metadata?.trace_id).toBe('trace123');
      expect(result.trace_metadata?.span_id).toBe('span456');
      expect(result.trace_metadata?.source).toBe('otel');
    });

    it('should handle llm.* attribute naming convention', () => {
      const data = {
        spans: [
          {
            traceId: 'trace1',
            spanId: 'span1',
            name: 'ChatAnthropic',
            startTimeUnixNano: '1000000000000000',
            endTimeUnixNano: '2000000000000000',
            attributes: [
              { key: 'llm.model', value: { stringValue: 'claude-3' } },
              { key: 'llm.prompts', value: { stringValue: 'Explain closures' } },
              { key: 'llm.responses', value: { stringValue: 'A closure is a function...' } },
            ],
          },
        ],
      };

      const result = otelAdapter.normalize(data) as ReviewItem;

      expect(result.input.prompt).toBe('Explain closures');
      expect(result.outputs[0].text).toBe('A closure is a function...');
      expect(result.outputs[0].model_id).toBe('claude-3');
    });

    it('should extract context from retriever spans', () => {
      const data = {
        spans: [
          {
            traceId: 'trace1',
            spanId: 'span1',
            name: 'retriever',
            startTimeUnixNano: '1000000000000000',
            endTimeUnixNano: '1500000000000000',
            attributes: [
              {
                key: 'documents',
                value: {
                  arrayValue: {
                    values: [
                      { stringValue: 'Document 1 content' },
                      { stringValue: 'Document 2 content' },
                    ],
                  },
                },
              },
            ],
          },
          {
            traceId: 'trace1',
            spanId: 'span2',
            parentSpanId: 'span1',
            name: 'llm.chat',
            startTimeUnixNano: '1500000000000000',
            endTimeUnixNano: '2000000000000000',
            attributes: [
              { key: 'gen_ai.prompt', value: { stringValue: 'Query' } },
              { key: 'gen_ai.completion', value: { stringValue: 'Answer' } },
            ],
          },
        ],
      };

      const result = otelAdapter.normalize(data) as ReviewItem;

      expect(result.input.context_chunks.length).toBe(2);
      expect(result.input.context_chunks[0].text).toBe('Document 1 content');
    });

    it('should handle spans with errors', () => {
      const data = {
        spans: [
          {
            traceId: 'trace1',
            spanId: 'span1',
            name: 'llm.chat',
            startTimeUnixNano: '1000000000000000',
            endTimeUnixNano: '1100000000000000',
            attributes: [{ key: 'gen_ai.prompt', value: { stringValue: 'Test' } }],
            status: {
              code: 2,
              message: 'Rate limit exceeded',
            },
          },
        ],
      };

      const result = otelAdapter.normalize(data) as ReviewItem;

      expect(result.trace_metadata?.error).toBe('Rate limit exceeded');
    });

    it('should calculate latency from timestamps', () => {
      const data = {
        spans: [
          {
            traceId: 'trace1',
            spanId: 'span1',
            name: 'llm.chat',
            startTimeUnixNano: '1736506800000000000', // exactly 0 ms
            endTimeUnixNano: '1736506802500000000', // 2500 ms later
            attributes: [
              { key: 'gen_ai.prompt', value: { stringValue: 'Test' } },
              { key: 'gen_ai.completion', value: { stringValue: 'Response' } },
            ],
          },
        ],
      };

      const result = otelAdapter.normalize(data) as ReviewItem;

      expect(result.trace_metadata?.latency_ms).toBe(2500);
      expect(result.outputs[0].latency_ms).toBe(2500);
    });

    it('should handle array of prompt messages', () => {
      const data = {
        spans: [
          {
            traceId: 'trace1',
            spanId: 'span1',
            name: 'llm.chat',
            startTimeUnixNano: '1000000000000000',
            endTimeUnixNano: '2000000000000000',
            attributes: [
              {
                key: 'gen_ai.prompt',
                value: {
                  arrayValue: {
                    values: [
                      {
                        kvlistValue: {
                          values: [
                            { key: 'role', value: { stringValue: 'system' } },
                            { key: 'content', value: { stringValue: 'You are helpful.' } },
                          ],
                        },
                      },
                      {
                        kvlistValue: {
                          values: [
                            { key: 'role', value: { stringValue: 'user' } },
                            { key: 'content', value: { stringValue: 'Hello!' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
              { key: 'gen_ai.completion', value: { stringValue: 'Hi there!' } },
            ],
          },
        ],
      };

      const result = otelAdapter.normalize(data) as ReviewItem;

      // The adapter should extract the user message as prompt
      expect(result.input.prompt).toContain('Hello');
    });

    it('should find only leaf LLM spans', () => {
      const data = {
        spans: [
          {
            traceId: 'trace1',
            spanId: 'parent',
            name: 'llm.chat',
            startTimeUnixNano: '1000000000000000',
            endTimeUnixNano: '3000000000000000',
            attributes: [
              { key: 'gen_ai.prompt', value: { stringValue: 'Outer prompt' } },
              { key: 'gen_ai.completion', value: { stringValue: 'Outer response' } },
            ],
          },
          {
            traceId: 'trace1',
            spanId: 'child',
            parentSpanId: 'parent',
            name: 'llm.chat',
            startTimeUnixNano: '1500000000000000',
            endTimeUnixNano: '2500000000000000',
            attributes: [
              { key: 'gen_ai.prompt', value: { stringValue: 'Inner prompt' } },
              { key: 'gen_ai.completion', value: { stringValue: 'Inner response' } },
            ],
          },
        ],
      };

      const result = otelAdapter.normalize(data);
      const items = Array.isArray(result) ? result : [result];

      // Should only get the leaf LLM span (child)
      expect(items.length).toBe(1);
      expect(items[0].input.prompt).toBe('Inner prompt');
    });
  });

  describe('configurable mappings', () => {
    it('should use custom attribute mappings', () => {
      // Add custom mapping for a vendor-specific attribute
      adapterRegistry.setOTelMappings({
        ...DEFAULT_OTEL_MAPPINGS,
        promptAttributes: ['custom.input.text', ...DEFAULT_OTEL_MAPPINGS.promptAttributes],
        responseAttributes: ['custom.output.text', ...DEFAULT_OTEL_MAPPINGS.responseAttributes],
      });

      const data = {
        spans: [
          {
            traceId: 'trace1',
            spanId: 'span1',
            name: 'CustomLLM',
            startTimeUnixNano: '1000000000000000',
            endTimeUnixNano: '2000000000000000',
            attributes: [
              { key: 'custom.input.text', value: { stringValue: 'Custom prompt' } },
              { key: 'custom.output.text', value: { stringValue: 'Custom response' } },
            ],
          },
        ],
      };

      const result = otelAdapter.normalize(data) as ReviewItem;

      expect(result.input.prompt).toBe('Custom prompt');
      expect(result.outputs[0].text).toBe('Custom response');
    });
  });

  describe('validate', () => {
    it('should validate correct OTel data', () => {
      const data = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [{ traceId: 'abc', spanId: '123', name: 'test' }],
              },
            ],
          },
        ],
      };
      const result = otelAdapter.validate!(data);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid data', () => {
      const data = { foo: 'bar' };
      const result = otelAdapter.validate!(data);
      expect(result.valid).toBe(false);
    });
  });
});
