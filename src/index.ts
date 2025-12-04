/**
 * ACE Framework - TypeScript Port
 * Build self-improving AI agents that learn from experience
 */

// Core exports
export { Skillbook, Skill, SimilarityDecision, createSkill, skillToLLMDict } from './skillbook.js';
export {
  UpdateOperation,
  UpdateBatch,
  OperationType,
  createUpdateOperation,
  createUpdateBatch,
  updateOperationFromJSON,
  updateBatchFromJSON,
  updateOperationToJSON,
  updateBatchToJSON,
} from './updates.js';

// LLM clients
export {
  LLMClient,
  LLMResponse,
  DummyLLMClient,
  VercelAIClient,
  createLLMClient,
} from './llm.js';

// Roles
export {
  Agent,
  AgentOutput,
  ReplayAgent,
  Reflector,
  ReflectorOutput,
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
export {
  Sample,
  EnvironmentResult,
  TaskEnvironment,
  SimpleEnvironment,
  ACEStepResult,
  ACEConfig,
  OfflineACE,
  OfflineACERunOptions,
  OnlineACE,
} from './adaptation.js';

// Simple integration class (similar to ACELiteLLM)
export { ACEAgent } from './integrations/simple.js';
