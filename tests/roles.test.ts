/**
 * Unit tests for Agent, Reflector, and SkillManager roles.
 */

import {
  Agent,
  Reflector,
  SkillManager,
  extractCitedSkillIds,
} from '../src/roles';
import { Skillbook } from '../src/skillbook';
import { MockLLMClient } from './helpers';

describe('extractCitedSkillIds', () => {
  test('extracts single skill ID', () => {
    const text = 'Following [general-00042], I will proceed.';
    const result = extractCitedSkillIds(text);
    expect(result).toEqual(['general-00042']);
  });

  test('extracts multiple IDs in order', () => {
    const text = 'Using [general-00042] and [geo-00003] strategies.';
    const result = extractCitedSkillIds(text);
    expect(result).toEqual(['general-00042', 'geo-00003']);
  });

  test('deduplicates while preserving first occurrence', () => {
    const text = 'Start with [id-001], then [id-002], revisit [id-001].';
    const result = extractCitedSkillIds(text);
    expect(result).toEqual(['id-001', 'id-002']);
  });

  test('returns empty list when no IDs found', () => {
    const text = 'This has no skill citations at all.';
    const result = extractCitedSkillIds(text);
    expect(result).toEqual([]);
  });

  test('extracts IDs ignoring other bracketed content', () => {
    const text = 'Use [strategy-123] but not [this is not an id] or [123].';
    const result = extractCitedSkillIds(text);
    expect(result).toEqual(['strategy-123']);
  });

  test('handles different section naming conventions', () => {
    const text = '[general-001] [content_extraction-042] [API_calls-999]';
    const result = extractCitedSkillIds(text);
    expect(result).toEqual([
      'general-001',
      'content_extraction-042',
      'API_calls-999',
    ]);
  });

  test('handles empty string', () => {
    expect(extractCitedSkillIds('')).toEqual([]);
  });

  test('extracts from multiline text', () => {
    const text = `
      Step 1: Following [setup-001], initialize.
      Step 2: Apply [process-042] for data.
      Step 3: Using [setup-001] again.
    `;
    const result = extractCitedSkillIds(text);
    expect(result).toEqual(['setup-001', 'process-042']);
  });
});

describe('Agent', () => {
  let skillbook: Skillbook;
  let mockLLM: MockLLMClient;

  beforeEach(() => {
    skillbook = new Skillbook();
    mockLLM = new MockLLMClient();
  });

  test('generates basic answer with valid JSON response', async () => {
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Test reasoning',
        final_answer: '42',
        skill_ids: [],
      })
    );

    const agent = new Agent(mockLLM);
    const output = await agent.generate({
      question: 'What is the answer?',
      context: 'Test context',
      skillbook,
    });

    expect(output.final_answer).toBe('42');
    expect(output.reasoning).toBe('Test reasoning');
    expect(output.skill_ids).toHaveLength(0);
  });

  test('extracts skill IDs from reasoning with citations', async () => {
    skillbook.addSkill('math', 'Show your work', 'math-001');

    mockLLM.queueResponse(
      JSON.stringify({
        reasoning:
          'Following [math-001], I will show my work to solve',
        final_answer: '4',
      })
    );

    const agent = new Agent(mockLLM);
    const output = await agent.generate({
      question: 'What is 2+2?',
      context: 'Calculate step by step',
      skillbook,
    });

    expect(output.final_answer).toBe('4');
    expect(output.skill_ids).toContain('math-001');
  });

  test('includes reflection in prompt when provided', async () => {
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Improved answer',
        final_answer: 'Better',
      })
    );

    const agent = new Agent(mockLLM);
    await agent.generate({
      question: 'Test?',
      context: '',
      skillbook,
      reflection: 'Previous attempt was incorrect',
    });

    // Verify reflection was included in prompt
    const lastPrompt = mockLLM.getLastPrompt();
    expect(lastPrompt).toContain('Previous attempt was incorrect');
  });

  test('extracts multiple skill IDs from reasoning', async () => {
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning:
          'Following [strategy-001] and [math-002], but also [content-123] works',
        final_answer: 'OK',
      })
    );

    const agent = new Agent(mockLLM);
    const output = await agent.generate({
      question: 'Test?',
      context: '',
      skillbook,
    });

    expect(output.skill_ids).toHaveLength(3);
    expect(output.skill_ids).toContain('strategy-001');
    expect(output.skill_ids).toContain('math-002');
    expect(output.skill_ids).toContain('content-123');
  });

  test('handles JSON with markdown code blocks', async () => {
    mockLLM.queueResponse(
      '```json\n{"reasoning": "Test", "final_answer": "42"}\n```'
    );

    const agent = new Agent(mockLLM);
    const output = await agent.generate({
      question: 'Test?',
      context: '',
      skillbook,
    });

    expect(output.final_answer).toBe('42');
  });
});

