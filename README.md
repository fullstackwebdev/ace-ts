# ACE Framework - TypeScript Port

**AI agents that get smarter with every task 🧠**

TypeScript port of the Agentic Context Engine (ACE) framework. Build self-improving AI agents that learn from experience.

> This is a TypeScript port of the [Python ACE framework](https://github.com/kayba-ai/agentic-context-engine) using Vercel AI SDK instead of LiteLLM.

## Features

- 🧠 **Self-Improving**: Agents autonomously get smarter with each task
- 📈 **Proven Results**: 20-35% better performance on complex tasks
- 🔄 **No Fine-tuning**: Learn in-context through iterative updates
- ⚡ **Type-Safe**: Full TypeScript support with strict typing
- 🚀 **Multi-Provider**: Works with OpenAI, Anthropic, Google, and more (via Vercel AI SDK)

## Quick Start

### Installation

```bash
npm install @kayba/ace-framework @ai-sdk/openai ai zod
```

### Basic Usage

```typescript
import { ACEAgent } from '@kayba/ace-framework';
import { openai } from '@ai-sdk/openai';

// Create self-improving agent
const agent = new ACEAgent({
  model: openai('gpt-4o-mini')
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

- **LLM Provider**: Uses Vercel AI SDK instead of LiteLLM
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

Via Vercel AI SDK:

```typescript
// OpenAI
import { openai } from '@ai-sdk/openai';
const agent = new ACEAgent({ model: openai('gpt-4') });

// Anthropic
import { anthropic } from '@ai-sdk/anthropic';
const agent = new ACEAgent({ model: anthropic('claude-3-5-sonnet-20241022') });

// Google
import { google } from '@ai-sdk/google';
const agent = new ACEAgent({ model: google('gemini-2.0-flash-exp') });
```

## Examples

See the `examples/` directory:

- `simple-example.ts` - Basic Q&A with automatic learning
- `seahorse-emoji.ts` - Seahorse emoji challenge (learning from mistakes)

Run examples:

```bash
# Install dependencies first
npm install

# Run with tsx
npx tsx examples/simple-example.ts
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
├── llm.ts               # LLM client interface (Vercel AI SDK)
├── roles.ts             # Agent, Reflector, SkillManager
├── prompts.ts           # Prompt templates (v2.1)
└── integrations/
    └── simple.ts        # ACEAgent (simple integration)

examples/
├── simple-example.ts    # Basic usage
└── seahorse-emoji.ts    # Learning from mistakes

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
