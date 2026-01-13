import type { ReviewItem } from '@/types/review';
import { describe, expect, it } from 'vitest';
import { langSmithAdapter } from './langsmith';

describe('LangSmith Adapter', () => {
  describe('detect', () => {
    it('should detect a single LangSmith run', () => {
      const data = {
        run_id: 'run_123',
        inputs: { prompt: 'Hello' },
        outputs: { text: 'World' },
      };
      expect(langSmithAdapter.detect(data)).toBe(true);
    });

    it('should detect an array of LangSmith runs', () => {
      const data = [
        { run_id: 'run_1', inputs: {}, outputs: {} },
        { run_id: 'run_2', inputs: {}, outputs: {} },
      ];
      expect(langSmithAdapter.detect(data)).toBe(true);
    });

    it('should detect a LangSmith export with runs array', () => {
      const data = {
        runs: [
          { run_id: 'run_1', inputs: {}, outputs: {} },
        ],
      };
      expect(langSmithAdapter.detect(data)).toBe(true);
    });

    it('should not detect unrelated data', () => {
      const data = { prompt: 'Hello', response: 'World' };
      expect(langSmithAdapter.detect(data)).toBe(false);
    });

    it('should not detect OpenTelemetry data', () => {
      const data = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{ traceId: 'abc', spanId: '123' }],
          }],
        }],
      };
      expect(langSmithAdapter.detect(data)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should normalize a simple LLM run', () => {
      const run = {
        run_id: 'run_abc123',
        run_type: 'llm',
        inputs: {
          messages: [
            { role: 'user', content: 'What is TypeScript?' },
          ],
        },
        outputs: {
          generations: [[{ text: 'TypeScript is a typed superset of JavaScript.' }]],
        },
        model: 'gpt-4',
        total_tokens: 50,
        start_time: '2026-01-10T10:00:00.000Z',
        end_time: '2026-01-10T10:00:02.000Z',
      };

      const result = langSmithAdapter.normalize(run) as ReviewItem;

      expect(result.id).toBe('run_abc123');
      expect(result.input.prompt).toBe('What is TypeScript?');
      expect(result.outputs[0].text).toBe('TypeScript is a typed superset of JavaScript.');
      expect(result.outputs[0].model_id).toBe('gpt-4');
      expect(result.outputs[0].token_usage).toBe(50);
      expect(result.trace_metadata?.source).toBe('langsmith');
      expect(result.trace_metadata?.span_type).toBe('llm');
    });

    it('should extract system prompt from messages', () => {
      const run = {
        run_id: 'run_123',
        run_type: 'llm',
        inputs: {
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' },
          ],
        },
        outputs: {
          generations: [[{ text: 'Hi there!' }]],
        },
      };

      const result = langSmithAdapter.normalize(run) as ReviewItem;

      expect(result.input.system_prompt).toBe('You are a helpful assistant.');
      expect(result.input.prompt).toBe('Hello!');
    });

    it('should extract context chunks from retriever child runs', () => {
      const run = {
        run_id: 'run_chain',
        run_type: 'chain',
        inputs: { question: 'What is RAG?' },
        outputs: { answer: 'RAG stands for Retrieval Augmented Generation.' },
        child_runs: [
          {
            run_id: 'run_retriever',
            run_type: 'retriever',
            inputs: { query: 'What is RAG?' },
            outputs: {
              documents: [
                {
                  page_content: 'RAG combines retrieval with generation.',
                  metadata: { source: 'docs/rag.md' },
                  score: 0.95,
                },
                {
                  page_content: 'Retrieval helps ground LLM responses.',
                  metadata: { source: 'docs/retrieval.md' },
                  score: 0.88,
                },
              ],
            },
          },
          {
            run_id: 'run_llm',
            run_type: 'llm',
            inputs: {
              messages: [{ role: 'user', content: 'What is RAG?' }],
            },
            outputs: {
              generations: [[{ text: 'RAG stands for Retrieval Augmented Generation.' }]],
            },
          },
        ],
      };

      const result = langSmithAdapter.normalize(run);
      const items = Array.isArray(result) ? result : [result];

      // Should only get the leaf LLM span
      expect(items.length).toBe(1);
      expect(items[0].input.context_chunks.length).toBe(2);
      expect(items[0].input.context_chunks[0].text).toBe('RAG combines retrieval with generation.');
      expect(items[0].input.context_chunks[0].source).toBe('docs/rag.md');
      expect(items[0].input.context_chunks[0].score).toBe(0.95);
    });

    it('should handle multiple LLM runs', () => {
      const runs = [
        {
          run_id: 'run_1',
          run_type: 'llm',
          inputs: { prompt: 'Question 1' },
          outputs: { text: 'Answer 1' },
        },
        {
          run_id: 'run_2',
          run_type: 'llm',
          inputs: { prompt: 'Question 2' },
          outputs: { text: 'Answer 2' },
        },
      ];

      const result = langSmithAdapter.normalize(runs);
      expect(Array.isArray(result)).toBe(true);
      expect((result as ReviewItem[]).length).toBe(2);
    });

    it('should preserve feedback as human feedback', () => {
      const run = {
        run_id: 'run_feedback',
        run_type: 'llm',
        inputs: { prompt: 'Test' },
        outputs: { text: 'Response' },
        feedback: [
          {
            key: 'correctness',
            score: 1,
            comment: 'Good answer',
            correction: 'Improved response text',
          },
        ],
      };

      const result = langSmithAdapter.normalize(run) as ReviewItem;

      expect(result.human_feedback.corrected_text).toBe('Improved response text');
      expect(result.human_feedback.comments).toContain('Good answer');
    });

    it('should handle runs with errors', () => {
      const run = {
        run_id: 'run_error',
        run_type: 'llm',
        inputs: { prompt: 'Test' },
        outputs: {},
        error: 'Rate limit exceeded',
      };

      const result = langSmithAdapter.normalize(run) as ReviewItem;

      expect(result.trace_metadata?.error).toBe('Rate limit exceeded');
    });
  });

  describe('validate', () => {
    it('should validate correct LangSmith data', () => {
      const data = { run_id: 'test', inputs: {}, outputs: {} };
      const result = langSmithAdapter.validate!(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid data', () => {
      const data = { foo: 'bar' };
      const result = langSmithAdapter.validate!(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
