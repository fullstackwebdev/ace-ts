/**
 * Skill deduplication module for ACE framework.
 *
 * This module provides semantic deduplication for skillbook skills using
 * embeddings and SkillManager-driven consolidation decisions.
 */

export { DeduplicationConfig, createDeduplicationConfig } from './config.js';
export type { EmbeddingProvider } from './config.js';
export { SimilarityDetector } from './detector.js';
export { DeduplicationManager } from './manager.js';
export {
  ConsolidationOperation,
  MergeOp,
  DeleteOp,
  KeepOp,
  UpdateOp,
  applyConsolidationOperations,
} from './operations.js';
export { generateSimilarityReport, formatPairForLogging } from './prompts.js';
