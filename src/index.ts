/**
 * ACE Framework - TypeScript Port
 * Build self-improving AI agents that learn from experience
 */

// Core exports
export type { Skill, SimilarityDecision } from "./skillbook.js";
export { Skillbook, createSkill, skillToLLMDict } from "./skillbook.js";

export type { UpdateOperation, UpdateBatch, OperationType } from "./updates.js";
export {
  createUpdateOperation,
  createUpdateBatch,
  updateOperationFromJSON,
  updateBatchFromJSON,
  updateOperationToJSON,
  updateBatchToJSON,
} from "./updates.js";

// LLM clients
export type { LLMClient, LLMResponse } from "./llm.js";
export {
  DummyLLMClient,
  OpenAICompatibleClient,
  createLLMClient,
  type OpenAICompatibleClientConfig,
} from "./llm.js";

// Roles
export type { AgentOutput, ReflectorOutput } from "./roles.js";
export {
  Agent,
  ReplayAgent,
  Reflector,
  SkillManager,
  extractCitedSkillIds,
} from "./roles.js";

// Prompts v1 (basic)
export {
  SKILLBOOK_USAGE_INSTRUCTIONS,
  wrapSkillbookForExternalAgent,
  createAgentPrompt,
  createReflectorPrompt,
  createSkillManagerPrompt,
} from "./prompts.js";

// Prompts v2 (advanced)
export {
  AGENT_V2_PROMPT,
  GENERATOR_V2_PROMPT,
  REFLECTOR_V2_PROMPT,
  SKILL_MANAGER_V2_PROMPT,
  CURATOR_V2_PROMPT,
  AGENT_MATH_PROMPT,
  GENERATOR_MATH_PROMPT,
  AGENT_CODE_PROMPT,
  GENERATOR_CODE_PROMPT,
  PromptManager,
  validatePromptOutput,
  MIGRATION_GUIDE,
} from "./prompts_v2.js";
export type { PromptVersions, ValidationResult } from "./prompts_v2.js";

// Prompts v2.1 (state-of-the-art - RECOMMENDED, +17% success rate)
export {
  SKILLBOOK_USAGE_INSTRUCTIONS as SKILLBOOK_USAGE_INSTRUCTIONS_V21,
  wrapSkillbookForExternalAgent as wrapSkillbookForExternalAgentV21,
  AGENT_V2_1_PROMPT,
  REFLECTOR_V2_1_PROMPT,
  SKILL_MANAGER_V2_1_PROMPT,
  AGENT_MATH_V2_1_PROMPT,
  AGENT_CODE_V2_1_PROMPT,
  PromptManager as PromptManagerV21,
  validatePromptOutputV21,
  MIGRATION_GUIDE_V21,
  comparePromptVersions,
} from "./prompts_v2_1.js";

// Adaptation loops
export type {
  Sample,
  EnvironmentResult,
  TaskEnvironment,
  ACEStepResult,
  ACEConfig,
  OfflineACERunOptions,
} from "./adaptation.js";
export { SimpleEnvironment, OfflineACE, OnlineACE } from "./adaptation.js";

// Async learning infrastructure
export type {
  LearningTask,
  ReflectionResult,
  AsyncLearningPipelineOptions,
  AsyncLearningPipelineStats,
} from "./async_learning.js";
export {
  ThreadSafeSkillbook,
  AsyncLearningPipeline,
} from "./async_learning.js";

// Simple integration class (similar to ACELiteLLM)
export { ACEAgent } from "./integrations/simple.js";

// Integration utilities for external agents
export { wrapSkillbookContext } from "./integrations/base.js";

// LLM Provider implementations (re-exports for organized imports)
export {
  OpenAICompatibleClient as OpenAIProviderClient,
  createLLMClient as createProviderClient,
} from "./llm_providers/index.js";

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
} from "./features.js";

// Deduplication system
export type {
  DeduplicationConfig,
  EmbeddingProvider,
  MergeOp,
  DeleteOp,
  KeepOp,
  UpdateOp,
  ConsolidationOperation,
} from "./deduplication/index.js";
export {
  createDeduplicationConfig,
  SimilarityDetector,
  DeduplicationManager,
  applyConsolidationOperations,
  generateSimilarityReport,
  formatPairForLogging,
} from "./deduplication/index.js";

// Observability system (optional - requires 'opik' package)
export {
  OpikIntegration,
  configureOpik,
  getIntegration,
  OPIK_AVAILABLE,
  aceTrack,
  trackRole,
  maybeTrack,
} from "./observability/index.js";
