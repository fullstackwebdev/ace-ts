/**
 * Unit tests for OfflineACE and OnlineACE adaptation loops.
 */

import {
  OfflineACE,
  OnlineACE,
  Sample,
  TaskEnvironment,
  EnvironmentResult,
  SimpleEnvironment,
} from '../src/adaptation';
import { Agent, Reflector, SkillManager, AgentOutput } from '../src/roles';
import { Skillbook } from '../src/skillbook';
import { MockLLMClient } from './helpers';

/**
 * Simple test environment for QA tasks.
 */
class SimpleQAEnvironment implements TaskEnvironment {
  evaluate(sample: Sample, agentOutput: AgentOutput): EnvironmentResult {
    const groundTruth = sample.groundTruth || '';
    const prediction = agentOutput.final_answer;
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

describe('SimpleEnvironment', () => {
  const env = new SimpleEnvironment();

  test('evaluates correct answer as correct', () => {
    const sample: Sample = {
      question: 'What is 2+2?',
      groundTruth: '4',
    };
    const agentOutput: AgentOutput = {
      reasoning: 'Simple math',
      final_answer: '4',
      skill_ids: [],
    };

    const result = env.evaluate(sample, agentOutput);
    expect(result.feedback).toBe('Correct!');
    expect(result.metrics?.correct).toBe(1.0);
  });

  test('evaluates incorrect answer as incorrect', () => {
    const sample: Sample = {
      question: 'What is 2+2?',
      groundTruth: '4',
    };
    const agentOutput: AgentOutput = {
      reasoning: 'Wrong calculation',
      final_answer: '5',
      skill_ids: [],
    };

    const result = env.evaluate(sample, agentOutput);
    expect(result.feedback).toContain('Incorrect');
    expect(result.feedback).toContain('4');
    expect(result.metrics?.correct).toBe(0.0);
  });

  test('handles missing ground truth', () => {
    const sample: Sample = {
      question: 'Open-ended question?',
    };
    const agentOutput: AgentOutput = {
      reasoning: 'My answer',
      final_answer: 'Answer',
      skill_ids: [],
    };

    const result = env.evaluate(sample, agentOutput);
    expect(result.feedback).toContain('No ground truth');
    expect(result.metrics?.correct).toBe(0.0);
  });
});

describe('OfflineACE', () => {
  test('single step updates skillbook', async () => {
    const mockLLM = new MockLLMClient();

    // Agent response
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'The answer is given in the skillbook.',
        skill_ids: [],
        final_answer: '42',
      })
    );

    // Reflector response
    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Prediction matches ground truth.',
        helpful_skill_ids: [],
        harmful_skill_ids: [],
        new_learnings: [
          {
            section: 'default_answers',
            content:
              'If the question mentions life, universe, and everything, answer 42.',
            atomicity_score: 9,
          },
        ],
      })
    );

    // SkillManager response
    mockLLM.queueResponse(
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

    const skillbook = new Skillbook();
    const agent = new Agent(mockLLM);
    const reflector = new Reflector(mockLLM);
    const skillManager = new SkillManager(mockLLM);

    const adapter = new OfflineACE({
      skillbook,
      agent,
      reflector,
      skillManager,
      maxRefinementRounds: 1,
    });

    const sample: Sample = {
      question: 'What is the answer to life, the universe, and everything?',
      groundTruth: '42',
    };
    const environment = new SimpleQAEnvironment();

    const results = await adapter.run({
      samples: [sample],
      environment,
      epochs: 1,
    });

    // Verify the run completed
    expect(results).toHaveLength(1);
    expect(results[0].agentOutput.final_answer).toBe('42');

    // Verify skillbook was updated
    const stats = skillbook.stats();
    expect(stats.sections).toBeGreaterThanOrEqual(1);

    // Verify a skill about "life" was added
    const skills = skillbook.skills();
    const hasLifeSkill = skills.some((skill) =>
      skill.content.toLowerCase().includes('life')
    );
    expect(hasLifeSkill).toBe(true);
  });

  test('processes multiple samples', async () => {
    const mockLLM = new MockLLMClient();

    // Queue responses for 2 samples × 3 roles
    for (let i = 0; i < 2; i++) {
      // Agent
      mockLLM.queueResponse(
        JSON.stringify({
          reasoning: `Answer for sample ${i + 1}`,
          final_answer: `${i + 1}`,
          skill_ids: [],
        })
      );

      // Reflector
      mockLLM.queueResponse(
        JSON.stringify({
          analysis: `Analysis ${i + 1}`,
          helpful_skill_ids: [],
          harmful_skill_ids: [],
          new_learnings: [],
        })
      );

      // SkillManager
      mockLLM.queueResponse(
        JSON.stringify({
          reasoning: `No updates needed for sample ${i + 1}`,
          operations: [],
        })
      );
    }

    const skillbook = new Skillbook();
    const agent = new Agent(mockLLM);
    const reflector = new Reflector(mockLLM);
    const skillManager = new SkillManager(mockLLM);

    const adapter = new OfflineACE({
      skillbook,
      agent,
      reflector,
      skillManager,
    });

    const samples: Sample[] = [
      { question: 'First?', groundTruth: '1' },
      { question: 'Second?', groundTruth: '2' },
    ];
    const environment = new SimpleQAEnvironment();

    const results = await adapter.run({
      samples,
      environment,
      epochs: 1,
    });

    expect(results).toHaveLength(2);
    expect(results[0].agentOutput.final_answer).toBe('1');
    expect(results[1].agentOutput.final_answer).toBe('2');
  });

  test('handles multiple epochs', async () => {
    const mockLLM = new MockLLMClient();

    // Queue responses for 1 sample × 2 epochs × 3 roles
    for (let epoch = 0; epoch < 2; epoch++) {
      // Agent
      mockLLM.queueResponse(
        JSON.stringify({
          reasoning: `Epoch ${epoch + 1}`,
          final_answer: 'answer',
          skill_ids: [],
        })
      );

      // Reflector
      mockLLM.queueResponse(
        JSON.stringify({
          analysis: `Epoch ${epoch + 1} analysis`,
          helpful_skill_ids: [],
          harmful_skill_ids: [],
          new_learnings: [],
        })
      );

      // SkillManager
      mockLLM.queueResponse(
        JSON.stringify({
          reasoning: `Epoch ${epoch + 1} updates`,
          operations: [],
        })
      );
    }

    const skillbook = new Skillbook();
    const agent = new Agent(mockLLM);
    const reflector = new Reflector(mockLLM);
    const skillManager = new SkillManager(mockLLM);

    const adapter = new OfflineACE({
      skillbook,
      agent,
      reflector,
      skillManager,
    });

    const samples: Sample[] = [{ question: 'Test?', groundTruth: 'answer' }];
    const environment = new SimpleQAEnvironment();

    const results = await adapter.run({
      samples,
      environment,
      epochs: 2,
    });

    // Should have 2 results (one per epoch)
    expect(results).toHaveLength(2);
    expect(results[0].epoch).toBe(1);
    expect(results[1].epoch).toBe(2);
  });
});

