/**
 * Consolidation operations for bullet deduplication.
 */

import type { Playbook, SimilarityDecision } from "../playbook";

/**
 * Merge multiple bullets into one.
 *
 * Combines helpful/harmful counts from all source bullets into the kept bullet.
 * Other bullets are soft-deleted.
 */
export interface MergeOp {
  type: "MERGE";
  source_ids: string[]; // All bullets being merged
  merged_content: string; // New combined content
  keep_id: string; // Which ID to keep (others deleted)
  reasoning: string;
}

/**
 * Soft-delete a bullet as redundant.
 */
export interface DeleteOp {
  type: "DELETE";
  bullet_id: string;
  reasoning: string;
}

/**
 * Keep both bullets separate (they serve different purposes).
 */
export interface KeepOp {
  type: "KEEP";
  bullet_ids: string[];
  differentiation: string; // How they differ
  reasoning: string;
}

/**
 * Update a bullet's content to differentiate it.
 */
export interface UpdateOp {
  type: "UPDATE";
  bullet_id: string;
  new_content: string;
  reasoning: string;
}

/** Type alias for any consolidation operation */
export type ConsolidationOperation = MergeOp | DeleteOp | KeepOp | UpdateOp;

/**
 * Apply a list of consolidation operations to a playbook.
 *
 * @param operations - List of operations to apply
 * @param playbook - Playbook to modify
 */
export function applyConsolidationOperations(
  operations: ConsolidationOperation[],
  playbook: Playbook
): void {
  for (const op of operations) {
    switch (op.type) {
      case "MERGE":
        applyMerge(op, playbook);
        break;
      case "DELETE":
        applyDelete(op, playbook);
        break;
      case "KEEP":
        applyKeep(op, playbook);
        break;
      case "UPDATE":
        applyUpdate(op, playbook);
        break;
      default:
        console.warn(`Unknown operation type: ${(op as any).type}`);
    }
  }
}

/**
 * Apply a MERGE operation.
 */
function applyMerge(op: MergeOp, playbook: Playbook): void {
  const keepBullet = playbook.getBullet(op.keep_id);
  if (!keepBullet) {
    console.warn(`MERGE: Keep bullet ${op.keep_id} not found`);
    return;
  }

  // Combine metadata from all source bullets
  for (const sourceId of op.source_ids) {
    if (sourceId === op.keep_id) {
      continue;
    }

    const source = playbook.getBullet(sourceId);
    if (!source) {
      console.warn(`MERGE: Source bullet ${sourceId} not found`);
      continue;
    }

    // Combine counters
    keepBullet.helpful += source.helpful;
    keepBullet.harmful += source.harmful;
    keepBullet.neutral += source.neutral;

    // Soft delete source
    playbook.removeBullet(sourceId, true);
    console.info(`MERGE: Soft-deleted ${sourceId} into ${op.keep_id}`);
  }

  // Update content to merged version
  if (op.merged_content) {
    keepBullet.content = op.merged_content;
  }

  // Invalidate embedding (needs recomputation)
  keepBullet.embedding = null;
  keepBullet.updated_at = new Date().toISOString();

  console.info(`MERGE: Completed merge into ${op.keep_id}`);
}

/**
 * Apply a DELETE operation (soft delete).
 */
function applyDelete(op: DeleteOp, playbook: Playbook): void {
  const bullet = playbook.getBullet(op.bullet_id);
  if (!bullet) {
    console.warn(`DELETE: Bullet ${op.bullet_id} not found`);
    return;
  }

  playbook.removeBullet(op.bullet_id, true);
  console.info(`DELETE: Soft-deleted ${op.bullet_id}`);
}

/**
 * Apply a KEEP operation (store decision).
 */
function applyKeep(op: KeepOp, playbook: Playbook): void {
  if (op.bullet_ids.length < 2) {
    console.warn("KEEP: Need at least 2 bullet IDs");
    return;
  }

  // Store decision for each pair
  for (let i = 0; i < op.bullet_ids.length; i++) {
    const idA = op.bullet_ids[i];
    for (let j = i + 1; j < op.bullet_ids.length; j++) {
      const idB = op.bullet_ids[j];
      const decision: SimilarityDecision = {
        decision: "KEEP",
        reasoning: op.reasoning || op.differentiation,
        decided_at: new Date().toISOString(),
        similarity_at_decision: 0.0, // We don't have the score here
      };
      playbook.setSimilarityDecision(idA, idB, decision);
      console.info(`KEEP: Stored decision for (${idA}, ${idB})`);
    }
  }
}

/**
 * Apply an UPDATE operation.
 */
function applyUpdate(op: UpdateOp, playbook: Playbook): void {
  const bullet = playbook.getBullet(op.bullet_id);
  if (!bullet) {
    console.warn(`UPDATE: Bullet ${op.bullet_id} not found`);
    return;
  }

  bullet.content = op.new_content;
  bullet.embedding = null; // Needs recomputation
  bullet.updated_at = new Date().toISOString();
  console.info(`UPDATE: Updated content of ${op.bullet_id}`);
}
