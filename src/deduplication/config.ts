/**
 * Configuration for bullet deduplication.
 */

export type EmbeddingProvider = "vercel-ai" | "transformers";

/**
 * Configuration for bullet deduplication.
 *
 * @property enabled - Whether deduplication is enabled (default: true)
 * @property embeddingModel - Model to use for computing embeddings
 * @property embeddingProvider - Provider for embeddings ('vercel-ai' or 'transformers')
 * @property similarityThreshold - Minimum similarity score to consider bullets as similar
 * @property minPairsToReport - Minimum number of similar pairs before including in Curator prompt
 * @property withinSectionOnly - If true, only compare bullets within the same section
 * @property localModelName - Optional: local model name (used if embeddingProvider='transformers')
 */
export interface DeduplicationConfig {
  // Feature flags
  enabled?: boolean;

  // Embedding settings
  embeddingModel?: string;
  embeddingProvider?: EmbeddingProvider;

  // Similarity thresholds
  similarityThreshold?: number;

  // Cost control: only report similar pairs if >= this many found
  minPairsToReport?: number;

  // Scope
  withinSectionOnly?: boolean;

  // Optional: local model name (used if embeddingProvider='transformers')
  localModelName?: string;
}

/**
 * Default deduplication configuration.
 */
export const DEFAULT_DEDUPLICATION_CONFIG: Required<DeduplicationConfig> = {
  enabled: true,
  embeddingModel: "text-embedding-3-small",
  embeddingProvider: "vercel-ai",
  similarityThreshold: 0.85,
  minPairsToReport: 1,
  withinSectionOnly: true,
  localModelName: "all-MiniLM-L6-v2",
};

/**
 * Merge user config with defaults.
 */
export function resolveDeduplicationConfig(
  config?: DeduplicationConfig
): Required<DeduplicationConfig> {
  return {
    ...DEFAULT_DEDUPLICATION_CONFIG,
    ...config,
  };
}
