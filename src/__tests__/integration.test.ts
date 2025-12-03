/**
 * Integration tests for end-to-end ACE adaptation flows.
 *
 * These tests verify the complete workflow from sample → generate → reflect → curate.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Generator, Reflector, Curator } from '../roles.js';
import { OfflineAdapter, OnlineAdapter } from '../adaptation.js';
import { Playbook } from '../playbook.js';
import { LLMClient, LLMResponse } from '../llm.js';
import {
  Sample,
  TaskEnvironment,
  EnvironmentResult,
  GeneratorOutput,
} from '../adaptation.js';
import { z } from 'zod';
import { DeltaBatch } from '../delta.js';
import { CuratorOutput } from '../roles.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Mock LLM client that auto-generates valid JSON responses based on prompt type.
 * Mimics the Python test_integration.py MockLLMClient.
 */
class SmartMockLLMClient extends LLMClient {
  public callCount = 0;

  constructor() {
    super('mock');
  }

  /**
   * Auto-detect role from prompt and return appropriate JSON response
   */
  async complete(prompt: string, kwargs?: Record<string, any>): Promise<LLMResponse> {
    this.callCount++;

    let response: string;

    // Detect role from prompt - check more specific markers first
    // v2.1 prompts use "ACE Reflector", "ACE Curator", "ACE Generator"
    if (prompt.includes('ACE Reflector') || prompt.includes('Reflector')) {
      response = JSON.stringify({
        reasoning: 'Mock analysis of the outcome',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: 'The correct approach was taken',
        key_insight: 'Key insight from this iteration',
        bullet_tags: [],
      });
    } else if (
      prompt.includes('ACE Curator') ||
      prompt.includes('Curator') ||
      prompt.toLowerCase().includes('delta')
    ) {
      response = JSON.stringify({
        delta: { reasoning: 'No changes needed', operations: [] },
      });
    } else if (
      prompt.includes('ACE Generator') ||
      prompt.includes('Generator') ||
      prompt.includes('bullet_ids')
    ) {
      response = JSON.stringify({
        reasoning: 'Mock reasoning',
        final_answer: 'This is a correct mock answer',
        bullet_ids: [],
      });
    } else if (prompt.toLowerCase().includes('helpful')) {
      response = JSON.stringify({
        delta: { reasoning: 'No changes needed', operations: [] },
      });
    } else {
      // Generic response
      response = JSON.stringify({ result: 'Mock result' });
    }

    return { text: response };
  }

  /**
   * Structured output - parse JSON and validate with Zod
   */
  async completeStructured<T>(
    prompt: string,
    responseModel: z.ZodType<T>,
    kwargs?: Record<string, any>
  ): Promise<T> {
    const response = await this.complete(prompt, kwargs);
    const data = JSON.parse(response.text);

    // Special handling for CuratorOutput (delta is a class, not Zod schema)
    if (data.delta && typeof data.delta === 'object') {
      const deltaData = data.delta;
      const delta = DeltaBatch.fromJson(deltaData);
      return { delta, raw: data } as T;
    }

    return responseModel.parse(data);
  }
}

/**
 * Simple test environment that checks if answer contains 'correct'
 */
class SimpleTestEnvironment extends TaskEnvironment {
  evaluate(sample: Sample, generatorOutput: GeneratorOutput): EnvironmentResult {
    const answer = generatorOutput.final_answer;
    const success = answer.toLowerCase().includes('correct');
    const feedback = success ? "✓ Contains 'correct'" : "✗ Missing 'correct'";

    return {
      feedback,
      groundTruth: "The answer should contain 'correct'",
      metrics: { success, answer_length: answer.length },
    };
  }
}