describe('OnlineACE', () => {
  test('processes samples sequentially', async () => {
    const mockLLM = new MockLLMClient();

    // Queue responses for 2 samples × 3 roles
    for (let i = 0; i < 2; i++) {
      // Agent
      mockLLM.queueResponse(
        JSON.stringify({
          reasoning: `Answer ${i + 1}`,
          final_answer: `${i + 1}`,
          skill_ids: [],
        })
      );

      // Reflector
      mockLLM.queueResponse(
        JSON.stringify({
          analysis: `Analysis ${i + 1}`,
          helpful_skill_ids: [],
          harmful_skill_ids: [],
          new_learnings: [],
        })
      );

      // SkillManager
      mockLLM.queueResponse(
        JSON.stringify({
          reasoning: `Update ${i + 1}`,
          operations: [],
        })
      );
    }

    const skillbook = new Skillbook();
    const agent = new Agent(mockLLM);
    const reflector = new Reflector(mockLLM);
    const skillManager = new SkillManager(mockLLM);

    const adapter = new OnlineACE({
      skillbook,
      agent,
      reflector,
      skillManager,
    });

    const samples: Sample[] = [
      { question: 'First?', groundTruth: '1' },
      { question: 'Second?', groundTruth: '2' },
    ];
    const environment = new SimpleQAEnvironment();

    const results = await adapter.run({
      samples,
      environment,
    });

    expect(results).toHaveLength(2);
    expect(results[0].agentOutput.final_answer).toBe('1');
    expect(results[1].agentOutput.final_answer).toBe('2');
    expect(results[0].step).toBe(1);
    expect(results[1].step).toBe(2);
  });

  test('learns continuously from each sample', async () => {
    const mockLLM = new MockLLMClient();

    // First sample - add a skill
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'First answer',
        final_answer: 'yes',
        skill_ids: [],
      })
    );
    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Good',
        helpful_skill_ids: [],
        harmful_skill_ids: [],
        new_learnings: [
          {
            section: 'general',
            content: 'Always say yes',
            atomicity_score: 8,
          },
        ],
      })
    );
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Adding helpful skill',
        operations: [
          {
            type: 'ADD',
            section: 'general',
            content: 'Always say yes',
          },
        ],
      })
    );

    // Second sample - should have the skill from first sample
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Using learned skill',
        final_answer: 'yes',
        skill_ids: [],
      })
    );
    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Still good',
        helpful_skill_ids: [],
        harmful_skill_ids: [],
        new_learnings: [],
      })
    );
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'No changes needed',
        operations: [],
      })
    );

    const skillbook = new Skillbook();
    const agent = new Agent(mockLLM);
    const reflector = new Reflector(mockLLM);
    const skillManager = new SkillManager(mockLLM);

    const adapter = new OnlineACE({
      skillbook,
      agent,
      reflector,
      skillManager,
    });

    const samples: Sample[] = [
      { question: 'Should I?', groundTruth: 'yes' },
      { question: 'Again?', groundTruth: 'yes' },
    ];
    const environment = new SimpleQAEnvironment();

    await adapter.run({ samples, environment });

    // Verify skillbook was updated after first sample
    const skills = skillbook.skills();
    const hasYesSkill = skills.some((skill) =>
      skill.content.toLowerCase().includes('yes')
    );
    expect(hasYesSkill).toBe(true);
  });
});
