/**
 * Deduplication module for detecting and consolidating similar bullets.
 *
 * This module provides:
 * - Configuration for similarity thresholds and embedding providers
 * - Similarity detection using cosine similarity on embeddings
 * - Operations for merging, deleting, keeping, or updating similar bullets
 * - Manager for coordinating the deduplication workflow with the Curator
 *
 * Example usage:
 *     import { DeduplicationManager } from './deduplication';
 *
 *     const manager = new DeduplicationManager({
 *       enabled: true,
 *       similarityThreshold: 0.85,
 *     });
 *
 *     // Before Curator runs:
 *     const report = await manager.getSimilarityReport(playbook);
 *     // Include report in Curator prompt...
 *
 *     // After Curator responds:
 *     manager.applyOperationsFromResponse(curatorResponse, playbook);
 */

export * from "./config";
export * from "./detector";
export * from "./manager";
export * from "./operations";
export * from "./prompts";