describe('Integration Tests - Offline Adaptation', () => {
  let llm: SmartMockLLMClient;
  let playbook: Playbook;
  let environment: SimpleTestEnvironment;

  beforeEach(() => {
    llm = new SmartMockLLMClient();
    playbook = new Playbook();
    environment = new SimpleTestEnvironment();
  });

  test('single sample adaptation', async () => {
    // Create adapter
    const adapter = new OfflineAdapter(
      new Generator(llm),
      new Reflector(llm),
      new Curator(llm),
      { playbook }
    );

    // Create sample
    const samples: Sample[] = [
      {
        question: 'What is 2+2?',
        context: 'Simple math',
        groundTruth: '4',
      },
    ];

    // Run adaptation
    const results = await adapter.run(samples, environment, { epochs: 1 });

    // Verify results
    expect(results).toHaveLength(1);
    expect(results[0].generatorOutput).toBeDefined();
    expect(results[0].reflection).toBeDefined();
    expect(results[0].curatorDelta).toBeDefined();
    expect(results[0].environmentResult).toBeDefined();
  });

  test('multi-sample adaptation', async () => {
    const adapter = new OfflineAdapter(
      new Generator(llm),
      new Reflector(llm),
      new Curator(llm),
      { playbook }
    );

    const samples: Sample[] = Array.from({ length: 5 }, (_, i) => ({
      question: `Question ${i}`,
      context: '',
      groundTruth: String(i),
    }));

    const results = await adapter.run(samples, environment, { epochs: 1 });

    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result.generatorOutput).toBeDefined();
      expect(result.reflection).toBeDefined();
    }
  });

  test('multi-epoch training', async () => {
    const adapter = new OfflineAdapter(
      new Generator(llm),
      new Reflector(llm),
      new Curator(llm),
      { playbook }
    );

    const samples: Sample[] = [
      { question: 'Q1', context: '', groundTruth: 'A1' },
      { question: 'Q2', context: '', groundTruth: 'A2' },
    ];

    // Run 3 epochs
    const results = await adapter.run(samples, environment, { epochs: 3 });

    // Should process 2 samples × 3 epochs = 6 total
    expect(results).toHaveLength(6);
  });

  test('playbook evolution', async () => {
    const initialBullets = playbook.bullets().length;

    const adapter = new OfflineAdapter(
      new Generator(llm),
      new Reflector(llm),
      new Curator(llm),
      { playbook }
    );

    const samples: Sample[] = [{ question: 'Q1', context: '', groundTruth: 'A1' }];

    await adapter.run(samples, environment, { epochs: 1 });

    // Playbook should have same or more bullets (mock doesn't add bullets)
    const finalBullets = playbook.bullets().length;
    expect(finalBullets).toBeGreaterThanOrEqual(initialBullets);
  });

  test('checkpoint functionality', async () => {
    // Create temporary directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-test-'));

    try {
      const adapter = new OfflineAdapter(
        new Generator(llm),
        new Reflector(llm),
        new Curator(llm),
        { playbook }
      );

      const samples: Sample[] = Array.from({ length: 5 }, (_, i) => ({
        question: `Q${i}`,
        context: '',
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
      const checkpoints = files.filter((f) => f.endsWith('.json'));
      expect(checkpoints.length).toBeGreaterThan(0);
    } finally {
      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Integration Tests - Online Adaptation', () => {
  let llm: SmartMockLLMClient;
  let playbook: Playbook;
  let environment: SimpleTestEnvironment;

  beforeEach(() => {
    llm = new SmartMockLLMClient();
    playbook = new Playbook();
    environment = new SimpleTestEnvironment();
  });

  test('single sample online', async () => {
    const adapter = new OnlineAdapter(
      new Generator(llm),
      new Reflector(llm),
      new Curator(llm),
      { playbook }
    );

    const samples: Sample[] = [
      { question: 'What is online adaptation?', context: '', groundTruth: '' },
    ];

    const results = await adapter.run(samples, environment);

    expect(results).toHaveLength(1);
    expect(results[0].generatorOutput).toBeDefined();
  });

  test('sequential online adaptation', async () => {
    const adapter = new OnlineAdapter(
      new Generator(llm),
      new Reflector(llm),
      new Curator(llm),
      { playbook }
    );

    const samples: Sample[] = Array.from({ length: 3 }, (_, i) => ({
      question: `Q${i}`,
      context: '',
      groundTruth: '',
    }));

    const results = await adapter.run(samples, environment);

    // Each sample should be processed with updated playbook
    expect(results).toHaveLength(3);
  });
});

describe('Integration Tests - Playbook Persistence', () => {
  test('save/load roundtrip', () => {
    // Create temporary directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-test-'));
    const playbookPath = path.join(tmpDir, 'test_playbook.json');

    try {
      // Create playbook with bullets
      const original = new Playbook();
      original.addBullet('Testing', 'Test strategy', 'b1', { helpful: 5, harmful: 1 });

      // Save
      original.saveToFile(playbookPath);

      // Load
      const loaded = Playbook.loadFromFile(playbookPath);

      // Verify
      expect(loaded.bullets()).toHaveLength(original.bullets().length);
      expect(loaded.bullets()[0].content).toBe('Test strategy');
      expect(loaded.bullets()[0].helpful).toBe(5);
    } finally {
      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('evolved playbook persistence', async () => {
    // Create temporary directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-test-'));
    const playbookPath = path.join(tmpDir, 'evolved_playbook.json');

    try {
      // Train adapter
      const llm = new SmartMockLLMClient();
      const playbook = new Playbook();
      const environment = new SimpleTestEnvironment();

      const adapter = new OfflineAdapter(
        new Generator(llm),
        new Reflector(llm),
        new Curator(llm),
        { playbook }
      );

      const samples: Sample[] = [{ question: 'Train Q', context: '', groundTruth: '' }];

      await adapter.run(samples, environment, { epochs: 1 });

      // Save evolved playbook
      playbook.saveToFile(playbookPath);

      // Create new adapter with loaded playbook
      const loadedPlaybook = Playbook.loadFromFile(playbookPath);
      const newAdapter = new OfflineAdapter(
        new Generator(llm),
        new Reflector(llm),
        new Curator(llm),
        { playbook: loadedPlaybook }
      );

      // Verify it works
      const testSamples: Sample[] = [
        { question: 'Test Q', context: '', groundTruth: '' },
      ];
      const results = await newAdapter.run(testSamples, environment, { epochs: 1 });

      expect(results).toHaveLength(1);
    } finally {
      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Integration Tests - Error Recovery', () => {
  test('failed sample skipping', async () => {
    /**
     * Environment that fails on specific questions
     */
    class FailingEnvironment extends TaskEnvironment {
      evaluate(sample: Sample, generatorOutput: GeneratorOutput): EnvironmentResult {
        if (sample.question.toLowerCase().includes('fail')) {
          throw new Error('Simulated evaluation failure');
        }
        return {
          feedback: 'OK',
          groundTruth: '',
          metrics: { success: true },
        };
      }
    }

    const llm = new SmartMockLLMClient();
    const playbook = new Playbook();
    const environment = new FailingEnvironment();

    const adapter = new OfflineAdapter(
      new Generator(llm),
      new Reflector(llm),
      new Curator(llm),
      { playbook }
    );

    const samples: Sample[] = [
      { question: 'Good Q1', context: '', groundTruth: '' },
      { question: 'FAIL this', context: '', groundTruth: '' },
      { question: 'Good Q2', context: '', groundTruth: '' },
    ];

    // Should skip failed sample and continue
    const results = await adapter.run(samples, environment, { epochs: 1 });

    // Should process 2 successful samples (skip 1 failed)
    expect(results).toHaveLength(2);
  });
});
