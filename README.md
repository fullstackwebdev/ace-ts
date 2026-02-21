# ACE Framework - TypeScript Port

**AI agents that get smarter with every task 🧠**

TypeScript port of the Agentic Context Engine (ACE) framework. Build self-improving AI agents that learn from experience.

> This is a TypeScript port of the [Python ACE framework](https://github.com/kayba-ai/agentic-context-engine) using OpenAI-compatible HTTP client instead of LiteLLM.

## Features

- 🧠 **Self-Improving**: Agents autonomously get smarter with each task
- 📈 **Proven Results**: 20-35% better performance on complex tasks
- 🔄 **No Fine-tuning**: Learn in-context through iterative updates
- ⚡ **Type-Safe**: Full TypeScript support with strict typing
- 🚀 **Multi-Provider**: Works with any OpenAI-compatible API (llama.cpp, Ollama, vLLM, OpenAI, etc.)

## Quick Start

### Installation

```bash
npm install @kayba/ace-framework zod
```

### Basic Usage

```typescript
import { ACEAgent } from '@kayba/ace-framework';

// Create self-improving agent with local LLM server
const agent = new ACEAgent({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b"
});

// Ask questions - agent learns automatically
const answer = await agent.ask("What does Kayba's ACE framework do?");
console.log(answer);

// View learned strategies
console.log(`✅ Learned ${agent.getStats().skills} skills`);

// Save for reuse
agent.saveSkillbook("my-agent.json");
```

## Architecture

The ACE framework uses three specialized roles:

1. **🎯 Agent** - Produces answers using learned skills
2. **🔍 Reflector** - Analyzes what worked and what didn't
3. **📝 SkillManager** - Updates the skillbook with new learnings

All three roles use the same base LLM with different specialized prompts.

## Key Differences from Python Version

- **LLM Provider**: Uses OpenAI-compatible HTTP client instead of LiteLLM
- **Type System**: Full TypeScript with Zod schemas instead of Pydantic
- **JSON Format**: Uses JSON instead of TOON for skillbook serialization
- **Async/Await**: All operations are async (native TypeScript patterns)
- **Module System**: ES modules instead of Python imports

## Core API

### ACEAgent

Simple integration for Q&A and reasoning tasks:

```typescript
const agent = new ACEAgent({
  model: openai('gpt-4o-mini'),
  skillbookPath: 'optional-save-path.json'
});

const answer = await agent.ask("Your question");
```

### Low-Level API

For more control:

```typescript
import { Agent, Reflector, SkillManager, Skillbook } from '@kayba/ace-framework';

const skillbook = new Skillbook();
const agent = new Agent(llmClient);
const reflector = new Reflector(llmClient);
const skillManager = new SkillManager(llmClient);

// Generate answer
const output = await agent.generate({
  question: "What is 2+2?",
  skillbook
});

// Reflect on performance
const reflection = await reflector.reflect({
  question: "What is 2+2?",
  generatorAnswer: output.final_answer,
  feedback: "Correct!",
  skillbook
});

// Update skillbook
const updates = await skillManager.curate({
  reflectionAnalysis: reflection.analysis,
  skillbook
});

skillbook.applyUpdate(updates);
```

## Skillbook Management

```typescript
import { Skillbook } from '@kayba/ace-framework';

// Create new skillbook
const skillbook = new Skillbook();

// Add skills manually
skillbook.addSkill("general", "Always verify input data");

// Save/load
skillbook.saveToFile("my-skillbook.json");
const loaded = Skillbook.loadFromFile("my-skillbook.json");

// Get statistics
console.log(skillbook.stats());
// { sections: 1, skills: 1, tags: { helpful: 0, harmful: 0, neutral: 0 } }
```

## Supported LLM Providers

Works with any OpenAI-compatible API:

```typescript
// Local llama.cpp server
const agent = new ACEAgent({
  baseURL: "http://localhost:8080",
  model: "llama-3.1-8b"
});

// Ollama
const agent = new ACEAgent({
  baseURL: "http://localhost:11434/v1",
  model: "llama3.1"
});

// OpenAI API
const agent = new ACEAgent({
  baseURL: "https://api.openai.com/v1",
  model: "gpt-4",
  apiKey: process.env.OPENAI_API_KEY
});

// vLLM
const agent = new ACEAgent({
  baseURL: "http://localhost:5000/v1",
  model: "meta-llama/Llama-3.1-8B"
});
```

## Training & Adaptation

ACE supports two learning modes:

### Offline Training

Train over a fixed dataset multiple times:

```typescript
import { OfflineACE, Agent, Reflector, SkillManager, SimpleEnvironment } from '@kayba/ace-framework';

const ace = new OfflineACE({
  agent: new Agent(llmClient),
  reflector: new Reflector(llmClient),
  skillManager: new SkillManager(llmClient)
});

const samples = [
  { question: "What is 2+2?", groundTruth: "4" },
  { question: "What is 5*3?", groundTruth: "15" }
];

// Train for 3 epochs
const results = await ace.run(samples, new SimpleEnvironment(), {
  epochs: 3,
  checkpointInterval: 10,
  checkpointDir: './checkpoints'
});

// Access evolved skillbook
const skillbook = ace.getSkillbook();
```

### Online Learning

Learn continuously from streaming samples:

```typescript
import { OnlineACE, Agent, Reflector, SkillManager, SimpleEnvironment } from '@kayba/ace-framework';

const ace = new OnlineACE({
  skillbook: await Skillbook.loadFromFile('pretrained.json'),
  agent: new Agent(llmClient),
  reflector: new Reflector(llmClient),
  skillManager: new SkillManager(llmClient)
});

// Process samples as they arrive
const results = await ace.run(streamingSamples, new SimpleEnvironment());
```

### Custom Task Environments

Implement your own evaluation logic:

```typescript
import { TaskEnvironment, Sample, AgentOutput, EnvironmentResult } from '@kayba/ace-framework';

class MathEnvironment implements TaskEnvironment {
  evaluate(sample: Sample, agentOutput: AgentOutput): EnvironmentResult {
    const predicted = extractNumber(agentOutput.finalAnswer);
    const correct = predicted.toString() === sample.groundTruth;

    return {
      feedback: correct ? "Correct!" : `Wrong. Expected ${sample.groundTruth}`,
      groundTruth: sample.groundTruth,
      metrics: { accuracy: correct ? 1.0 : 0.0 }
    };
  }
}
```

## Examples

See the `examples/` directory:

- `simple-example.ts` - Basic Q&A with automatic learning
- `seahorse-emoji.ts` - Seahorse emoji challenge (learning from mistakes)
- `offline-training.ts` - Multi-epoch training over math problems
- `online-learning.ts` - Continuous learning from streaming samples

Run examples:

```bash
# Install dependencies first
npm install

# Run with tsx
npx tsx examples/simple-example.ts
npx tsx examples/offline-training.ts
npx tsx examples/online-learning.ts
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Lint
npm run lint

# Format
npm run format
```

## Project Structure

```
src/
├── index.ts              # Main exports
├── skillbook.ts          # Skillbook storage and CRUD
├── updates.ts            # Update operations (ADD, UPDATE, TAG, REMOVE)
├── llm.ts               # LLM client interface (OpenAI-compatible HTTP)
├── roles.ts             # Agent, Reflector, SkillManager
├── prompts.ts           # Prompt templates (v2.1)
├── adaptation.ts        # OfflineACE, OnlineACE training loops
└── integrations/
    └── simple.ts        # ACEAgent (simple integration)

examples/
├── simple-example.ts    # Basic usage
├── seahorse-emoji.ts    # Learning from mistakes
├── offline-training.ts  # Multi-epoch training
└── online-learning.ts   # Continuous learning

tests/
└── skillbook.test.ts    # Unit tests

dist/                    # Compiled JavaScript (after build)
```

## Migration from Python

Key changes when migrating from Python ACE:

| Python | TypeScript |
|--------|-----------|
| `from ace import ACELiteLLM` | `import { ACEAgent } from '@kayba/ace-framework'` |
| `LiteLLMClient(model="gpt-4")` | `new ACEAgent({ model: openai('gpt-4') })` |
| `agent.ask(question)` | `await agent.ask(question)` |
| `Playbook` | `Skillbook` |
| `DeltaOperation` | `UpdateOperation` |
| `Curator` | `SkillManager` |
| Pydantic models | Zod schemas |
| `.as_prompt()` returns TOON | `.asPrompt()` returns JSON |

## License

MIT

## Acknowledgments

Based on the [ACE paper](https://arxiv.org/abs/2510.04618) from Stanford & SambaNova.

**Built with ❤️ by Kayba.ai**
