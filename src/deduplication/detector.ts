/**
 * Similarity detection for bullet deduplication.
 *
 * Note: Embedding functionality requires Vercel AI SDK with embedding support.
 * Install with: npm install @ai-sdk/openai
 */

import type { Bullet, Playbook } from "../playbook";
import { DeduplicationConfig, resolveDeduplicationConfig } from "./config";

/**
 * Detect similar bullet pairs using cosine similarity on embeddings.
 */
export class SimilarityDetector {
  private config: Required<DeduplicationConfig>;

  constructor(config?: DeduplicationConfig) {
    this.config = resolveDeduplicationConfig(config);
  }

  /**
   * Compute embedding for a single text.
   *
   * @param text - Text to embed
   * @returns Embedding vector as array of floats, or undefined if embedding fails
   */
  async computeEmbedding(text: string): Promise<number[] | undefined> {
    if (this.config.embeddingProvider === "vercel-ai") {
      return this.computeEmbeddingVercelAI(text);
    } else {
      // Transformers provider not yet implemented in TypeScript
      console.warn("Transformers embedding provider not yet implemented");
      return undefined;
    }
  }

  /**
   * Compute embeddings for multiple texts (more efficient).
   *
   * @param texts - List of texts to embed
   * @returns List of embedding vectors (undefined for any that fail)
   */
  async computeEmbeddingsBatch(
    texts: string[]
  ): Promise<Array<number[] | undefined>> {
    if (texts.length === 0) {
      return [];
    }

    if (this.config.embeddingProvider === "vercel-ai") {
      return this.computeEmbeddingsBatchVercelAI(texts);
    } else {
      // Transformers provider not yet implemented in TypeScript
      console.warn("Transformers embedding provider not yet implemented");
      return texts.map(() => undefined);
    }
  }

  /**
   * Compute embedding using Vercel AI SDK.
   *
   * TODO: Implement once @ai-sdk/openai embeddings are available.
   * For now, this is a placeholder that returns undefined.
   */
  private async computeEmbeddingVercelAI(
    _text: string
  ): Promise<number[] | undefined> {
    console.warn(
      "Embedding computation not yet implemented. " +
        "Install @ai-sdk/openai and implement embed() call."
    );
    return undefined;
  }

  /**
   * Batch compute embeddings using Vercel AI SDK.
   *
   * TODO: Implement once @ai-sdk/openai embeddings are available.
   * For now, this is a placeholder that returns undefined for all texts.
   */
  private async computeEmbeddingsBatchVercelAI(
    texts: string[]
  ): Promise<Array<number[] | undefined>> {
    console.warn(
      "Batch embedding computation not yet implemented. " +
        "Install @ai-sdk/openai and implement embedMany() call."
    );
    return texts.map(() => undefined);
  }

  /**
   * Compute cosine similarity between two embedding vectors.
   *
   * @param a - First embedding vector
   * @param b - Second embedding vector
   * @returns Cosine similarity score between 0 and 1
   */
  cosineSimilarity(a: number[], b: number[]): number {
    // Pure TypeScript implementation
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0.0;
    }

    return dot / (normA * normB);
  }

  /**
   * Ensure all active bullets have embeddings computed.
   *
   * @param playbook - Playbook to process
   * @returns Number of embeddings computed
   */
  async ensureEmbeddings(playbook: Playbook): Promise<number> {
    const bulletsNeedingEmbeddings = playbook
      .bullets()
      .filter((b) => b.embedding === undefined);

    if (bulletsNeedingEmbeddings.length === 0) {
      return 0;
    }

    const texts = bulletsNeedingEmbeddings.map((b) => b.content);
    const embeddings = await this.computeEmbeddingsBatch(texts);

    let count = 0;
    for (let i = 0; i < bulletsNeedingEmbeddings.length; i++) {
      const embedding = embeddings[i];
      if (embedding !== undefined) {
        bulletsNeedingEmbeddings[i].embedding = embedding;
        count++;
      }
    }

    console.info(`Computed ${count} embeddings for bullets`);
    return count;
  }

  /**
   * Find all pairs of bullets with similarity >= threshold.
   *
   * @param playbook - Playbook to search
   * @param threshold - Similarity threshold (default: config.similarityThreshold)
   * @returns List of [bullet_a, bullet_b, similarity_score] tuples,
   *          sorted by similarity score descending
   */
  detectSimilarPairs(
    playbook: Playbook,
    threshold?: number
  ): Array<[Bullet, Bullet, number]> {
    const similarityThreshold = threshold ?? this.config.similarityThreshold;
    const similarPairs: Array<[Bullet, Bullet, number]> = [];

    // Get active bullets only
    const bullets = playbook.bullets(false);

    // Group by section if configured
    if (this.config.withinSectionOnly) {
      const sections: Map<string, Bullet[]> = new Map();
      for (const bullet of bullets) {
        const sectionBullets = sections.get(bullet.section) || [];
        sectionBullets.push(bullet);
        sections.set(bullet.section, sectionBullets);
      }

      for (const sectionBullets of sections.values()) {
        const pairs = this.findSimilarInList(
          sectionBullets,
          playbook,
          similarityThreshold
        );
        similarPairs.push(...pairs);
      }
    } else {
      similarPairs.push(
        ...this.findSimilarInList(bullets, playbook, similarityThreshold)
      );
    }

    // Sort by similarity descending
    similarPairs.sort((a, b) => b[2] - a[2]);
    return similarPairs;
  }

  /**
   * Find similar pairs within a list of bullets.
   */
  private findSimilarInList(
    bullets: Bullet[],
    playbook: Playbook,
    threshold: number
  ): Array<[Bullet, Bullet, number]> {
    const pairs: Array<[Bullet, Bullet, number]> = [];

    for (let i = 0; i < bullets.length; i++) {
      const bulletA = bullets[i];
      if (!bulletA.embedding) {
        continue;
      }

      for (let j = i + 1; j < bullets.length; j++) {
        const bulletB = bullets[j];
        if (!bulletB.embedding) {
          continue;
        }

        // Skip pairs with existing KEEP decisions
        if (playbook.hasKeepDecision(bulletA.id, bulletB.id)) {
          continue;
        }

        const similarity = this.cosineSimilarity(
          bulletA.embedding,
          bulletB.embedding
        );

        if (similarity >= threshold) {
          pairs.push([bulletA, bulletB, similarity]);
        }
      }
    }

    return pairs;
  }
}