describe('Reflector', () => {
  let skillbook: Skillbook;
  let mockLLM: MockLLMClient;

  beforeEach(() => {
    skillbook = new Skillbook();
    mockLLM = new MockLLMClient();
  });

  test('performs basic reflection with valid JSON', async () => {
    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Answer is correct',
        helpful_skill_ids: [],
        harmful_skill_ids: [],
        new_learnings: [],
      })
    );

    const reflector = new Reflector(mockLLM);
    const reflection = await reflector.reflect({
      question: 'What is 2+2?',
      generatorAnswer: '4',
      feedback: 'Correct!',
      groundTruth: '4',
      skillbook,
    });

    expect(reflection.analysis).toBe('Answer is correct');
    expect(reflection.helpful_skill_ids).toHaveLength(0);
    expect(reflection.harmful_skill_ids).toHaveLength(0);
  });

  test('identifies helpful skills', async () => {
    skillbook.addSkill('math', 'Show your work', 'b1');

    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Good use of step-by-step approach',
        helpful_skill_ids: ['b1'],
        harmful_skill_ids: [],
        new_learnings: [],
      })
    );

    const reflector = new Reflector(mockLLM);
    const reflection = await reflector.reflect({
      question: 'What is 2+2?',
      generatorAnswer: '4',
      feedback: 'Correct',
      groundTruth: '4',
      skillbook,
    });

    expect(reflection.helpful_skill_ids).toHaveLength(1);
    expect(reflection.helpful_skill_ids[0]).toBe('b1');
  });

  test('identifies harmful skills', async () => {
    skillbook.addSkill('math', 'Skip showing work', 'b_bad');

    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Skipping work led to error',
        helpful_skill_ids: [],
        harmful_skill_ids: ['b_bad'],
        new_learnings: [],
      })
    );

    const reflector = new Reflector(mockLLM);
    const reflection = await reflector.reflect({
      question: 'What is 2+2?',
      generatorAnswer: '5',
      feedback: 'Incorrect!',
      groundTruth: '4',
      skillbook,
    });

    expect(reflection.harmful_skill_ids).toHaveLength(1);
    expect(reflection.harmful_skill_ids[0]).toBe('b_bad');
  });

  test('works without ground truth', async () => {
    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Cannot verify without ground truth',
        helpful_skill_ids: [],
        harmful_skill_ids: [],
        new_learnings: [],
      })
    );

    const reflector = new Reflector(mockLLM);
    const reflection = await reflector.reflect({
      question: 'Open-ended question?',
      generatorAnswer: 'Answer',
      feedback: 'Response looks reasonable',
      groundTruth: undefined,
      skillbook,
    });

    expect(reflection.analysis).toBeTruthy();
  });

  test('extracts new learnings', async () => {
    mockLLM.queueResponse(
      JSON.stringify({
        analysis: 'Learned a new pattern',
        helpful_skill_ids: [],
        harmful_skill_ids: [],
        new_learnings: [
          {
            section: 'math',
            content: 'Always verify edge cases',
            atomicity_score: 8,
          },
        ],
      })
    );

    const reflector = new Reflector(mockLLM);
    const reflection = await reflector.reflect({
      question: 'What is 2+2?',
      generatorAnswer: '4',
      feedback: 'Correct',
      skillbook,
    });

    expect(reflection.new_learnings).toHaveLength(1);
    expect(reflection.new_learnings[0].section).toBe('math');
    expect(reflection.new_learnings[0].content).toBe('Always verify edge cases');
    expect(reflection.new_learnings[0].atomicity_score).toBe(8);
  });
});

