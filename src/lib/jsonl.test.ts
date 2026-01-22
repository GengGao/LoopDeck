import { describe, expect, it, vi } from 'vitest';

// Mock uuid before importing
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

// Create a proper File mock for testing with text() method
function createMockFile(content: string, name: string, sizeOverride?: number): File {
  const blob = new Blob([content], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });

  // Ensure text() method exists (jsdom may not fully support it)
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(content),
      writable: false,
    });
  }

  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeOverride });
  }

  return file;
}

describe('JSONL Parser', () => {
  it('should parse OpenAI fine-tuning format', async () => {
    const jsonl = `{"messages":[{"role":"system","content":"You are helpful"},{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi there!"}]}`;
    const file = createMockFile(jsonl, 'test.jsonl');

    // Import after mocking
    const { parseJsonlFile } = await import('@/lib/jsonl');
    const result = await parseJsonlFile(file);

    expect(result.success).toBe(true);
    expect(result.itemsImported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('should parse generic prompt/response format', async () => {
    const jsonl = `{"prompt":"What is AI?","response":"AI is artificial intelligence"}`;
    const file = createMockFile(jsonl, 'test.jsonl');

    const { parseJsonlFile } = await import('@/lib/jsonl');
    const result = await parseJsonlFile(file);

    expect(result.success).toBe(true);
    expect(result.itemsImported).toBe(1);
  });

  it('should handle multiple lines', async () => {
    const jsonl = `{"prompt":"Q1","response":"A1"}
{"prompt":"Q2","response":"A2"}
{"prompt":"Q3","response":"A3"}`;
    const file = createMockFile(jsonl, 'test.jsonl');

    const { parseJsonlFile } = await import('@/lib/jsonl');
    const result = await parseJsonlFile(file);

    expect(result.success).toBe(true);
    expect(result.itemsImported).toBe(3);
  });

  it('should reject files over 50MB', async () => {
    // Create a mock large file by overriding the size property
    const smallContent = '{"prompt":"test","response":"test"}';
    const file = createMockFile(smallContent, 'large.jsonl', 51 * 1024 * 1024);

    const { parseJsonlFile } = await import('@/lib/jsonl');
    const result = await parseJsonlFile(file);

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('50MB');
  });

  it('should handle invalid JSON gracefully', async () => {
    const jsonl = `{"valid":"json"}
{invalid json}
{"also":"valid"}`;
    const file = createMockFile(jsonl, 'test.jsonl');

    const { parseJsonlFile } = await import('@/lib/jsonl');
    const result = await parseJsonlFile(file);

    expect(result.success).toBe(true);
    expect(result.itemsImported).toBe(2);
    expect(result.errors).toHaveLength(1);
  });

  it('should parse RAG format with input object and context_chunks', async () => {
    const jsonl = `{"input":{"prompt":"What are the SOLID principles?","context_chunks":[{"text":"SOLID is an acronym","source":"docs.md","relevance_score":0.95}]},"output":"The SOLID principles are..."}`;
    const file = createMockFile(jsonl, 'test.jsonl');

    const { parseJsonlFile } = await import('@/lib/jsonl');
    const result = await parseJsonlFile(file);

    expect(result.success).toBe(true);
    expect(result.itemsImported).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('should parse hivemind-stream format with system_prompt and context_chunks', async () => {
    const hivemindJson = JSON.stringify({
      id: '5f787071-b55e-4107-82fe-e9c6d6f94c00',
      version: 1,
      status: 'approved',
      created_at: '2026-01-13T05:06:35.945Z',
      updated_at: '2026-01-13T05:06:35.945Z',
      trace_metadata: {
        span_type: 'llm',
        source: 'hivemind',
        processing_time_ms: 53775,
      },
      input: {
        prompt: 'test prompt about amiibo',
        system_prompt: 'You are HiveMind AI, a specialist in identifying collectibles',
        context_chunks: [
          {
            id: 'grounding-0',
            text: 'pricecharting.com',
            source: 'https://www.pricecharting.com/game/amiibo/celica',
            score: 0.9,
            metadata: { type: 'web_grounding' },
          },
        ],
      },
      outputs: [
        {
          model_id: 'Gemini 3 Flash',
          text: '{"name": "Unknown Item"}',
          token_usage: 11521,
          latency_ms: 53775,
          metadata: { cost: 0.002 },
        },
      ],
      human_feedback: {},
      tags: ['auto-export', 'dev'],
    });
    const file = createMockFile(hivemindJson, 'hivemind-stream.json');

    const { parseJsonlFile } = await import('@/lib/jsonl');
    const result = await parseJsonlFile(file);

    expect(result.success).toBe(true);
    expect(result.itemsImported).toBe(1);
    expect(result.errors).toHaveLength(0);

    const item = result.items[0];
    expect(item.id).toBe('5f787071-b55e-4107-82fe-e9c6d6f94c00');
    expect(item.status).toBe('approved');
    expect(item.input.prompt).toBe('test prompt about amiibo');
    expect(item.input.system_prompt).toBe(
      'You are HiveMind AI, a specialist in identifying collectibles'
    );
    expect(item.input.context_chunks).toHaveLength(1);
    expect(item.input.context_chunks[0].text).toBe('pricecharting.com');
    expect(item.outputs[0].model_id).toBe('Gemini 3 Flash');
    expect(item.tags).toEqual(['auto-export', 'dev']);
    expect(item.trace_metadata?.source).toBe('hivemind');
  });
});

describe('JSONL Export', () => {
  it('should export in OpenAI format', async () => {
    const { exportToJsonl } = await import('@/lib/jsonl');
    const items = [
      {
        id: 'test-1',
        version: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        status: 'approved' as const,
        input: {
          prompt: 'Hello',
          system_prompt: 'Be helpful',
          context_chunks: [],
        },
        outputs: [{ model_id: 'gpt-4', text: 'Hi!', token_usage: 10, latency_ms: 100 }],
        human_feedback: {},
      },
    ];

    const result = exportToJsonl(items);
    const parsed = JSON.parse(result);

    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[0].role).toBe('system');
    expect(parsed.messages[1].role).toBe('user');
    expect(parsed.messages[2].role).toBe('assistant');
  });

  it('should use corrected text if available', async () => {
    const { exportToJsonl } = await import('@/lib/jsonl');
    const items = [
      {
        id: 'test-1',
        version: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
        status: 'modified' as const,
        input: {
          prompt: 'Hello',
          context_chunks: [],
        },
        outputs: [
          {
            model_id: 'gpt-4',
            text: 'Original',
            token_usage: 10,
            latency_ms: 100,
          },
        ],
        human_feedback: {
          corrected_text: 'Corrected response',
        },
      },
    ];

    const result = exportToJsonl(items);
    const parsed = JSON.parse(result);

    expect(parsed.messages[1].content).toBe('Corrected response');
  });
});
