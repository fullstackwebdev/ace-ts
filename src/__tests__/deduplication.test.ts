/**
 * Tests for bullet deduplication feature.
 *
 * Ported from source/tests/test_deduplication.py
 */

import { describe, it, expect } from "vitest";
import {
  DeduplicationConfig,
  DEFAULT_DEDUPLICATION_CONFIG,
  DeduplicationManager,
  SimilarityDetector,
  applyConsolidationOperations,
  MergeOp,
  DeleteOp,
  KeepOp,
  UpdateOp,
  generateSimilarityReport,
  formatPairForLogging,
} from "../deduplication";
import { Bullet, Playbook, SimilarityDecision } from "../playbook";

describe("DeduplicationConfig", () => {
  it("should have correct default values", () => {
    const config = DEFAULT_DEDUPLICATION_CONFIG;
    expect(config.enabled).toBe(true);
    expect(config.embeddingModel).toBe("text-embedding-3-small");
    expect(config.embeddingProvider).toBe("vercel-ai");
    expect(config.similarityThreshold).toBe(0.85);
    expect(config.minPairsToReport).toBe(1);
    expect(config.withinSectionOnly).toBe(true);
    expect(config.localModelName).toBe("all-MiniLM-L6-v2");
  });

  it("should support custom configuration values", () => {
    const customConfig: DeduplicationConfig = {
      enabled: false,
      similarityThreshold: 0.90,
      embeddingProvider: "transformers",
      withinSectionOnly: false,
    };

    // These values should be set as provided
    expect(customConfig.enabled).toBe(false);
    expect(customConfig.similarityThreshold).toBe(0.90);
    expect(customConfig.embeddingProvider).toBe("transformers");
    expect(customConfig.withinSectionOnly).toBe(false);
  });
});