describe('SkillManager', () => {
  let skillbook: Skillbook;
  let mockLLM: MockLLMClient;

  beforeEach(() => {
    skillbook = new Skillbook();
    mockLLM = new MockLLMClient();
  });

  test('creates ADD operation', async () => {
    mockLLM.queueResponse(
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

    const skillManager = new SkillManager(mockLLM);
    const updateBatch = await skillManager.curate({
      reflectionAnalysis: 'Missing verification step',
      skillbook,
    });

    expect(updateBatch.operations).toHaveLength(1);
    expect(updateBatch.operations[0].type).toBe('ADD');
    expect(updateBatch.operations[0].section).toBe('math');
    expect(updateBatch.operations[0].content).toBe('Always verify calculations');
  });

  test('creates TAG operation', async () => {
    skillbook.addSkill('math', 'Show your work', 'b1');

    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Skill b1 was helpful',
        operations: [
          {
            type: 'TAG',
            section: 'math',
            skill_id: 'b1',
            metadata: { helpful: 1 },
          },
        ],
      })
    );

    const skillManager = new SkillManager(mockLLM);
    const updateBatch = await skillManager.curate({
      reflectionAnalysis: 'Skill helped solve problem',
      skillbook,
    });

    expect(updateBatch.operations[0].type).toBe('TAG');
    expect(updateBatch.operations[0].skill_id).toBe('b1');
    expect(updateBatch.operations[0].metadata?.helpful).toBe(1);
  });

  test('handles multiple operations', async () => {
    mockLLM.queueResponse(
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
            skill_id: 'b1',
            metadata: { helpful: 1 },
          },
        ],
      })
    );

    const skillManager = new SkillManager(mockLLM);
    const updateBatch = await skillManager.curate({
      reflectionAnalysis: 'Multiple changes needed',
      skillbook,
    });

    expect(updateBatch.operations).toHaveLength(2);
    expect(updateBatch.operations[0].type).toBe('ADD');
    expect(updateBatch.operations[1].type).toBe('TAG');
  });

  test('handles empty operations list', async () => {
    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Skillbook is already sufficient',
        operations: [],
      })
    );

    const skillManager = new SkillManager(mockLLM);
    const updateBatch = await skillManager.curate({
      reflectionAnalysis: 'Everything looks good',
      skillbook,
    });

    expect(updateBatch.operations).toHaveLength(0);
    expect(updateBatch.reasoning).toContain('sufficient');
  });

  test('creates UPDATE operation', async () => {
    skillbook.addSkill('math', 'Original content', 'b1');

    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Need to refine existing skill',
        operations: [
          {
            type: 'UPDATE',
            section: 'math',
            skill_id: 'b1',
            content: 'Updated content with more detail',
          },
        ],
      })
    );

    const skillManager = new SkillManager(mockLLM);
    const updateBatch = await skillManager.curate({
      reflectionAnalysis: 'Skill needs refinement',
      skillbook,
    });

    expect(updateBatch.operations[0].type).toBe('UPDATE');
    expect(updateBatch.operations[0].skill_id).toBe('b1');
    expect(updateBatch.operations[0].content).toBe('Updated content with more detail');
  });

  test('creates REMOVE operation', async () => {
    skillbook.addSkill('math', 'Outdated strategy', 'b_old');

    mockLLM.queueResponse(
      JSON.stringify({
        reasoning: 'Remove outdated skill',
        operations: [
          {
            type: 'REMOVE',
            section: 'math',
            skill_id: 'b_old',
          },
        ],
      })
    );

    const skillManager = new SkillManager(mockLLM);
    const updateBatch = await skillManager.curate({
      reflectionAnalysis: 'Skill is no longer useful',
      skillbook,
    });

    expect(updateBatch.operations[0].type).toBe('REMOVE');
    expect(updateBatch.operations[0].skill_id).toBe('b_old');
  });
});
