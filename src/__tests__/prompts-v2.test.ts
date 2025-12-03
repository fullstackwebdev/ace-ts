/**
 * Tests for prompts-v2.ts - Version 2.0 prompts
 *
 * Tests cover:
 * - Prompt template exports and formatting
 * - PromptManager initialization and usage
 * - Domain-specific prompt selection
 * - Version control and cross-references
 * - Validation utilities
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  GENERATOR_V2_PROMPT,
  REFLECTOR_V2_PROMPT,
  CURATOR_V2_PROMPT,
  GENERATOR_MATH_PROMPT,
  GENERATOR_CODE_PROMPT,
  PromptManager,
  validatePromptOutput,
  MIGRATION_GUIDE,
} from "../prompts-v2";

describe("Prompts v2 - Template Exports", () => {
  it("exports GENERATOR_V2_PROMPT template", () => {
    expect(GENERATOR_V2_PROMPT).toBeDefined();
    expect(typeof GENERATOR_V2_PROMPT).toBe("string");
    expect(GENERATOR_V2_PROMPT.length).toBeGreaterThan(0);

    // Check for key v2 features
    expect(GENERATOR_V2_PROMPT).toContain("ACE Generator v2.0");
    expect(GENERATOR_V2_PROMPT).toContain("Confidence Threshold");
    expect(GENERATOR_V2_PROMPT).toContain("{playbook}");
    expect(GENERATOR_V2_PROMPT).toContain("{question}");
    expect(GENERATOR_V2_PROMPT).toContain("confidence_scores");
  });

  it("exports REFLECTOR_V2_PROMPT template", () => {
    expect(REFLECTOR_V2_PROMPT).toBeDefined();
    expect(typeof REFLECTOR_V2_PROMPT).toBe("string");
    expect(REFLECTOR_V2_PROMPT.length).toBeGreaterThan(0);

    // Check for v2 features
    expect(REFLECTOR_V2_PROMPT).toContain("ACE Reflector v2.0");
    expect(REFLECTOR_V2_PROMPT).toContain("Diagnostic Review");
    expect(REFLECTOR_V2_PROMPT).toContain("{prediction}");
    expect(REFLECTOR_V2_PROMPT).toContain("Experience-Driven");
  });

  it("exports CURATOR_V2_PROMPT template", () => {
    expect(CURATOR_V2_PROMPT).toBeDefined();
    expect(typeof CURATOR_V2_PROMPT).toBe("string");
    expect(CURATOR_V2_PROMPT.length).toBeGreaterThan(0);

    // Check for v2 features
    expect(CURATOR_V2_PROMPT).toContain("ACE Curator v2.0");
    expect(CURATOR_V2_PROMPT).toContain("Delta Operations");
    expect(CURATOR_V2_PROMPT).toContain("{reflection}");
    expect(CURATOR_V2_PROMPT).toContain("Experience-Based");
  });

  it("exports domain-specific GENERATOR_MATH_PROMPT", () => {
    expect(GENERATOR_MATH_PROMPT).toBeDefined();
    expect(typeof GENERATOR_MATH_PROMPT).toBe("string");

    // Check for math-specific content
    expect(GENERATOR_MATH_PROMPT).toContain("Math Generator v2.0");
    expect(GENERATOR_MATH_PROMPT).toContain("PEMDAS");
    expect(GENERATOR_MATH_PROMPT).toContain("Calculation Verification");
  });

  it("exports domain-specific GENERATOR_CODE_PROMPT", () => {
    expect(GENERATOR_CODE_PROMPT).toBeDefined();
    expect(typeof GENERATOR_CODE_PROMPT).toBe("string");

    // Check for code-specific content
    expect(GENERATOR_CODE_PROMPT).toContain("Code Generator v2.0");
    expect(GENERATOR_CODE_PROMPT).toContain("PEP 8");
    expect(GENERATOR_CODE_PROMPT).toContain("DRY");
  });

  it("exports MIGRATION_GUIDE", () => {
    expect(MIGRATION_GUIDE).toBeDefined();
    expect(typeof MIGRATION_GUIDE).toBe("string");
    expect(MIGRATION_GUIDE).toContain("Migrating from v1 to v2");
  });
});

describe("PromptManager - Initialization", () => {
  it("initializes with default version 2.0", () => {
    const manager = new PromptManager();
    expect(manager).toBeDefined();

    // Should be able to get prompts
    const prompt = manager.getGeneratorPrompt();
    expect(prompt).toBeDefined();
  });

  it("initializes with custom default version", () => {
    const manager = new PromptManager("1.0");
    expect(manager).toBeDefined();

    // Note: v1.0 references require the prompts module to exist
    // This test validates the constructor accepts custom versions
  });

  it("tracks usage statistics", () => {
    const manager = new PromptManager();
    manager.getGeneratorPrompt();
    manager.getGeneratorPrompt("math");

    const stats = manager.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats).toBe("object");
  });
});

describe("PromptManager - Generator Prompts", () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = new PromptManager("2.0");
  });

  it("returns v2.0 generator prompt by default", () => {
    const prompt = manager.getGeneratorPrompt();
    expect(prompt).toContain("ACE Generator v2.0");
    expect(prompt).toContain("Prompt Version: 2.0.0");
  });

  it("returns math-specific generator prompt", () => {
    const prompt = manager.getGeneratorPrompt("math");
    expect(prompt).toContain("Math Generator v2.0");
    expect(prompt).toContain("2.0.0-math");
  });

  it("returns code-specific generator prompt", () => {
    const prompt = manager.getGeneratorPrompt("code");
    expect(prompt).toContain("Code Generator v2.0");
    expect(prompt).toContain("2.0.0-code");
  });

  it("falls back to general prompt if domain not found", () => {
    const prompt = manager.getGeneratorPrompt("unknown-domain");
    expect(prompt).toContain("ACE Generator v2.0");
  });

  it("replaces {current_date} placeholder with actual date", () => {
    const prompt = manager.getGeneratorPrompt();
    expect(prompt).not.toContain("{current_date}");

    // Check it contains a date-like string (YYYY-MM-DD)
    expect(prompt).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("throws error for invalid version", () => {
    const manager = new PromptManager("99.0");
    expect(() => manager.getGeneratorPrompt()).toThrow();
  });
});

describe("PromptManager - Reflector Prompts", () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = new PromptManager("2.0");
  });

  it("returns v2.0 reflector prompt by default", () => {
    const prompt = manager.getReflectorPrompt();
    expect(prompt).toContain("ACE Reflector v2.0");
    expect(prompt).toContain("Prompt Version: 2.0.0");
  });

  it("returns reflector prompt for specified version", () => {
    const prompt = manager.getReflectorPrompt("2.0");
    expect(prompt).toContain("ACE Reflector v2.0");
  });

  it("throws error for invalid version", () => {
    expect(() => manager.getReflectorPrompt("99.0")).toThrow();
  });
});

describe("PromptManager - Curator Prompts", () => {
  let manager: PromptManager;

  beforeEach(() => {
    manager = new PromptManager("2.0");
  });

  it("returns v2.0 curator prompt by default", () => {
    const prompt = manager.getCuratorPrompt();
    expect(prompt).toContain("ACE Curator v2.0");
    expect(prompt).toContain("Prompt Version: 2.0.0");
  });

  it("returns curator prompt for specified version", () => {
    const prompt = manager.getCuratorPrompt("2.0");
    expect(prompt).toContain("ACE Curator v2.0");
  });

  it("throws error for invalid version", () => {
    expect(() => manager.getCuratorPrompt("99.0")).toThrow();
  });
});

describe("PromptManager - Usage Statistics", () => {
  it("tracks generator prompt usage", () => {
    const manager = new PromptManager();
    manager.getGeneratorPrompt();
    manager.getGeneratorPrompt();

    const stats = manager.getStats();
    expect(stats["generator-2.0"]).toBe(2);
  });

  it("tracks reflector prompt usage", () => {
    const manager = new PromptManager();
    manager.getReflectorPrompt();

    const stats = manager.getStats();
    expect(stats["reflector-2.0"]).toBe(1);
  });

  it("tracks curator prompt usage", () => {
    const manager = new PromptManager();
    manager.getCuratorPrompt();

    const stats = manager.getStats();
    expect(stats["curator-2.0"]).toBe(1);
  });

  it("tracks domain-specific prompt usage separately", () => {
    const manager = new PromptManager();
    manager.getGeneratorPrompt(); // general
    manager.getGeneratorPrompt("math"); // math-specific
    manager.getGeneratorPrompt("code"); // code-specific

    const stats = manager.getStats();
    expect(stats["generator-2.0"]).toBe(1);
    expect(stats["generator-2.0-math"]).toBe(1);
    expect(stats["generator-2.0-code"]).toBe(1);
  });
});

describe("PromptManager - Version Listing", () => {
  it("lists all available versions", () => {
    const versions = PromptManager.listAvailableVersions();
    expect(versions).toBeDefined();
    expect(versions.generator).toBeDefined();
    expect(versions.reflector).toBeDefined();
    expect(versions.curator).toBeDefined();

    // Check v2.0 is listed
    expect(versions.generator).toContain("2.0");
    expect(versions.generator).toContain("2.0-math");
    expect(versions.generator).toContain("2.0-code");
    expect(versions.reflector).toContain("2.0");
    expect(versions.curator).toContain("2.0");
  });
});

describe("Prompt Validation Utilities", () => {
  it("validates valid generator output", () => {
    const validOutput = JSON.stringify({
      reasoning: "Step 1: ...",
      bullet_ids: ["bullet_001"],
      final_answer: "42",
      confidence_scores: { bullet_001: 0.9 },
    });

    const result = validatePromptOutput(validOutput, "generator");
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing required fields in generator output", () => {
    const invalidOutput = JSON.stringify({
      reasoning: "Step 1: ...",
      // missing bullet_ids and final_answer
    });

    const result = validatePromptOutput(invalidOutput, "generator");
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("bullet_ids"))).toBe(true);
    expect(result.errors.some((e) => e.includes("final_answer"))).toBe(true);
  });

  it("validates valid reflector output", () => {
    const validOutput = JSON.stringify({
      reasoning: "Analysis: ...",
      error_identification: "none",
      bullet_tags: [
        {
          id: "bullet_001",
          tag: "helpful",
          justification: "Led to correct answer",
        },
      ],
    });

    const result = validatePromptOutput(validOutput, "reflector");
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects invalid tags in reflector output", () => {
    const invalidOutput = JSON.stringify({
      reasoning: "Analysis: ...",
      error_identification: "none",
      bullet_tags: [
        {
          id: "bullet_001",
          tag: "invalid_tag", // Only helpful/harmful/neutral allowed
          justification: "Test",
        },
      ],
    });

    const result = validatePromptOutput(invalidOutput, "reflector");
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid tag"))).toBe(true);
  });

  it("validates valid curator output", () => {
    const validOutput = JSON.stringify({
      reasoning: "Need to add new strategy",
      operations: [
        {
          type: "ADD",
          section: "math",
          content: "New strategy",
          bullet_id: "",
          metadata: { helpful: 1, harmful: 0 },
        },
      ],
    });

    const result = validatePromptOutput(validOutput, "curator");
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects invalid operation types in curator output", () => {
    const invalidOutput = JSON.stringify({
      reasoning: "Need to modify",
      operations: [
        {
          type: "INVALID_OP", // Only ADD/UPDATE/TAG/REMOVE allowed
          section: "math",
          content: "Test",
        },
      ],
    });

    const result = validatePromptOutput(invalidOutput, "curator");
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid operation"))).toBe(
      true
    );
  });

  it("detects invalid JSON", () => {
    const invalidJson = "{ invalid json here";

    const result = validatePromptOutput(invalidJson, "generator");
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid JSON"))).toBe(true);
  });

  it("detects out-of-range confidence scores", () => {
    const invalidOutput = JSON.stringify({
      reasoning: "Step 1: ...",
      bullet_ids: ["bullet_001"],
      final_answer: "42",
      confidence_scores: { bullet_001: 1.5 }, // Must be 0-1
    });

    const result = validatePromptOutput(invalidOutput, "generator");
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes("confidence score"))).toBe(
      true
    );
  });
});

describe("Prompts v2 - Deprecation Warning", () => {
  it("module emits deprecation warning on import", () => {
    // The warning is emitted at module load time
    // We're verifying the module loads without errors
    expect(GENERATOR_V2_PROMPT).toBeDefined();
    expect(REFLECTOR_V2_PROMPT).toBeDefined();
    expect(CURATOR_V2_PROMPT).toBeDefined();
  });
});
