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

// Prompts v2.1
export {
  GENERATOR_V2_1_PROMPT,
  REFLECTOR_V2_1_PROMPT,
  CURATOR_V2_1_PROMPT,
  GENERATOR_MATH_V2_1_PROMPT,
  GENERATOR_CODE_V2_1_PROMPT,
  PLAYBOOK_USAGE_INSTRUCTIONS,
  wrapPlaybookForExternalAgent,
  PromptManager,
  validatePromptOutputV21,
  MIGRATION_GUIDE_V21,
  comparePromptVersions,
} from './prompts-v2-1.js';
export type {
  PromptStats,
  PromptVersion,
  ValidationResult,
  PromptComparison,
} from './prompts-v2-1.js';

// Adaptation
export {
  OfflineAdapter,
  OnlineAdapter,
  TaskEnvironment,
  SimpleEnvironment,
} from './adaptation.js';
export type {
  Sample,
  EnvironmentResult,
  AdapterStepResult,
} from './adaptation.js';

// Integrations
export { wrapPlaybookContext } from './integrations/base.js';

// Async Learning
export {
  AsyncLearningPipeline,
  ThreadSafePlaybook,
} from './async-learning.js';
export type {
  LearningTask,
  ReflectionResult,
  AsyncLearningCallbacks,
  AsyncLearningOptions,
} from './async-learning.js';

// Features
export {
  hasOpik,
  hasVercelAI,
  hasLangChain,
  hasBrowserUse,
  hasPlaywright,
  getAvailableFeatures,
  printFeatureStatus,
  resetFeatureCache,
} from './features.js';
