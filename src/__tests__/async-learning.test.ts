/**
 * Tests for async learning infrastructure.
 *
 * Tests for ThreadSafePlaybook, AsyncLearningPipeline.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { Playbook } from '../playbook.js';
import { Reflector, Curator } from '../roles.js';
import type { GeneratorOutput } from '../roles.js';
import { TaskEnvironment } from '../adaptation.js';
import type { Sample, EnvironmentResult } from '../adaptation.js';
import {
  AsyncLearningPipeline,
  ThreadSafePlaybook,
} from '../async-learning.js';
import type { LearningTask } from '../async-learning.js';
import { MockLLMClient } from './helpers.js';

// ---------------------------------------------------------------------------
// Test Response Helpers
// ---------------------------------------------------------------------------

function makeReflectorResponse(): string {
  return JSON.stringify({
    reasoning: 'Test reflection reasoning',
    error_identification: '',
    root_cause_analysis: '',
    correct_approach: 'The approach was correct',
    key_insight: 'Always verify the answer',
    bullet_tags: [],
  });
}

function makeCuratorResponse(): string {
  return JSON.stringify({
    reasoning: 'No changes needed',
    operations: [],
  });
}

class SimpleTestEnvironment extends TaskEnvironment {
  evaluate(sample: Sample, generatorOutput: GeneratorOutput): EnvironmentResult {
    const answer = generatorOutput.final_answer;
    const success = answer.toLowerCase().includes('correct');
    const feedback = success ? "✓ Contains 'correct'" : "✗ Missing 'correct'";

    return {
      feedback,
      groundTruth: "The answer should contain 'correct'",
      metrics: { success },
    };
  }
}

// ---------------------------------------------------------------------------
// ThreadSafePlaybook Tests
// ---------------------------------------------------------------------------

describe('ThreadSafePlaybook', () => {
  test('lock-free reads work', () => {
    const playbook = new Playbook();
    playbook.addBullet('Test', 'Test content', 'b1');
    const tsPlaybook = new ThreadSafePlaybook(playbook);

    // Reads should work
    expect(tsPlaybook.asPrompt()).toContain('Test content');
    expect(tsPlaybook.bullets().length).toBe(1);
    expect(tsPlaybook.getBullet('b1')).toBeTruthy();

    // Check stats
    const stats = tsPlaybook.stats();
    expect(stats).toHaveProperty('bullets');
  });

  test('writes are thread-safe', async () => {
    const playbook = new Playbook();
    const tsPlaybook = new ThreadSafePlaybook(playbook);

    // Add bullet through thread-safe wrapper
    await tsPlaybook.addBullet('Test', 'Content 1', 'b1');
    expect(tsPlaybook.bullets().length).toBe(1);

    // Update bullet
    await tsPlaybook.updateBullet('b1', { content: 'Updated content' });
    const bullet = tsPlaybook.getBullet('b1');
    expect(bullet?.content).toBe('Updated content');

    // Tag bullet
    await tsPlaybook.tagBullet('b1', 'helpful');
    expect(tsPlaybook.getBullet('b1')?.helpful).toBe(1);

    // Remove bullet
    await tsPlaybook.removeBullet('b1');
    expect(tsPlaybook.bullets().length).toBe(0);
  });

  test('concurrent writes are serialized', async () => {
    const playbook = new Playbook();
    playbook.addBullet('Test', 'Concurrent test', 'b1');
    const tsPlaybook = new ThreadSafePlaybook(playbook);

    const numIterations = 100;

    // Create array of concurrent tag operations
    const promises = Array.from({ length: numIterations }, () =>
      tsPlaybook.tagBullet('b1', 'helpful')
    );

    // Execute all concurrently
    await Promise.all(promises);

    // Final count should be correct (all operations serialized)
    const bullet = tsPlaybook.getBullet('b1');
    expect(bullet?.helpful).toBe(numIterations);
  });
});

// ---------------------------------------------------------------------------
// AsyncLearningPipeline Tests
// ---------------------------------------------------------------------------

describe('AsyncLearningPipeline', () => {
  let playbook: Playbook;

  beforeEach(() => {
    playbook = new Playbook();
  });

  function createMockLLM(responses: string[]): MockLLMClient {
    const llm = new MockLLMClient();
    llm.setResponses(responses);
    return llm;
  }

  function createDummyTask(index: number = 0): LearningTask {
    return {
      sample: {
        question: `Test question ${index}`,
        context: 'Test context',
        metadata: {},
      },
      generatorOutput: {
        reasoning: 'Test reasoning',
        final_answer: 'correct answer',
        bullet_ids: [],
      },
      environmentResult: {
        feedback: 'Test feedback',
        groundTruth: 'correct',
        metrics: {},
      },
      epoch: 1,
      stepIndex: index,
      totalEpochs: 1,
      totalSteps: 1,
    };
  }

  test('pipeline start/stop lifecycle', async () => {
    const reflectorLLM = createMockLLM([]);
    const curatorLLM = createMockLLM([]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM)
    );

    // Not running initially
    expect(pipeline.isRunning()).toBe(false);

    // Start
    pipeline.start();
    expect(pipeline.isRunning()).toBe(true);

    // Double start should be safe
    pipeline.start();
    expect(pipeline.isRunning()).toBe(true);

    // Stop
    const remaining = await pipeline.stop(true, 5000);
    expect(pipeline.isRunning()).toBe(false);
    expect(remaining).toBe(0);
  });

  test('submit before start returns rejection', async () => {
    const reflectorLLM = createMockLLM([]);
    const curatorLLM = createMockLLM([]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM)
    );

    const task = createDummyTask();
    await expect(pipeline.submit(task)).rejects.toThrow('Pipeline not started');
  });

  test('submit and process a task', async () => {
    const reflectorLLM = createMockLLM([makeReflectorResponse()]);
    const curatorLLM = createMockLLM([makeCuratorResponse()]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM),
      { maxReflectorWorkers: 2 }
    );

    pipeline.start();
    try {
      const task = createDummyTask();
      const promise = pipeline.submit(task);

      expect(promise).toBeDefined();

      // Wait for completion
      const completed = await pipeline.waitForCompletion(10000);
      expect(completed).toBe(true);

      // Check stats
      const stats = pipeline.stats;
      expect(stats.tasksSubmitted).toBe(1);
      expect(stats.reflectionsCompleted).toBe(1);
      expect(stats.curationsCompleted).toBe(1);
      expect(stats.tasksFailed).toBe(0);
    } finally {
      await pipeline.stop(false);
    }
  });

  test('processing multiple tasks', async () => {
    const reflectorLLM = createMockLLM(
      Array.from({ length: 3 }, () => makeReflectorResponse())
    );
    const curatorLLM = createMockLLM(
      Array.from({ length: 3 }, () => makeCuratorResponse())
    );

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM),
      { maxReflectorWorkers: 3 }
    );

    pipeline.start();
    try {
      // Submit multiple tasks
      for (let i = 0; i < 3; i++) {
        const task = createDummyTask(i);
        pipeline.submit(task);
      }

      await pipeline.waitForCompletion(15000);

      // All should be processed
      const stats = pipeline.stats;
      expect(stats.tasksSubmitted).toBe(3);
      expect(stats.reflectionsCompleted).toBe(3);
      expect(stats.curationsCompleted).toBe(3);
    } finally {
      await pipeline.stop(false);
    }
  });

  test('completion callback invocation', async () => {
    const completions: Array<[LearningTask, any]> = [];

    function onComplete(task: LearningTask, curatorOutput: any) {
      completions.push([task, curatorOutput]);
    }

    const reflectorLLM = createMockLLM([makeReflectorResponse()]);
    const curatorLLM = createMockLLM([makeCuratorResponse()]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM),
      { onComplete }
    );

    pipeline.start();
    try {
      const task = createDummyTask();
      pipeline.submit(task);

      await pipeline.waitForCompletion(10000);

      // Callback should have been invoked
      expect(completions.length).toBe(1);
      expect(completions[0][0]).toBe(task);
    } finally {
      await pipeline.stop(false);
    }
  });

  test('error callback invocation', async () => {
    const errors: Array<[Error, LearningTask]> = [];

    function onError(error: Error, task: LearningTask) {
      errors.push([error, task]);
    }

    // Create LLM that throws errors
    const reflectorLLM = createMockLLM([]);
    reflectorLLM.setResponses(['invalid json']); // Will cause parsing error

    const curatorLLM = createMockLLM([]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM),
      { onError }
    );

    pipeline.start();
    try {
      const task = createDummyTask();
      pipeline.submit(task);

      await pipeline.waitForCompletion(10000);

      // Error callback should have been invoked
      expect(errors.length).toBe(1);
      expect(errors[0][1]).toBe(task);

      // Stats should reflect failure
      const stats = pipeline.stats;
      expect(stats.tasksFailed).toBe(1);
    } finally {
      await pipeline.stop(false);
    }
  });

  test('bullet tagging in pipeline', async () => {
    // Add a bullet to tag
    playbook.addBullet('Test', 'Test bullet', 'b1');

    // Create response with bullet tag
    const reflectorResponse = JSON.stringify({
      reasoning: 'Test reasoning',
      error_identification: '',
      root_cause_analysis: '',
      correct_approach: 'Correct',
      key_insight: 'Insight',
      bullet_tags: [{ id: 'b1', tag: 'helpful' }],
    });

    const reflectorLLM = createMockLLM([reflectorResponse]);
    const curatorLLM = createMockLLM([makeCuratorResponse()]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM)
    );

    pipeline.start();
    try {
      const task = createDummyTask();
      pipeline.submit(task);

      await pipeline.waitForCompletion(10000);

      // Bullet should be tagged
      const bullet = playbook.getBullet('b1');
      expect(bullet?.helpful).toBe(1);
    } finally {
      await pipeline.stop(false);
    }
  });

  test('wait for completion timeout', async () => {
    const reflectorLLM = createMockLLM([]);
    const curatorLLM = createMockLLM([]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM)
    );

    pipeline.start();
    try {
      // Wait without submitting any tasks (should complete immediately)
      const completed = await pipeline.waitForCompletion(1000);
      expect(completed).toBe(true);
    } finally {
      await pipeline.stop(false);
    }
  });

  test('pipeline stats tracking', () => {
    const reflectorLLM = createMockLLM([]);
    const curatorLLM = createMockLLM([]);

    const pipeline = new AsyncLearningPipeline(
      playbook,
      new Reflector(reflectorLLM),
      new Curator(curatorLLM)
    );

    const stats = pipeline.stats;
    expect(stats).toHaveProperty('tasksSubmitted');
    expect(stats).toHaveProperty('reflectionsCompleted');
    expect(stats).toHaveProperty('curationsCompleted');
    expect(stats).toHaveProperty('tasksFailed');
    expect(stats).toHaveProperty('curatorQueueSize');
    expect(stats).toHaveProperty('isRunning');

    expect(stats.tasksSubmitted).toBe(0);
    expect(stats.isRunning).toBe(false);
  });
});
