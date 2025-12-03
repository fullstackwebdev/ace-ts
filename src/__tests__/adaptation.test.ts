/**
 * Tests for adaptation orchestration loops
 * Ported from Python: tests/test_adaptation.py
 */

import { describe, it, expect } from 'vitest';
import {
  OfflineAdapter,
  OnlineAdapter,
  Sample,
  TaskEnvironment,
  EnvironmentResult,
} from '../adaptation.js';
import type { GeneratorOutput } from '../roles.js';
import { Generator, Reflector, Curator } from '../roles.js';
import { Playbook } from '../playbook.js';
import { DummyLLMClient } from '../llm.js';

/**
 * Simple QA environment for testing
 */
class SimpleQAEnvironment extends TaskEnvironment {
  async evaluate(
    sample: Sample,
    generatorOutput: GeneratorOutput
  ): Promise<EnvironmentResult> {
    const groundTruth = sample.groundTruth || '';
    const prediction = generatorOutput.final_answer;
    const correct =
      prediction.trim().toLowerCase() === groundTruth.trim().toLowerCase();
    const feedback = correct
      ? 'correct'
      : `expected ${groundTruth} but got ${prediction}`;

    return {
      feedback,
      groundTruth,
      metrics: { accuracy: correct ? 1.0 : 0.0 },
    };
  }
}

describe('OfflineAdapter', () => {
  it('should update playbook after single step', async () => {
    const client = new DummyLLMClient();

    // Queue Generator response
    client.queue(
      JSON.stringify({
        reasoning: 'The answer is given in the playbook.',
        bullet_ids: [],
        final_answer: '42',
      })
    );

    // Queue Reflector response
    client.queue(
      JSON.stringify({
        reasoning: 'Prediction matches ground truth.',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: 'Keep leveraging the playbook.',
        key_insight: 'Store that 42 is the default answer.',
        bullet_tags: [],
      })
    );

    // Queue Curator response
    client.queue(
      JSON.stringify({
        reasoning: 'Adding a reminder for future tasks.',
        operations: [
          {
            type: 'ADD',
            section: 'default_answers',
            content:
              'If the question mentions life, universe, and everything, answer 42.',
            metadata: { helpful: 1 },
          },
        ],
      })
    );

    const playbook = new Playbook();
    const generator = new Generator(client);
    const reflector = new Reflector(client);
    const curator = new Curator(client);

    const adapter = new OfflineAdapter(generator, reflector, curator, {
      playbook,
    });

    const sample: Sample = {
      question: 'What is the answer to life, the universe, and everything?',
      groundTruth: '42',
    };

    const environment = new SimpleQAEnvironment();
    const results = await adapter.run([sample], environment, { epochs: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].generatorOutput.final_answer).toBe('42');

    // Check playbook was updated
    const stats = playbook.stats();
    expect(stats.sections).toBeGreaterThanOrEqual(1);

    // Check that a bullet with "life" was added
    const bullets = playbook.bullets();
    const hasLifeBullet = bullets.some((bullet) =>
      bullet.content.includes('life')
    );
    expect(hasLifeBullet).toBe(true);
  });

  it('should handle multiple samples', async () => {
    const client = new DummyLLMClient();

    // Queue responses for 2 samples × 3 roles = 6 responses
    // Sample 1
    client.queue(
      JSON.stringify({
        reasoning: 'Simple addition',
        final_answer: '4',
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'Correct answer',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: 'Basic math works',
        bullet_tags: [],
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'No changes needed',
        operations: [],
      })
    );

    // Sample 2
    client.queue(
      JSON.stringify({
        reasoning: 'Another addition',
        final_answer: '7',
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'Also correct',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: 'Math still works',
        bullet_tags: [],
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'No changes needed',
        operations: [],
      })
    );

    const playbook = new Playbook();
    const adapter = new OfflineAdapter(
      new Generator(client),
      new Reflector(client),
      new Curator(client),
      { playbook }
    );

    const samples: Sample[] = [
      { question: 'What is 2+2?', groundTruth: '4' },
      { question: 'What is 3+4?', groundTruth: '7' },
    ];

    const environment = new SimpleQAEnvironment();
    const results = await adapter.run(samples, environment, { epochs: 1 });

    expect(results).toHaveLength(2);
    expect(results[0].generatorOutput.final_answer).toBe('4');
    expect(results[1].generatorOutput.final_answer).toBe('7');
  });

  it('should handle multiple epochs', async () => {
    const client = new DummyLLMClient();

    // Queue responses for 1 sample × 2 epochs × 3 roles = 6 responses
    // Epoch 1
    client.queue(
      JSON.stringify({
        reasoning: 'First attempt',
        final_answer: '42',
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'Correct',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: 'Works well',
        bullet_tags: [],
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'Add strategy',
        operations: [
          {
            type: 'ADD',
            section: 'test',
            content: 'Test strategy',
          },
        ],
      })
    );

    // Epoch 2
    client.queue(
      JSON.stringify({
        reasoning: 'Second attempt',
        final_answer: '42',
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'Still correct',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: 'Consistent results',
        bullet_tags: [],
      })
    );
    client.queue(
      JSON.stringify({
        reasoning: 'No changes',
        operations: [],
      })
    );

    const playbook = new Playbook();
    const adapter = new OfflineAdapter(
      new Generator(client),
      new Reflector(client),
      new Curator(client),
      { playbook }
    );

    const sample: Sample = {
      question: 'Test question',
      groundTruth: '42',
    };

    const environment = new SimpleQAEnvironment();
    const results = await adapter.run([sample], environment, { epochs: 2 });

    // Should have 2 results (1 sample × 2 epochs)
    expect(results).toHaveLength(2);
    expect(results[0].epoch).toBe(1);
    expect(results[1].epoch).toBe(2);
  });

  it('should call lifecycle callbacks', async () => {
    const client = new DummyLLMClient();

    // Queue minimal responses
    client.queue(JSON.stringify({ reasoning: 'test', final_answer: '42' }));
    client.queue(
      JSON.stringify({
        reasoning: 'test',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: '',
        bullet_tags: [],
      })
    );
    client.queue(JSON.stringify({ reasoning: 'test', operations: [] }));

    const playbook = new Playbook();
    const adapter = new OfflineAdapter(
      new Generator(client),
      new Reflector(client),
      new Curator(client),
      { playbook }
    );

    let epochStartCalled = false;
    let sampleProcessedCalled = false;
    let epochCompleteCalled = false;

    await adapter.run(
      [{ question: 'test', groundTruth: '42' }],
      new SimpleQAEnvironment(),
      {
        epochs: 1,
        onEpochStart: () => {
          epochStartCalled = true;
        },
        onSampleProcessed: () => {
          sampleProcessedCalled = true;
        },
        onEpochComplete: () => {
          epochCompleteCalled = true;
        },
      }
    );

    expect(epochStartCalled).toBe(true);
    expect(sampleProcessedCalled).toBe(true);
    expect(epochCompleteCalled).toBe(true);
  });
});

