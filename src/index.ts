/**
 * ACE Framework - Agentic Context Engineering
 *
 * A TypeScript implementation of the ACE framework for self-improving language models.
 */

// Core data structures
export { DeltaOperation, DeltaBatch } from './delta.js';
export type { OperationType } from './delta.js';

export { Bullet, Playbook } from './playbook.js';
export type { BulletStatus, SimilarityDecision } from './playbook.js';

// LLM abstraction
export { LLMClient, DummyLLMClient } from './llm.js';
export type { LLMResponse } from './llm.js';

// LLM providers
export { VercelAIClient } from './llm-providers/vercel-ai-client.js';
export type { VercelAIConfig } from './llm-providers/vercel-ai-client.js';

// Roles
export {
  Generator,
  Reflector,
  Curator,
  ReplayGenerator,
  extractCitedBulletIds,
} from './roles.js';
export type {
  GeneratorOutput,
  ReflectorOutput,
  BulletTag,
} from './roles.js';

// Prompts
export {
  GENERATOR_PROMPT,
  REFLECTOR_PROMPT,
  CURATOR_PROMPT,
} from './prompts.js';
