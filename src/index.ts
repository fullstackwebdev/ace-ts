/**
 * ACE Framework - TypeScript Port
 * Build self-improving AI agents that learn from experience
 */

// Core exports
export type { Skill, SimilarityDecision } from './skillbook.js';
export { Skillbook, createSkill, skillToLLMDict } from './skillbook.js';

export type { UpdateOperation, UpdateBatch, OperationType } from './updates.js';
export {
  createUpdateOperation,
  createUpdateBatch,
  updateOperationFromJSON,
  updateBatchFromJSON,
  updateOperationToJSON,
  updateBatchToJSON,
} from './updates.js';

// LLM clients
export type { LLMClient, LLMResponse } from './llm.js';
export {
  DummyLLMClient,
  VercelAIClient,
  createLLMClient,
} from './llm.js';

// Roles
export type { AgentOutput, ReflectorOutput } from './roles.js';
export {
  Agent,
  ReplayAgent,
  Reflector,
  SkillManager,
  extractCitedSkillIds,
} from './roles.js';

// Prompts
export {
  SKILLBOOK_USAGE_INSTRUCTIONS,
  wrapSkillbookForExternalAgent,
  createAgentPrompt,
  createReflectorPrompt,
  createSkillManagerPrompt,
} from './prompts.js';

// Adaptation loops
export type {
  Sample,
  EnvironmentResult,
  TaskEnvironment,
  ACEStepResult,
  ACEConfig,
  OfflineACERunOptions,
} from './adaptation.js';
export {
  SimpleEnvironment,
  OfflineACE,
  OnlineACE,
} from './adaptation.js';

// Simple integration class (similar to ACELiteLLM)
export { ACEAgent } from './integrations/simple.js';

// Integration utilities for external agents
export { wrapSkillbookContext } from './integrations/base.js';

// Feature detection utilities
export {
  hasVercelAI,
  hasOpenAI,
  hasAnthropic,
  hasGoogleAI,
  hasLangChain,
  hasPlaywright,
  hasPuppeteer,
  hasZod,
  hasDotenv,
  getAvailableFeatures,
  printFeatureStatus,
  clearFeatureCache,
} from './features.js';
