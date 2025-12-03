/**
 * Unit tests for Generator, Reflector, and Curator roles
 * Ported from Python: tests/test_roles.py
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Generator, Reflector, Curator, ReplayGenerator, extractCitedBulletIds } from '../roles.js';
import type { GeneratorOutput, ReflectorOutput } from '../roles.js';
import { Playbook } from '../playbook.js';
import { MockLLMClient } from './helpers.js';
import * as fs from 'fs';
import * as path from 'path';

describe('extractCitedBulletIds', () => {
  it('should extract single bullet ID', () => {
    const text = 'Following [general-00042], I will proceed.';
    const result = extractCitedBulletIds(text);
    expect(result).toEqual(['general-00042']);
  });

  it('should extract multiple IDs in order', () => {
    const text = 'Using [general-00042] and [geo-00003] strategies.';
    const result = extractCitedBulletIds(text);
    expect(result).toEqual(['general-00042', 'geo-00003']);
  });

  it('should deduplicate while preserving order', () => {
    const text = 'Start with [id-001], then [id-002], revisit [id-001].';
    const result = extractCitedBulletIds(text);
    expect(result).toEqual(['id-001', 'id-002']);
  });

  it('should return empty array when no IDs found', () => {
    const text = 'This has no bullet citations at all.';
    const result = extractCitedBulletIds(text);
    expect(result).toEqual([]);
  });

  it('should extract IDs ignoring other bracketed content', () => {
    const text = 'Use [strategy-123] but not [this is not an id] or [123].';
    const result = extractCitedBulletIds(text);
    expect(result).toEqual(['strategy-123']);
  });

  it('should handle different section naming conventions', () => {
    const text = '[general-001] [content_extraction-042] [API_calls-999]';
    const result = extractCitedBulletIds(text);
    expect(result).toEqual(['general-001', 'content_extraction-042', 'API_calls-999']);
  });

  it('should handle empty string', () => {
    expect(extractCitedBulletIds('')).toEqual([]);
  });

  it('should extract from multiline text', () => {
    const text = `
      Step 1: Following [setup-001], initialize.
      Step 2: Apply [process-042] for data.
      Step 3: Using [setup-001] again.
    `;
    const result = extractCitedBulletIds(text);
    expect(result).toEqual(['setup-001', 'process-042']);
  });
});

describe('Generator', () => {
  let playbook: Playbook;
  let mockLlm: MockLLMClient;

  beforeEach(() => {
    playbook = new Playbook();
    mockLlm = new MockLLMClient();
  });

  it('should generate basic answer with valid JSON response', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Test reasoning',
        final_answer: '42',
        bullet_ids: [],
      })
    );

    const generator = new Generator(mockLlm);
    const output = await generator.generate({
      question: 'What is the answer?',
      context: 'Test context',
      playbook,
    });

    expect(output.final_answer).toBe('42');
    expect(output.reasoning).toBe('Test reasoning');
    expect(output.bullet_ids).toHaveLength(0);
  });

  it('should generate with playbook bullets', async () => {
    const bullet = playbook.addBullet('math', 'Show your work', 'math-001');

    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Following [math-001], I will show my work to solve',
        final_answer: '4',
      })
    );

    const generator = new Generator(mockLlm);
    const output = await generator.generate({
      question: 'What is 2+2?',
      context: 'Calculate step by step',
      playbook,
    });

    expect(output.final_answer).toBe('4');
    expect(output.bullet_ids).toContain('math-001');
  });

  it('should generate with reflection from previous attempt', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Improved answer',
        final_answer: 'Better',
      })
    );

    const generator = new Generator(mockLlm);
    const output = await generator.generate({
      question: 'Test?',
      context: '',
      playbook,
      reflection: 'Previous attempt was incorrect',
    });

    // Verify reflection was included in prompt
    const prompt = mockLlm.callHistory[0].prompt;
    expect(prompt).toContain('Previous attempt was incorrect');
  });

  it('should extract cited bullet IDs from reasoning', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning:
          'Following [strategy-001] and [math-002], but also [content-123] works',
        final_answer: 'OK',
      })
    );

    const generator = new Generator(mockLlm);
    const output = await generator.generate({
      question: 'Test?',
      context: '',
      playbook,
    });

    // Should extract cited IDs from reasoning
    expect(output.bullet_ids).toHaveLength(3);
    expect(output.bullet_ids).toContain('strategy-001');
    expect(output.bullet_ids).toContain('math-002');
    expect(output.bullet_ids).toContain('content-123');
  });
});

describe('Reflector', () => {
  let playbook: Playbook;
  let mockLlm: MockLLMClient;

  beforeEach(() => {
    playbook = new Playbook();
    mockLlm = new MockLLMClient();
  });

  it('should reflect with basic valid JSON', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Answer is correct',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: '',
        bullet_tags: [],
      })
    );

    const reflector = new Reflector(mockLlm);
    const generatorOutput: GeneratorOutput = {
      reasoning: '2+2 equals 4',
      final_answer: '4',
      bullet_ids: [],
      raw: {},
    };

    const reflection = await reflector.reflect({
      question: 'What is 2+2?',
      generatorOutput,
      playbook,
      groundTruth: '4',
      feedback: 'Correct!',
    });

    expect(reflection.reasoning).toBe('Answer is correct');
    expect(reflection.bullet_tags).toHaveLength(0);
  });

  it('should tag bullets as helpful', async () => {
    const bullet = playbook.addBullet('math', 'Show your work', 'b1');

    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Good use of step-by-step approach',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: '',
        bullet_tags: [{ id: 'b1', tag: 'helpful' }],
      })
    );

    const reflector = new Reflector(mockLlm);
    const generatorOutput: GeneratorOutput = {
      reasoning: 'Used bullet b1 for step-by-step',
      final_answer: '4',
      bullet_ids: ['b1'],
      raw: {},
    };

    const reflection = await reflector.reflect({
      question: 'What is 2+2?',
      generatorOutput,
      playbook,
      groundTruth: '4',
      feedback: 'Correct',
    });

    expect(reflection.bullet_tags).toHaveLength(1);
    expect(reflection.bullet_tags[0].id).toBe('b1');
    expect(reflection.bullet_tags[0].tag).toBe('helpful');
  });

  it('should tag bullets as harmful', async () => {
    const bullet = playbook.addBullet('math', 'Skip showing work', 'b_bad');

    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Skipping work led to error',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: '',
        bullet_tags: [{ id: 'b_bad', tag: 'harmful' }],
      })
    );

    const reflector = new Reflector(mockLlm);
    const generatorOutput: GeneratorOutput = {
      reasoning: 'Skipped work as suggested',
      final_answer: '5',
      bullet_ids: ['b_bad'],
      raw: {},
    };

    const reflection = await reflector.reflect({
      question: 'What is 2+2?',
      generatorOutput,
      playbook,
      groundTruth: '4',
      feedback: 'Incorrect!',
    });

    expect(reflection.bullet_tags).toHaveLength(1);
    expect(reflection.bullet_tags[0].id).toBe('b_bad');
    expect(reflection.bullet_tags[0].tag).toBe('harmful');
  });

  it('should work without ground truth', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Cannot verify without ground truth',
        error_identification: '',
        root_cause_analysis: '',
        correct_approach: '',
        key_insight: '',
        bullet_tags: [],
      })
    );

    const reflector = new Reflector(mockLlm);
    const generatorOutput: GeneratorOutput = {
      reasoning: 'Test',
      final_answer: 'Answer',
      bullet_ids: [],
      raw: {},
    };

    const reflection = await reflector.reflect({
      question: 'Open-ended question?',
      generatorOutput,
      playbook,
      groundTruth: null,
      feedback: 'Response looks reasonable',
    });

    expect(reflection.reasoning).toBeTruthy();
  });
});

describe('Curator', () => {
  let playbook: Playbook;
  let mockLlm: MockLLMClient;

  beforeEach(() => {
    playbook = new Playbook();
    mockLlm = new MockLLMClient();
  });

  it('should curate with ADD operation', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Need to add verification strategy',
        operations: [
          {
            type: 'ADD',
            section: 'math',
            content: 'Always verify calculations',
          },
        ],
      })
    );

    const curator = new Curator(mockLlm);
    const reflection: ReflectorOutput = {
      reasoning: 'Missing verification step',
      error_identification: '',
      root_cause_analysis: '',
      correct_approach: '',
      key_insight: '',
      bullet_tags: [],
      raw: {},
    };

    const delta = await curator.curate({
      reflection,
      playbook,
      questionContext: 'Math problem',
      progress: '1/10',
    });

    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0].type).toBe('ADD');
    expect(delta.operations[0].section).toBe('math');
    expect(delta.operations[0].content).toBe('Always verify calculations');
  });

  it('should curate with TAG operation', async () => {
    const bullet = playbook.addBullet('math', 'Show your work', 'b1');

    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Bullet b1 was helpful',
        operations: [
          {
            type: 'TAG',
            section: 'math',
            bullet_id: 'b1',
            metadata: { helpful: 1 },
          },
        ],
      })
    );

    const curator = new Curator(mockLlm);
    const reflection: ReflectorOutput = {
      reasoning: 'Bullet helped solve problem',
      error_identification: '',
      root_cause_analysis: '',
      correct_approach: '',
      key_insight: '',
      bullet_tags: [],
      raw: {},
    };

    const delta = await curator.curate({
      reflection,
      playbook,
      questionContext: 'Math',
      progress: '1/1',
    });

    expect(delta.operations[0].type).toBe('TAG');
    expect(delta.operations[0].bullet_id).toBe('b1');
    expect(delta.operations[0].metadata?.helpful).toBe(1);
  });

  it('should curate with multiple operations', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Add new strategy and tag existing one',
        operations: [
          {
            type: 'ADD',
            section: 'math',
            content: 'Check units',
          },
          {
            type: 'TAG',
            section: 'math',
            bullet_id: 'b1',
            metadata: { helpful: 1 },
          },
        ],
      })
    );

    const curator = new Curator(mockLlm);
    const reflection: ReflectorOutput = {
      reasoning: 'Multiple changes needed',
      error_identification: '',
      root_cause_analysis: '',
      correct_approach: '',
      key_insight: '',
      bullet_tags: [],
      raw: {},
    };

    const delta = await curator.curate({
      reflection,
      playbook,
      questionContext: 'Physics',
      progress: '5/10',
    });

    expect(delta.operations).toHaveLength(2);
    expect(delta.operations[0].type).toBe('ADD');
    expect(delta.operations[1].type).toBe('TAG');
  });

  it('should curate with empty operations when playbook is sufficient', async () => {
    mockLlm.setResponse(
      JSON.stringify({
        reasoning: 'Playbook is already sufficient',
        operations: [],
      })
    );

    const curator = new Curator(mockLlm);
    const reflection: ReflectorOutput = {
      reasoning: 'Everything looks good',
      error_identification: '',
      root_cause_analysis: '',
      correct_approach: '',
      key_insight: '',
      bullet_tags: [],
      raw: {},
    };

    const delta = await curator.curate({
      reflection,
      playbook,
      questionContext: 'Test',
      progress: '10/10',
    });

    expect(delta.operations).toHaveLength(0);
    expect(delta.reasoning).toContain('sufficient');
  });
});

describe('ReplayGenerator', () => {
  it('should replay pre-recorded response', async () => {
    const responses = new Map([
      ['What is 2+2?', '4'],
      ['What is the capital of France?', 'Paris'],
    ]);

    const replayGen = new ReplayGenerator(responses);
    const playbook = new Playbook();

    const output = await replayGen.generate({
      question: 'What is 2+2?',
      context: '',
      playbook,
    });

    expect(output.final_answer).toBe('4');
    expect(output.reasoning).toContain('Replayed');
    expect(output.bullet_ids).toHaveLength(0);
  });

  it('should use default response when question not found', async () => {
    const responses = new Map([['Known question', 'Known answer']]);
    const replayGen = new ReplayGenerator(responses, 'Default answer');

    const playbook = new Playbook();
    const output = await replayGen.generate({
      question: 'Unknown question',
      context: '',
      playbook,
    });

    expect(output.final_answer).toBe('Default answer');
  });

  it('should throw when no response available', async () => {
    const replayGen = new ReplayGenerator();
    const playbook = new Playbook();

    await expect(
      replayGen.generate({
        question: 'Any question',
        context: '',
        playbook,
      })
    ).rejects.toThrow('could not find response');
  });
});
