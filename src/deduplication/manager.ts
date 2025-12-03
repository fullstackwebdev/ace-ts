/**
 * Deduplication manager for coordinating similarity detection and operations.
 */

import type { Playbook } from "../playbook";
import { DeduplicationConfig, resolveDeduplicationConfig } from "./config";
import { SimilarityDetector } from "./detector";
import {
  ConsolidationOperation,
  MergeOp,
  DeleteOp,
  KeepOp,
  UpdateOp,
  applyConsolidationOperations,
} from "./operations";
import {
  generateSimilarityReport,
  formatPairForLogging,
} from "./prompts";

/**
 * Manages similarity detection and feeds info to Curator.
 *
 * This class coordinates:
 * 1. Computing/updating embeddings for bullets
 * 2. Detecting similar bullet pairs
 * 3. Generating similarity reports for the Curator prompt
 * 4. Parsing and applying consolidation operations from Curator
 *
 * Usage:
 *     const manager = new DeduplicationManager(config);
 *     const report = await manager.getSimilarityReport(playbook);
 *     // Include report in Curator prompt...
 *     // After Curator responds:
 *     manager.applyOperationsFromResponse(curatorResponse, playbook);
 */
export class DeduplicationManager {
  private config: Required<DeduplicationConfig>;
  private detector: SimilarityDetector;

  constructor(config?: DeduplicationConfig) {
    this.config = resolveDeduplicationConfig(config);
    this.detector = new SimilarityDetector(config);
  }

  /**
   * Generate similarity report to include in Curator prompt.
   *
   * This should be called BEFORE the Curator runs.
   *
   * @param playbook - The playbook to analyze
   * @returns Formatted similarity report string, or undefined if no similar pairs found
   *          or deduplication is disabled
   */
  async getSimilarityReport(playbook: Playbook): Promise<string | undefined> {
    if (!this.config.enabled) {
      return undefined;
    }

    // Ensure all bullets have embeddings
    await this.detector.ensureEmbeddings(playbook);

    // Detect similar pairs
    const similarPairs = this.detector.detectSimilarPairs(playbook);

    if (similarPairs.length < this.config.minPairsToReport) {
      if (similarPairs.length > 0) {
        console.debug(
          `Found ${similarPairs.length} similar pairs, ` +
            `below threshold of ${this.config.minPairsToReport}`
        );
      }
      return undefined;
    }

    // Log found pairs
    console.info(`Found ${similarPairs.length} similar bullet pairs`);
    for (const [bulletA, bulletB, similarity] of similarPairs) {
      console.debug(formatPairForLogging(bulletA, bulletB, similarity));
    }

    // Generate report
    return generateSimilarityReport(similarPairs);
  }

  /**
   * Parse consolidation operations from Curator response.
   *
   * @param responseData - Parsed JSON response from Curator
   * @returns List of ConsolidationOperation objects
   */
  parseConsolidationOperations(
    responseData: Record<string, any>
  ): ConsolidationOperation[] {
    const operations: ConsolidationOperation[] = [];
    const rawOps = responseData.consolidation_operations;

    if (!Array.isArray(rawOps)) {
      if (rawOps !== undefined) {
        console.warn("consolidation_operations is not a list");
      }
      return operations;
    }

    for (const rawOp of rawOps) {
      if (typeof rawOp !== "object" || rawOp === null) {
        continue;
      }

      const opType = (rawOp.type || "").toUpperCase();

      try {
        if (opType === "MERGE") {
          operations.push({
            type: "MERGE",
            source_ids: rawOp.source_ids || [],
            merged_content: rawOp.merged_content || "",
            keep_id: rawOp.keep_id || "",
            reasoning: rawOp.reasoning || "",
          } as MergeOp);
        } else if (opType === "DELETE") {
          operations.push({
            type: "DELETE",
            bullet_id: rawOp.bullet_id || "",
            reasoning: rawOp.reasoning || "",
          } as DeleteOp);
        } else if (opType === "KEEP") {
          operations.push({
            type: "KEEP",
            bullet_ids: rawOp.bullet_ids || [],
            differentiation: rawOp.differentiation || "",
            reasoning: rawOp.reasoning || "",
          } as KeepOp);
        } else if (opType === "UPDATE") {
          operations.push({
            type: "UPDATE",
            bullet_id: rawOp.bullet_id || "",
            new_content: rawOp.new_content || "",
            reasoning: rawOp.reasoning || "",
          } as UpdateOp);
        } else {
          console.warn(`Unknown consolidation operation type: ${opType}`);
        }
      } catch (error) {
        console.warn(`Failed to parse consolidation operation: ${error}`);
      }
    }

    console.info(`Parsed ${operations.length} consolidation operations`);
    return operations;
  }

  /**
   * Apply consolidation operations to the playbook.
   *
   * @param operations - List of operations to apply
   * @param playbook - Playbook to modify
   */
  applyOperations(
    operations: ConsolidationOperation[],
    playbook: Playbook
  ): void {
    if (operations.length === 0) {
      return;
    }

    console.info(`Applying ${operations.length} consolidation operations`);
    applyConsolidationOperations(operations, playbook);
  }

  /**
   * Parse and apply consolidation operations from Curator response.
   *
   * Convenience method that combines parse and apply.
   *
   * @param responseData - Parsed JSON response from Curator
   * @param playbook - Playbook to modify
   * @returns List of operations that were applied
   */
  applyOperationsFromResponse(
    responseData: Record<string, any>,
    playbook: Playbook
  ): ConsolidationOperation[] {
    const operations = this.parseConsolidationOperations(responseData);
    this.applyOperations(operations, playbook);
    return operations;
  }
}
