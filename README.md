# ACE Framework (TypeScript)

> **Agentic Context Engineering** - Self-improving language model framework

A TypeScript implementation of the ACE framework from the paper ["Agentic Context Engineering: Evolving Contexts for Self-Improving Language Models"](https://arxiv.org/abs/2510.04618).

## Overview

ACE enables AI agents to learn from execution feedback through three collaborative roles:
- **Generator**: Produces answers using learned strategies
- **Reflector**: Analyzes performance and extracts lessons
- **Curator**: Updates the knowledge base (playbook) with new insights

## Installation

```bash
npm install ace-framework
```

Required peer dependencies:
```bash
npm install ai zod  # Vercel AI SDK for LLM integration
```

## Quick Start

```typescript
import { openai } from '@ai-sdk/openai';
import {
  VercelAIClient,
  Generator,
  Reflector,
  Curator,
  OfflineAdapter,
  SimpleEnvironment,
  Sample,
} from 'ace-framework';

// 1. Set up LLM client
const llm = new VercelAIClient({
  model: openai('gpt-4'),
  temperature: 0.0,
});

// 2. Create ACE roles
const generator = new Generator(llm);
const reflector = new Reflector(llm);
const curator = new Curator(llm);

// 3. Create adapter
const adapter = new OfflineAdapter(generator, reflector, curator);

// 4. Define training samples
const samples: Sample[] = [
  {
    question: 'What is 2+2?',
    groundTruth: '4',
    context: 'Simple arithmetic',
  },
];

// 5. Run training
const environment = new SimpleEnvironment();
await adapter.run(samples, environment, { epochs: 3 });

// 6. Get trained playbook
const playbook = adapter.getPlaybook();
console.log(playbook.toString());
```

## Core Concepts

### Playbook
Structured knowledge store containing learned strategies (bullets) with helpful/harmful counters.

```typescript
const playbook = new Playbook();
const bullet = playbook.addBullet('General', 'Always verify inputs before processing');
playbook.tagBullet(bullet.id, 'helpful', 1);
```

### Three Roles

**Generator** - Produces answers using playbook strategies:
```typescript
const output = await generator.generate({
  question: 'What is the capital of France?',
  context: 'Answer concisely',
  playbook: playbook,
});
```

**Reflector** - Analyzes what went right/wrong:
```typescript
const reflection = await reflector.reflect({
  question: sample.question,
  generatorOutput: output,
  feedback: 'Correct!',
  playbook: playbook,
});
```

**Curator** - Updates playbook based on reflections:
```typescript
const delta = await curator.curate({
  reflection: reflection,
  playbook: playbook,
});
playbook.applyDelta(delta);
```

### Adaptation Patterns

**Offline Training** - Multiple epochs over fixed dataset:
```typescript
const adapter = new OfflineAdapter(generator, reflector, curator);
await adapter.run(trainingSamples, environment, { epochs: 5 });
```

**Online Learning** - Sequential adaptation on test data:
```typescript
const adapter = new OnlineAdapter(generator, reflector, curator);
await adapter.run(testSamples, environment);
```

## LLM Providers

### Vercel AI SDK (Recommended)

Supports 100+ providers (OpenAI, Anthropic, Google, etc.):

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

// OpenAI
const client = new VercelAIClient({ model: openai('gpt-4') });

// Anthropic Claude
const client = new VercelAIClient({
  model: anthropic('claude-3-5-sonnet-20241022')
});

// Google Gemini
const client = new VercelAIClient({ model: google('gemini-pro') });
```

### Custom LLM Client

Implement the `LLMClient` interface:

```typescript
class MyLLMClient extends LLMClient {
  async complete(prompt: string): Promise<LLMResponse> {
    // Your implementation
    return { text: 'response', raw: {} };
  }
}
```

## Task Environments

Implement custom evaluation logic:

```typescript
class MathEnvironment extends TaskEnvironment {
  async evaluate(sample: Sample, output: GeneratorOutput): Promise<EnvironmentResult> {
    const correct = extractNumber(output.final_answer) === sample.groundTruth;

    return {
      feedback: correct ? 'Correct!' : `Wrong. Expected ${sample.groundTruth}`,
      groundTruth: sample.groundTruth,
      metrics: { accuracy: correct ? 1 : 0 },
    };
  }
}
```

## Custom Prompts

Customize prompts for your domain:

```typescript
const customPrompt = `
You are a math tutor. Use the playbook to solve problems step-by-step.

Playbook: {playbook}
Question: {question}
Context: {context}

Return JSON with: reasoning, bullet_ids, final_answer
`;

const generator = new Generator(llm, customPrompt);
```

## Architecture

```
┌─────────────────────────────────────────────┐
│            ACE Adaptation Loop               │
├─────────────────────────────────────────────┤
│                                             │
│  Sample ──► Generator ──► Environment       │
│               │              │              │
│               ▼              ▼              │
│         Reflector ◄──── Feedback            │
│               │                             │
│               ▼                             │
│           Curator ──► Playbook Update       │
│                                             │
└─────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test

# Run example
npx ts-node examples/simple-ace-example.ts
```

## Project Structure

```
src/
├── delta.ts           # Delta operations (ADD, UPDATE, TAG, REMOVE)
├── playbook.ts        # Playbook and Bullet classes
├── llm.ts             # LLM client abstraction
├── roles.ts           # Generator, Reflector, Curator
├── adaptation.ts      # OfflineAdapter, OnlineAdapter
├── prompts.ts         # Default prompt templates
├── llm-providers/     # LLM client implementations
│   └── vercel-ai-client.ts
└── __tests__/         # Test suite
```

## Key Features

- ✅ **Strict TypeScript** - Full type safety with no `any`
- ✅ **Zod Validation** - Runtime schema validation for LLM outputs
- ✅ **Multiple LLM Providers** - Via Vercel AI SDK
- ✅ **Offline & Online Adaptation** - Flexible training modes
- ✅ **Custom Prompts** - Tailor to your domain
- ✅ **Custom Environments** - Define your own evaluation logic
- ✅ **Playbook Persistence** - Save/load trained models
- ✅ **Delta Operations** - Incremental playbook updates

## API Reference

### Core Classes

- `Playbook` - Knowledge store with bullets
- `Bullet` - Single strategy entry with metadata
- `DeltaOperation` - Playbook mutation (ADD/UPDATE/TAG/REMOVE)
- `DeltaBatch` - Bundle of operations with reasoning

### Roles

- `Generator` - Produces answers using strategies
- `Reflector` - Analyzes performance
- `Curator` - Updates playbook
- `ReplayGenerator` - Replays pre-recorded responses

### Adapters

- `OfflineAdapter` - Multi-epoch training
- `OnlineAdapter` - Sequential test-time adaptation

### LLM

- `LLMClient` - Abstract base class
- `VercelAIClient` - Vercel AI SDK integration
- `DummyLLMClient` - Testing stub

### Environment

- `TaskEnvironment` - Abstract evaluation interface
- `SimpleEnvironment` - Built-in simple evaluator

## Differences from Python Version

This TypeScript port maintains API compatibility with the Python version while making some adjustments for the TypeScript ecosystem:

- **Vercel AI SDK** instead of LiteLLM (TypeScript equivalent)
- **Zod** instead of Pydantic for validation
- **Vitest** instead of pytest for testing
- **Async/await** throughout (Node.js convention)
- **TOON encoding**: Not yet implemented (waiting for TypeScript library)
- **Advanced features**: Deferred to future releases (deduplication, observability, integrations)

## Contributing

Contributions welcome! Please see the main ACE repository for guidelines.

## License

MIT

## Citation

If you use ACE in your research, please cite:

```bibtex
@article{ace2024,
  title={Agentic Context Engineering: Evolving Contexts for Self-Improving Language Models},
  author={[Authors]},
  journal={arXiv preprint arXiv:2510.04618},
  year={2024}
}
```

## Links

- [Paper](https://arxiv.org/abs/2510.04618)
- [Python Implementation](https://github.com/kayba-ai/agentic-context-engine)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