describe('OnlineAdapter', () => {
  it('should process samples sequentially', async () => {
    const client = new DummyLLMClient();

    // Queue responses for 2 samples × 3 roles = 6 responses
    client.queue(JSON.stringify({ reasoning: 'test1', final_answer: '1' }));
    client.queue(
      JSON.stringify({
        reasoning: 'test1',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: 'insight1',
        bullet_tags: [],
      })
    );
    client.queue(JSON.stringify({ reasoning: 'test1', operations: [] }));

    client.queue(JSON.stringify({ reasoning: 'test2', final_answer: '2' }));
    client.queue(
      JSON.stringify({
        reasoning: 'test2',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: 'insight2',
        bullet_tags: [],
      })
    );
    client.queue(JSON.stringify({ reasoning: 'test2', operations: [] }));

    const playbook = new Playbook();
    const adapter = new OnlineAdapter(
      new Generator(client),
      new Reflector(client),
      new Curator(client),
      { playbook }
    );

    const samples: Sample[] = [
      { question: 'q1', groundTruth: '1' },
      { question: 'q2', groundTruth: '2' },
    ];

    const results = await adapter.run(samples, new SimpleQAEnvironment());

    expect(results).toHaveLength(2);
    expect(results[0].generatorOutput.final_answer).toBe('1');
    expect(results[1].generatorOutput.final_answer).toBe('2');
    // Online adapter always uses epoch=1
    expect(results[0].epoch).toBe(1);
    expect(results[1].epoch).toBe(1);
  });

  it('should call onSampleProcessed callback', async () => {
    const client = new DummyLLMClient();

    client.queue(JSON.stringify({ reasoning: 'test', final_answer: '42' }));
    client.queue(
      JSON.stringify({
        reasoning: 'test',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: '',
        bullet_tags: [],
      })
    );
    client.queue(JSON.stringify({ reasoning: 'test', operations: [] }));

    const playbook = new Playbook();
    const adapter = new OnlineAdapter(
      new Generator(client),
      new Reflector(client),
      new Curator(client),
      { playbook }
    );

    let callbackCalled = false;

    await adapter.run([{ question: 'test', groundTruth: '42' }], new SimpleQAEnvironment(), {
      onSampleProcessed: () => {
        callbackCalled = true;
      },
    });

    expect(callbackCalled).toBe(true);
  });
});
