# LoopDeck

Open-source UI component library for reviewing, debugging, and curating Large Language Model (LLM) outputs.

![LoopDeck Screenshot](docs/screenshot.png)

## Features

- 📁 **Multi-Format Import** - Native support for OpenAI, LangSmith traces, OpenTelemetry spans, and custom RAG logs
- 🔭 **Observability Integration** - Import traces directly from LangSmith/LangChain and OpenTelemetry-instrumented apps
- 🔄 **Context Reranking** - Drag-and-drop interface to reorder and exclude context chunks
- ⚖️ **Model Comparison** - Side-by-side view for A/B testing multiple model outputs
- ✨ **Golden Response Editor** - Create ideal responses by combining and editing outputs
- 🎯 **RLHF Support** - Keyboard shortcuts (1, 2, 3) for rapid preference voting
- 💾 **Local-First** - All data stored in IndexedDB, works offline
- 🌙 **Dark Mode** - Automatic theme detection with manual toggle
- ⚡ **Virtualized Lists** - Handle 100k+ items efficiently

## Quick Start

```bash
# Clone the repository
git clone https://github.com/GengGao/LoopDeck.git
cd loopdeck

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Import Data

Drop a JSONL or JSON file on the upload zone. Supported formats:

**OpenAI Fine-tuning Format:**
```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

**LangSmith Run Export:**
```json
{"run_id":"...","inputs":{"messages":[...]},"outputs":{"generations":[[{"text":"..."}]]},"run_type":"llm"}
```

**OpenTelemetry Trace (OTLP JSON):**
```json
{"resourceSpans":[{"scopeSpans":[{"spans":[{"traceId":"...","spanId":"...","name":"llm.chat","attributes":[...]}]}]}]}
```

**RAG Format with Context:**
```json
{"prompt":"...","response":"...","context":[{"text":"...","source":"...","score":0.95}]}
```

**Generic Format:**
```json
{"prompt":"...","response":"..."}
```

> **Note:** LangSmith and OpenTelemetry imports extract only leaf LLM spans by default. Hierarchical trace visualization is planned for Phase 2.

### Review Workflow

1. **Import** - Drop your JSONL file
2. **Review** - Click items to see details
3. **Rerank** - Drag context chunks to reorder them
4. **Compare** - Use side-by-side view for multiple outputs
5. **Vote** - Press 1, 2, 3 to select the best model
6. **Edit** - Create golden responses
7. **Export** - Download approved items for training

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `1`, `2`, `3` | Vote for model outputs |
| `Tab` | Navigate between items/chunks |
| `↑`, `↓` | Move focus up/down |
| `Ctrl+Shift+E` | Open export dialog |

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **UI:** Shadcn UI + Tailwind CSS
- **State:** Zustand
- **Database:** Dexie.js (IndexedDB)
- **Drag & Drop:** dnd-kit
- **Virtualization:** @tanstack/react-virtual
- **Testing:** Vitest + Playwright
- **Linting:** Biome.js

## Development

```bash
# Run development server
npm run dev

# Run tests
npm run test

# Run E2E tests
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

## Project Structure

```
src/
├── app/                 # Next.js App Router pages
├── components/          # React components
│   ├── ui/             # Shadcn UI components
│   ├── context-reranker.tsx
│   ├── review-queue.tsx
│   ├── review-detail.tsx
│   └── ...
├── lib/                 # Utilities
│   ├── db.ts           # Dexie.js database
│   ├── jsonl.ts        # JSONL parser/exporter
│   └── utils.ts        # Helper functions
├── store/              # Zustand state management
├── types/              # TypeScript types
└── test/               # Test setup
```

## Data Schema

```typescript
interface ReviewItem {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  trace_metadata?: {
    trace_id?: string;    // Original trace ID (LangSmith run_id, OTel traceId)
    span_type?: 'llm' | 'retriever' | 'chain' | 'tool';
    source?: 'langsmith' | 'otel' | 'manual';
    error?: string;
  };
  input: {
    prompt: string;
    system_prompt?: string;
    context_chunks: ContextChunk[];
  };
  outputs: ModelOutput[];
  human_feedback: {
    selected_model_id?: string;
    corrected_text?: string;
    comments?: string;
  };
}
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Roadmap

- [x] Phase 1: Core review workflow with batch trace import (LangSmith, OpenTelemetry)
- [ ] Phase 2: JSON Repair, Diff View, Undo/Redo, Hierarchical trace visualization
- [ ] Phase 3: Real-time trace ingestion (LangSmith API, OTel collector webhook), Cloud Sync
- [ ] Phase 4: Team Collaboration, Analytics Dashboard, Custom adapter SDK

---

Built with ❤️ for the AI/ML community
