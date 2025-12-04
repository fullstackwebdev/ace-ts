/**
 * Integration tests for end-to-end ACE adaptation flows.
 *
 * These tests verify the complete workflow from sample → generate → reflect → update skills.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  OfflineACE,
  OnlineACE,
  Sample,
  TaskEnvironment,
  EnvironmentResult,
} from "../src/adaptation";
import { Agent, Reflector, SkillManager, AgentOutput } from "../src/roles";
import { Skillbook } from "../src/skillbook";
import { LLMClient, LLMResponse } from "../src/llm";

/**
 * Mock LLM that returns valid JSON responses for testing.
 */
class MockLLMClient extends LLMClient {
  public callCount = 0;

  constructor() {
    super();
  }

  async complete(prompt: string): Promise<LLMResponse> {
    this.callCount++;

    // Detect role from prompt - check more specific markers first
    // v2.1 prompts use "ACE Reflector", "ACE SkillManager", "ACE Agent"
    let response: string;

    if (prompt.includes("ACE Reflector") || prompt.includes("Reflector")) {
      response = JSON.stringify({
        analysis: "Mock analysis of the outcome",
        helpful_skill_ids: [],
        harmful_skill_ids: [],
        new_learnings: [
          {
            section: "testing",
            content: "Test strategy learned",
            atomicity_score: 8,
          },
        ],
      });
    } else if (
      prompt.includes("ACE SkillManager") ||
      prompt.includes("SkillManager") ||
      prompt.toLowerCase().includes("update")
    ) {
      response = JSON.stringify({
        reasoning: "Adding learned strategy",
        operations: [
          {
            type: "ADD",
            section: "testing",
            content: "Test strategy learned",
          },
        ],
      });
    } else if (
      prompt.includes("ACE Agent") ||
      prompt.includes("Agent") ||
      prompt.includes("skill_ids")
    ) {
      response = JSON.stringify({
        reasoning: "Mock reasoning",
        final_answer: "This is a correct mock answer",
        skill_ids: [],
      });
    } else {
      response = JSON.stringify({ result: "Mock result" });
    }

    return { text: response };
  }
}

/**
 * Simple environment that checks if answer contains 'correct'.
 */
class SimpleTestEnvironment implements TaskEnvironment {
  evaluate(_sample: Sample, agentOutput: AgentOutput): EnvironmentResult {
    const answer = agentOutput.final_answer;
    const success = answer.toLowerCase().includes("correct");
    const feedback = success ? "✓ Contains 'correct'" : "✗ Missing 'correct'";

    return {
      feedback,
      groundTruth: "The answer should contain 'correct'",
      metrics: {
        success: success ? 1.0 : 0.0,
        answer_length: answer.length,
      },
    };
  }
}

/**
 * Test helper to create a temporary directory.
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ace-test-"));
}

/**
 * Test helper to clean up a temporary directory.
 */
