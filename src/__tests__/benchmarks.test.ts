/**
 * Tests for the ACE benchmarking system.
 *
 * Tests configuration loading, environment evaluation, and end-to-end benchmark execution.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Sample, EnvironmentResult } from "../llm";
import {
  createBenchmarkConfig,
  BenchmarkConfig,
  BenchmarkSample,
  BenchmarkEnvironment,
} from "../benchmarks/base";
import {
  GenericBenchmarkEnvironment,
  FiNEREnvironment,
} from "../benchmarks/environments";
import { BenchmarkTaskManager } from "../benchmarks/manager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("BenchmarkConfig", () => {
  it("should create config from object", () => {
    const configDict = {
      task: "test_task",
      version: "1.0",
      data: { source: "test", dataset: "test_data" },
      preprocessing: { question_template: "{text}" },
      metrics: [{ name: "accuracy" }],
      metadata: { description: "Test benchmark" },
    };

    const config = createBenchmarkConfig(configDict);

    expect(config.task).toBe("test_task");
    expect(config.version).toBe("1.0");
    expect(config.data.source).toBe("test");
    expect(config.preprocessing?.question_template).toBe("{text}");
    expect(config.metrics?.[0].name).toBe("accuracy");
    expect(config.metadata?.description).toBe("Test benchmark");
  });

  it("should create minimal config without optional fields", () => {
    const configDict = {
      task: "minimal",
      version: "1.0",
      data: { source: "test" },
      preprocessing: {},
      metrics: [],
    };

    const config = createBenchmarkConfig(configDict);
    expect(config.task).toBe("minimal");
    expect(config.metadata).toBeUndefined();
  });
});

describe("BenchmarkSample", () => {
  it("should create benchmark sample with core fields", () => {
    const sample: BenchmarkSample = {
      question: "What is 2+2?",
      ground_truth: "4",
      context: "Math problem",
    };

    expect(sample.question).toBe("What is 2+2?");
    expect(sample.ground_truth).toBe("4");
    expect(sample.context).toBe("Math problem");
  });

  it("should create benchmark sample with minimal fields", () => {
    const sample: BenchmarkSample = {
      question: "Test question",
      ground_truth: "Test answer",
    };

    expect(sample.question).toBe("Test question");
    expect(sample.ground_truth).toBe("Test answer");
  });
});

describe("BenchmarkEnvironment - Generic", () => {
  let config: BenchmarkConfig;

  beforeEach(() => {
    config = createBenchmarkConfig({
      task: "test_env",
      version: "1.0",
      data: { source: "test" },
      preprocessing: {},
      metrics: [{ name: "accuracy" }, { name: "f1" }],
    });
  });

  it("should evaluate generic environment correctly", async () => {
    const env = new GenericBenchmarkEnvironment(config);

    const sample: Sample = {
      question: "What is the capital of France?",
      groundTruth: "Paris",  // Use camelCase as per TypeScript convention
    };

    // Mock generator output
    const mockOutput = {
      final_answer: "Paris",
      reasoning: "",
      confidence: 1.0,
      tags: [],
    };

    const result = await env.evaluate(sample, mockOutput);

    expect(result).toBeInstanceOf(Object);
    expect(result.feedback).toContain("Good performance");
    expect(result.metrics?.accuracy).toBe(1.0);
    expect(result.groundTruth).toBe("Paris");
  });

  it("should handle partial match correctly", async () => {
    const env = new GenericBenchmarkEnvironment(config);

    const sample: Sample = {
      question: "What is the capital of France?",
      groundTruth: "Paris France",  // Use camelCase as per TypeScript convention
    };

    const mockOutput = {
      final_answer: "Paris",
      reasoning: "",
      confidence: 1.0,
      tags: [],
    };

    const result = await env.evaluate(sample, mockOutput);

    // Should have some F1 score but not exact match
    expect(result.metrics?.accuracy).toBe(0.0); // No exact match
    expect(result.metrics?.f1).toBeGreaterThan(0.0); // But some F1 overlap
    expect(result.feedback).toContain("Low performance");
  });

  it("should compute F1 score correctly", () => {
    const env = new GenericBenchmarkEnvironment(config);

    // Access protected method using any cast (TypeScript test pattern)
    const computeF1 = (env as any).computeF1.bind(env);

    // Perfect match
    let f1 = computeF1("hello world", "hello world");
    expect(f1).toBe(1.0);

    // Partial overlap
    f1 = computeF1("hello world", "hello there");
    expect(f1).toBeGreaterThan(0.0);
    expect(f1).toBeLessThan(1.0);

    // No overlap
    f1 = computeF1("hello", "goodbye");
    expect(f1).toBe(0.0);

    // Empty strings
    f1 = computeF1("", "");
    expect(f1).toBe(1.0);
  });
});

describe("FiNEREnvironment", () => {
  let config: BenchmarkConfig;
  let env: FiNEREnvironment;

  beforeEach(() => {
    config = createBenchmarkConfig({
      task: "finer",
      version: "1.0",
      data: { source: "test" },
      preprocessing: {},
      metrics: [
        { name: "f1" },
        { name: "precision" },
        { name: "recall" },
      ],
    });
    env = new FiNEREnvironment(config);
  });

  it("should extract entities from JSON format", () => {
    const prediction =
      '[{"text": "Apple Inc.", "label": "ORG"}, {"text": "Tim Cook", "label": "PERSON"}]';

    const sample: Sample = { question: "Test", ground_truth: "" };
    const extractEntities = (env as any).extractEntities.bind(env);
    const entities = extractEntities(prediction, sample);

    // Entities are stored as "text|||label" strings
    expect(entities.has("Apple Inc.|||ORG")).toBe(true);
    expect(entities.has("Tim Cook|||PERSON")).toBe(true);
    expect(entities.size).toBe(2);
  });

  it("should extract entities from free text", () => {
    const prediction =
      "PERSON: John Smith\nORGANIZATION: Microsoft Corp\nLOCATION: New York";

    const sample: Sample = { question: "Test", ground_truth: "" };
    const extractEntities = (env as any).extractEntities.bind(env);
    const entities = extractEntities(prediction, sample);

    // Entities are stored as "text|||label" strings
    expect(entities.has("John Smith|||PERSON")).toBe(true);
    expect(entities.has("Microsoft Corp|||ORGANIZATION")).toBe(true);
    expect(entities.has("New York|||LOCATION")).toBe(true);
  });

  it("should calculate NER metrics correctly", () => {
    // Entities are stored as "text|||label" strings
    const predicted = new Set([
      "Apple|||ORG",
      "Cook|||PERSON",
      "Wrong|||MISC",
    ]);
    const gold = new Set([
      "Apple|||ORG",
      "Tim Cook|||PERSON",
    ]);

    const computeNERMetrics = (env as any).computeNERMetrics.bind(env);
    const metrics = computeNERMetrics(predicted, gold);

    // Only "Apple|||ORG" is correctly identified
    expect(metrics.precision).toBeCloseTo(1 / 3, 5); // 1 correct out of 3 predicted
    expect(metrics.recall).toBeCloseTo(1 / 2, 5); // 1 correct out of 2 gold
    expect(metrics.f1).toBeCloseTo(
      (2 * (1 / 3) * (1 / 2)) / (1 / 3 + 1 / 2),
      3
    );
    expect(metrics.exact_match).toBe(0.0); // Not exact match
  });
});

describe("BenchmarkTaskManager", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should initialize manager without errors", () => {
    const manager = new BenchmarkTaskManager(tempDir);
    expect(manager).toBeInstanceOf(BenchmarkTaskManager);
    expect(manager.listBenchmarks()).toHaveLength(0);
  });

  it("should discover JSON configs", () => {
    const configContent = {
      task: "test_discovery",
      version: "1.0",
      data: { source: "test" },
      preprocessing: {},
      metrics: [{ name: "accuracy" }],
    };
    fs.writeFileSync(
      path.join(tempDir, "test_discovery.json"),
      JSON.stringify(configContent, null, 2)
    );

    const manager = new BenchmarkTaskManager(tempDir);
    manager.reloadConfigs();
    const benchmarks = manager.listBenchmarks();

    expect(benchmarks).toContain("test_discovery");
    const config = manager.getConfig("test_discovery");
    expect(config.task).toBe("test_discovery");
  });

  it("should validate configs correctly", () => {
    // Valid config
    const validConfig = {
      task: "valid_test",
      version: "1.0",
      data: {
        source: "huggingface",
        dataset: "test",
      },
      preprocessing: {
        question_template: "{text}",
      },
      metrics: [{ name: "accuracy" }],
    };
    fs.writeFileSync(
      path.join(tempDir, "valid_test.json"),
      JSON.stringify(validConfig, null, 2)
    );

    // Invalid config (missing required fields)
    const invalidConfig = {
      task: "invalid_test",
      data: {
        source: "unknown_source",
      },
    };
    fs.writeFileSync(
      path.join(tempDir, "invalid_test.json"),
      JSON.stringify(invalidConfig, null, 2)
    );

    const manager = new BenchmarkTaskManager(tempDir);
    manager.reloadConfigs();

    // Valid config should have no errors (huggingface is a known source)
    const validErrors = manager.validateConfig("valid_test");
    expect(validErrors).toHaveLength(0);

    // Invalid config should have errors
    const invalidErrors = manager.validateConfig("invalid_test");
    expect(invalidErrors.length).toBeGreaterThan(0);
  });

  it("should throw error for unknown benchmark", () => {
    const manager = new BenchmarkTaskManager(tempDir);

    expect(() => {
      manager.getConfig("nonexistent_benchmark");
    }).toThrow();
  });
});

describe("BenchmarkIntegration", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-int-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should run end-to-end benchmark with mocked data", async () => {
    // Create simple test config
    const configContent = {
      task: "math_test",
      version: "1.0",
      data: {
        source: "huggingface",
        dataset: "mock_math",
        split: "test",
      },
      preprocessing: {
        question_template: "Q: {question} A:",
        ground_truth_field: "ground_truth",
      },
      metrics: [{ name: "accuracy" }],
      metadata: {
        description: "Simple math test",
      },
    };
    fs.writeFileSync(
      path.join(tempDir, "math_test.json"),
      JSON.stringify(configContent, null, 2)
    );

    const manager = new BenchmarkTaskManager(tempDir);
    manager.reloadConfigs();

    // Verify config loads
    const config = manager.getConfig("math_test");
    expect(config.task).toBe("math_test");

    // Note: Data loading would require HuggingFace integration
    // which is a stub in TypeScript. We're just verifying config loading works.

    // Verify environment creation
    const env = manager.getBenchmark("math_test");
    expect(env).toBeInstanceOf(BenchmarkEnvironment);
  });
});