describe("SimilarityDetector", () => {
  describe("cosineSimilarity", () => {
    const detector = new SimilarityDetector();

    it("should return 1.0 for identical vectors", () => {
      const vec = [1.0, 0.0, 0.0];
      const similarity = detector.cosineSimilarity(vec, vec);
      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it("should return 0.0 for orthogonal vectors", () => {
      const vecA = [1.0, 0.0, 0.0];
      const vecB = [0.0, 1.0, 0.0];
      const similarity = detector.cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it("should return -1.0 for opposite vectors", () => {
      const vecA = [1.0, 0.0, 0.0];
      const vecB = [-1.0, 0.0, 0.0];
      const similarity = detector.cosineSimilarity(vecA, vecB);
      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it("should return 0.0 for zero vector", () => {
      const vecA = [1.0, 0.0, 0.0];
      const vecB = [0.0, 0.0, 0.0];
      const similarity = detector.cosineSimilarity(vecA, vecB);
      expect(similarity).toBe(0.0);
    });
  });

  describe("detectSimilarPairs", () => {
    it("should return empty list for empty playbook", () => {
      const detector = new SimilarityDetector();
      const playbook = new Playbook();
      const pairs = detector.detectSimilarPairs(playbook);
      expect(pairs).toHaveLength(0);
    });

    it("should find similar pairs when embeddings are set", () => {
      const detector = new SimilarityDetector({ similarityThreshold: 0.8 });
      const playbook = new Playbook();

      // Add bullets with manually set embeddings
      const bulletA = playbook.addBullet("general", "Use caching for performance");
      const bulletB = playbook.addBullet("general", "Use caching to improve speed");
      const bulletC = playbook.addBullet("general", "Log all errors to file");

      // Set embeddings - a and b are similar, c is different
      bulletA.embedding = [0.9, 0.1, 0.0];
      bulletB.embedding = [0.85, 0.15, 0.05];
      bulletC.embedding = [0.1, 0.1, 0.9];

      const pairs = detector.detectSimilarPairs(playbook);

      // Should find one similar pair (a, b)
      expect(pairs).toHaveLength(1);
      const pairIds = new Set([pairs[0][0].id, pairs[0][1].id]);
      expect(pairIds).toEqual(new Set([bulletA.id, bulletB.id]));
    });

    it("should respect KEEP decisions", () => {
      const detector = new SimilarityDetector({ similarityThreshold: 0.5 });
      const playbook = new Playbook();

      const bulletA = playbook.addBullet("general", "Strategy A");
      const bulletB = playbook.addBullet("general", "Strategy B");

      // Set similar embeddings
      bulletA.embedding = [1.0, 0.0, 0.0];
      bulletB.embedding = [0.9, 0.1, 0.0];

      // Before KEEP decision, should find pair
      const pairsBefore = detector.detectSimilarPairs(playbook);
      expect(pairsBefore).toHaveLength(1);

      // Add KEEP decision
      const decision: SimilarityDecision = {
        decision: "KEEP",
        reasoning: "They serve different purposes",
        decided_at: "2024-01-01T00:00:00Z",
        similarity_at_decision: 0.95,
      };
      playbook.setSimilarityDecision(bulletA.id, bulletB.id, decision);

      // After KEEP decision, should skip pair
      const pairsAfter = detector.detectSimilarPairs(playbook);
      expect(pairsAfter).toHaveLength(0);
    });
  });
});

describe("ConsolidationOperations", () => {
  describe("MergeOp", () => {
    it("should combine helpful/harmful counters", () => {
      const playbook = new Playbook();
      const bulletA = playbook.addBullet("general", "Strategy A");
      const bulletB = playbook.addBullet("general", "Strategy B");

      // Set some counters
      bulletA.helpful = 5;
      bulletA.harmful = 1;
      bulletB.helpful = 3;
      bulletB.harmful = 2;

      const op: MergeOp = {
        type: "MERGE",
        source_ids: [bulletA.id, bulletB.id],
        keep_id: bulletA.id,
        merged_content: "Combined strategy",
        reasoning: "Same strategy",
      };

      applyConsolidationOperations([op], playbook);

      // Check merged bullet
      const merged = playbook.getBullet(bulletA.id);
      expect(merged).not.toBeNull();
      expect(merged!.content).toBe("Combined strategy");
      expect(merged!.helpful).toBe(8); // 5 + 3
      expect(merged!.harmful).toBe(3); // 1 + 2
      expect(merged!.embedding).toBeNull(); // Invalidated

      // Check source bullet is soft-deleted
      const deleted = playbook.getBullet(bulletB.id);
      expect(deleted).not.toBeNull();
      expect(deleted!.status).toBe("invalid");
    });
  });

  describe("DeleteOp", () => {
    it("should perform soft delete", () => {
      const playbook = new Playbook();
      const bullet = playbook.addBullet("general", "To be deleted");

      const op: DeleteOp = {
        type: "DELETE",
        bullet_id: bullet.id,
        reasoning: "Redundant",
      };

      applyConsolidationOperations([op], playbook);

      // Bullet should be soft-deleted (inactive)
      const deleted = playbook.getBullet(bullet.id);
      expect(deleted).not.toBeNull();
      expect(deleted!.status).toBe("invalid");

      // Should not appear in active bullets
      const activeBullets = playbook.bullets(false);
      expect(activeBullets).toHaveLength(0);
    });
  });

  describe("KeepOp", () => {
    it("should store similarity decision", () => {
      const playbook = new Playbook();
      const bulletA = playbook.addBullet("general", "Strategy A");
      const bulletB = playbook.addBullet("general", "Strategy B");

      const op: KeepOp = {
        type: "KEEP",
        bullet_ids: [bulletA.id, bulletB.id],
        differentiation: "Different contexts",
        reasoning: "Both needed",
      };

      applyConsolidationOperations([op], playbook);

      // Check decision is stored
      expect(playbook.hasKeepDecision(bulletA.id, bulletB.id)).toBe(true);
    });
  });

  describe("UpdateOp", () => {
    it("should change bullet content", () => {
      const playbook = new Playbook();
      const bullet = playbook.addBullet("general", "Original content");
      bullet.embedding = [1.0, 0.0, 0.0];

      const op: UpdateOp = {
        type: "UPDATE",
        bullet_id: bullet.id,
        new_content: "Updated content with [Batch] tag",
        reasoning: "Clarify context",
      };

      applyConsolidationOperations([op], playbook);

      // Check content updated
      const updated = playbook.getBullet(bullet.id);
      expect(updated).not.toBeNull();
      expect(updated!.content).toBe("Updated content with [Batch] tag");
      expect(updated!.embedding).toBeNull(); // Invalidated
    });
  });
});

describe("PromptGeneration", () => {
  it("should return empty string for empty pairs", () => {
    const report = generateSimilarityReport([]);
    expect(report).toBe("");
  });

  it("should include pair information in report", () => {
    const bulletA = new Bullet({
      id: "general-00001",
      content: "Strategy A",
      section: "general",
    });
    const bulletB = new Bullet({
      id: "general-00002",
      content: "Strategy B",
      section: "general",
    });
    bulletA.helpful = 5;
    bulletB.harmful = 2;

    const pairs: Array<[Bullet, Bullet, number]> = [[bulletA, bulletB, 0.92]];
    const report = generateSimilarityReport(pairs);

    // Check key elements are present
    expect(report).toContain("Similar Bullets Detected");
    expect(report).toContain("general-00001");
    expect(report).toContain("general-00002");
    expect(report).toContain("92%"); // Similarity percentage
    expect(report).toContain("MERGE"); // Operation type in format
    expect(report).toContain("consolidation_operations");
  });

  it("should format pair for logging with truncation", () => {
    const bulletA = new Bullet({
      id: "general-00001",
      content: "A very long strategy description that should be truncated",
      section: "general",
    });
    const bulletB = new Bullet({
      id: "general-00002",
      content: "Another strategy",
      section: "general",
    });

    const logStr = formatPairForLogging(bulletA, bulletB, 0.88);

    expect(logStr).toContain("general-00001");
    expect(logStr).toContain("general-00002");
    expect(logStr).toContain("88%");
    expect(logStr).toContain("..."); // Truncation indicator
  });
});

describe("DeduplicationManager", () => {
  it("should return undefined when disabled", async () => {
    const config: DeduplicationConfig = { enabled: false };
    const manager = new DeduplicationManager(config);
    const playbook = new Playbook();

    const report = await manager.getSimilarityReport(playbook);
    expect(report).toBeUndefined();
  });

  describe("parseConsolidationOperations", () => {
    it("should parse MERGE operation", () => {
      const manager = new DeduplicationManager();
      const response = {
        consolidation_operations: [
          {
            type: "MERGE",
            source_ids: ["a", "b"],
            keep_id: "a",
            merged_content: "Combined",
            reasoning: "Same thing",
          },
        ],
      };

      const ops = manager.parseConsolidationOperations(response);

      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe("MERGE");
      const mergeOp = ops[0] as MergeOp;
      expect(mergeOp.source_ids).toEqual(["a", "b"]);
      expect(mergeOp.keep_id).toBe("a");
    });

    it("should parse multiple operation types", () => {
      const manager = new DeduplicationManager();
      const response = {
        consolidation_operations: [
          { type: "DELETE", bullet_id: "x", reasoning: "Redundant" },
          { type: "KEEP", bullet_ids: ["y", "z"], reasoning: "Different" },
          {
            type: "UPDATE",
            bullet_id: "w",
            new_content: "New",
            reasoning: "Clarify",
          },
        ],
      };

      const ops = manager.parseConsolidationOperations(response);

      expect(ops).toHaveLength(3);
      expect(ops[0].type).toBe("DELETE");
      expect(ops[1].type).toBe("KEEP");
      expect(ops[2].type).toBe("UPDATE");
    });

    it("should ignore unknown operation types", () => {
      const manager = new DeduplicationManager();
      const response = {
        consolidation_operations: [
          { type: "UNKNOWN", data: "something" },
          { type: "DELETE", bullet_id: "x", reasoning: "Valid" },
        ],
      };

      const ops = manager.parseConsolidationOperations(response);

      // Should only parse the valid DELETE
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe("DELETE");
    });

    it("should handle non-list gracefully", () => {
      const manager = new DeduplicationManager();
      const response = { consolidation_operations: "not a list" };

      const ops = manager.parseConsolidationOperations(response);
      expect(ops).toHaveLength(0);
    });
  });
});

describe("Playbook Deduplication Integration", () => {
  it("should serialize and deserialize similarity decisions", () => {
    const playbook = new Playbook();
    const bulletA = playbook.addBullet("general", "Strategy A");
    const bulletB = playbook.addBullet("general", "Strategy B");

    const decision: SimilarityDecision = {
      decision: "KEEP",
      reasoning: "Different purposes",
      decided_at: "2024-01-01T00:00:00Z",
      similarity_at_decision: 0.90,
    };
    playbook.setSimilarityDecision(bulletA.id, bulletB.id, decision);

    // Serialize and deserialize
    const data = playbook.toDict();
    const restored = Playbook.fromDict(data);

    // Check decision preserved
    expect(restored.hasKeepDecision(bulletA.id, bulletB.id)).toBe(true);
    const retrieved = restored.getSimilarityDecision(bulletA.id, bulletB.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.reasoning).toBe("Different purposes");
  });

  it("should preserve bullet embedding field", () => {
    const playbook = new Playbook();
    const bullet = playbook.addBullet("general", "Strategy");
    bullet.embedding = [0.1, 0.2, 0.3];

    const data = playbook.toDict();
    const restored = Playbook.fromDict(data);

    const restoredBullet = restored.getBullet(bullet.id);
    expect(restoredBullet).not.toBeNull();
    expect(restoredBullet!.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it("should preserve bullet on soft delete but mark as invalid", () => {
    const playbook = new Playbook();
    const bullet = playbook.addBullet("general", "Strategy");
    const bulletId = bullet.id;

    playbook.removeBullet(bulletId, true);

    // Bullet still exists
    expect(playbook.getBullet(bulletId)).not.toBeNull();

    // But is marked invalid
    expect(playbook.getBullet(bulletId)!.status).toBe("invalid");

    // And not in active bullets
    const active = playbook.bullets(false);
    expect(active).toHaveLength(0);
  });
});