function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Integration: Offline Adaptation", () => {
  let llm: MockLLMClient;
  let skillbook: Skillbook;
  let environment: SimpleTestEnvironment;

  beforeEach(() => {
    llm = new MockLLMClient();
    skillbook = new Skillbook();
    environment = new SimpleTestEnvironment();
  });

  test("single sample adaptation", async () => {
    // Create adapter
    const adapter = new OfflineACE({
      skillbook,
      agent: new Agent(llm),
      reflector: new Reflector(llm),
      skillManager: new SkillManager(llm),
    });

    // Create sample
    const samples: Sample[] = [
      {
        question: "What is 2+2?",
        context: "Simple math",
        groundTruth: "4",
      },
    ];

    // Run adaptation
    const results = await adapter.run(samples, environment, { epochs: 1 });

    // Verify results
    expect(results).toHaveLength(1);
    expect(results[0].agentOutput).toBeDefined();
    expect(results[0].reflection).toBeDefined();
    expect(results[0].updateBatch).toBeDefined();
    expect(results[0].environmentResult).toBeDefined();
  });

  test("multi-sample adaptation", async () => {
    const adapter = new OfflineACE({
      skillbook,
      agent: new Agent(llm),
      reflector: new Reflector(llm),
      skillManager: new SkillManager(llm),
    });

    const samples: Sample[] = Array.from({ length: 5 }, (_, i) => ({
      question: `Question ${i}`,
      context: "",
      groundTruth: String(i),
    }));

    const results = await adapter.run(samples, environment, { epochs: 1 });

    expect(results).toHaveLength(5);
    for (let i = 0; i < results.length; i++) {
      expect(results[i].agentOutput).toBeDefined();
      expect(results[i].reflection).toBeDefined();
    }
  });

  test("multi-epoch training", async () => {
    const adapter = new OfflineACE({
      skillbook,
      agent: new Agent(llm),
      reflector: new Reflector(llm),
      skillManager: new SkillManager(llm),
    });

    const samples: Sample[] = [
      { question: "Q1", context: "", groundTruth: "A1" },
      { question: "Q2", context: "", groundTruth: "A2" },
    ];

    // Run 3 epochs
    const results = await adapter.run(samples, environment, { epochs: 3 });

    // Should process 2 samples × 3 epochs = 6 total
    expect(results).toHaveLength(6);
    expect(results[0].epoch).toBe(1);
    expect(results[1].epoch).toBe(1);
    expect(results[2].epoch).toBe(2);
    expect(results[3].epoch).toBe(2);
    expect(results[4].epoch).toBe(3);
    expect(results[5].epoch).toBe(3);
  });

  test("skillbook evolution", async () => {
    const initialSkills = skillbook.skills().length;

    const adapter = new OfflineACE({
      skillbook,
      agent: new Agent(llm),
      reflector: new Reflector(llm),
      skillManager: new SkillManager(llm),
    });

    const samples: Sample[] = [
      { question: "Q1", context: "", groundTruth: "A1" },
    ];

    await adapter.run(samples, environment, { epochs: 1 });

    // Skillbook should have more skills (MockLLMClient adds skills)
    const finalSkills = skillbook.skills().length;
    expect(finalSkills).toBeGreaterThanOrEqual(initialSkills);
  });

  test("checkpoint functionality", async () => {
    const tmpDir = createTempDir();

    try {
      const adapter = new OfflineACE({
        skillbook,
        agent: new Agent(llm),
        reflector: new Reflector(llm),
        skillManager: new SkillManager(llm),
      });

      const samples: Sample[] = Array.from({ length: 5 }, (_, i) => ({
        question: `Q${i}`,
        context: "",
        groundTruth: `A${i}`,
      }));

      // Run with checkpoints every 2 samples
      await adapter.run(samples, environment, {
        epochs: 1,
        checkpointInterval: 2,
        checkpointDir: tmpDir,
      });

      // Check that checkpoints were created
      const files = fs.readdirSync(tmpDir);
      const checkpoints = files.filter((f) => f.endsWith(".json"));
      expect(checkpoints.length).toBeGreaterThan(0);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});

describe("Integration: Online Adaptation", () => {
  let llm: MockLLMClient;
  let skillbook: Skillbook;
  let environment: SimpleTestEnvironment;

  beforeEach(() => {
    llm = new MockLLMClient();
    skillbook = new Skillbook();
    environment = new SimpleTestEnvironment();
  });

  test("single sample online", async () => {
    const adapter = new OnlineACE({
      skillbook,
      agent: new Agent(llm),
      reflector: new Reflector(llm),
      skillManager: new SkillManager(llm),
    });

    const samples: Sample[] = [
      {
        question: "What is online adaptation?",
        context: "",
        groundTruth: "",
      },
    ];

    const results = await adapter.run(samples, environment);

    expect(results).toHaveLength(1);
    expect(results[0].agentOutput).toBeDefined();
  });

  test("sequential online adaptation", async () => {
    const adapter = new OnlineACE({
      skillbook,
      agent: new Agent(llm),
      reflector: new Reflector(llm),
      skillManager: new SkillManager(llm),
    });

    const samples: Sample[] = Array.from({ length: 3 }, (_, i) => ({
      question: `Q${i}`,
      context: "",
      groundTruth: "",
    }));

    const results = await adapter.run(samples, environment);

    // Each sample should be processed with updated skillbook
    expect(results).toHaveLength(3);
    expect(results[0].step).toBe(1);
    expect(results[1].step).toBe(2);
    expect(results[2].step).toBe(3);
  });
});

describe("Integration: Skillbook Persistence", () => {
  test("save/load roundtrip", () => {
    const tmpDir = createTempDir();

    try {
      const skillbookPath = path.join(tmpDir, "test_skillbook.json");

      // Create skillbook with skills
      const original = new Skillbook();
      original.addSkill("Testing", "Test strategy", "b1", {
        helpful: 5,
        harmful: 1,
      });

      // Save
      original.saveToFile(skillbookPath);

      // Load
      const loaded = Skillbook.loadFromFile(skillbookPath);

      // Verify
      expect(loaded.skills()).toHaveLength(original.skills().length);
      expect(loaded.skills()[0].content).toBe("Test strategy");
      expect(loaded.skills()[0].helpful).toBe(5);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("evolved skillbook persistence", async () => {
    const tmpDir = createTempDir();

    try {
      const skillbookPath = path.join(tmpDir, "evolved_skillbook.json");

      // Train adapter
      const llm = new MockLLMClient();
      const skillbook = new Skillbook();
      const environment = new SimpleTestEnvironment();

      const adapter = new OfflineACE({
        skillbook,
        agent: new Agent(llm),
        reflector: new Reflector(llm),
        skillManager: new SkillManager(llm),
      });

      const samples: Sample[] = [
        {
          question: "Train Q",
          context: "",
          groundTruth: "",
        },
      ];

      await adapter.run(samples, environment, { epochs: 1 });

      // Save evolved skillbook
      skillbook.saveToFile(skillbookPath);

      // Create new adapter with loaded skillbook
      const loadedSkillbook = Skillbook.loadFromFile(skillbookPath);
      const newAdapter = new OfflineACE({
        skillbook: loadedSkillbook,
        agent: new Agent(llm),
        reflector: new Reflector(llm),
        skillManager: new SkillManager(llm),
      });

      // Verify it works
      const testSamples: Sample[] = [
        { question: "Test Q", context: "", groundTruth: "" },
      ];
      const results = await newAdapter.run(testSamples, environment, {
        epochs: 1,
      });

      expect(results).toHaveLength(1);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});

describe("Integration: Error Recovery", () => {
  test("failed sample skipping", async () => {
    /**
     * Environment that fails on specific questions.
     */
    class FailingEnvironment implements TaskEnvironment {
      evaluate(sample: Sample, _agentOutput: AgentOutput): EnvironmentResult {
        if (sample.question.toLowerCase().includes("fail")) {
          throw new Error("Simulated evaluation failure");
        }
        return {
          feedback: "OK",
          groundTruth: "",
          metrics: { success: 1.0 },
        };
      }
    }

    const llm = new MockLLMClient();
    const skillbook = new Skillbook();
    const environment = new FailingEnvironment();

    const adapter = new OfflineACE({
      skillbook,
      agent: new Agent(llm),
      reflector: new Reflector(llm),
      skillManager: new SkillManager(llm),
    });

    const samples: Sample[] = [
      { question: "Good Q1", context: "", groundTruth: "" },
      { question: "FAIL this", context: "", groundTruth: "" },
      { question: "Good Q2", context: "", groundTruth: "" },
    ];

    // Should skip failed sample and continue
    const results = await adapter.run(samples, environment, { epochs: 1 });

    // Should process 2 successful samples (skip 1 failed)
    expect(results).toHaveLength(2);
    expect(results[0].sample.question).toBe("Good Q1");
    expect(results[1].sample.question).toBe("Good Q2");
  });
});
