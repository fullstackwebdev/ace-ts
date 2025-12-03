import { describe, it, expect } from 'vitest';
import { ReplayGenerator } from '../roles.js';
import { Playbook } from '../playbook.js';

/**
 * Test ReplayGenerator backward compatibility and new sample-based mode
 * Ported from: source/tests/test_replay_generator.py
 */
describe('ReplayGenerator', () => {
  describe('Dict-based mode (backward compatibility)', () => {
    it('should replay from responses dict', async () => {
      const responses = new Map([
        ['What is 2+2?', '4'],
        ['What is Python?', 'A programming language'],
      ]);
      const generator = new ReplayGenerator(responses);

      const output = await generator.generate({
        question: 'What is 2+2?',
        context: '',
        playbook: new Playbook(),
      });

      expect(output.final_answer).toBe('4');
      expect(output.reasoning).toContain('[Replayed from responses dict]');
      expect(output.raw.replay_metadata.response_source).toBe('responses_dict');
      expect(output.raw.replay_metadata.question_found_in_dict).toBe(true);
    });

    it('should use default response when question not found', async () => {
      const responses = new Map([['Known question', 'Known answer']]);
      const generator = new ReplayGenerator(responses, "I don't know");

      const output = await generator.generate({
        question: 'Unknown question',
        context: '',
        playbook: new Playbook(),
      });

      expect(output.final_answer).toBe("I don't know");
      expect(output.raw.replay_metadata.response_source).toBe('default_response');
      expect(output.raw.replay_metadata.question_found_in_dict).toBe(false);
    });
  });

  describe('Sample-based mode', () => {
    it('should extract response from sample dict (direct)', async () => {
      const sample = {
        question: 'What is ACE?',
        response: 'Agentic Context Engineering',
      };
      const generator = new ReplayGenerator(); // No dict needed

      const output = await generator.generate({
        question: sample.question,
        context: '',
        playbook: new Playbook(),
        sample,
      });

      expect(output.final_answer).toBe('Agentic Context Engineering');
      expect(output.raw.replay_metadata.response_source).toBe('sample_dict_direct');
      expect(output.raw.replay_metadata.sample_provided).toBe(true);
    });

    it('should extract response from sample metadata dict', async () => {
      const sample = {
        question: 'What is the best framework?',
        metadata: { response: 'ACE Framework' },
      };
      const generator = new ReplayGenerator();

      const output = await generator.generate({
        question: sample.question,
        context: '',
        playbook: new Playbook(),
        sample,
      });

      expect(output.final_answer).toBe('ACE Framework');
      expect(output.raw.replay_metadata.response_source).toBe('sample_metadata');
    });

    it('should extract response from Sample object with metadata', async () => {
      // Simulate a Sample object (matches Python's Sample dataclass)
      const sample = {
        question: 'What is 5+5?',
        ground_truth: '10',
        metadata: { response: 'The answer is 10' },
      };
      const generator = new ReplayGenerator();

      const output = await generator.generate({
        question: sample.question,
        context: '',
        playbook: new Playbook(),
        sample,
      });

      expect(output.final_answer).toBe('The answer is 10');
      expect(output.raw.replay_metadata.response_source).toBe('sample_metadata');
    });
  });

  describe('Priority resolution', () => {
    it('should prioritize sample response over dict lookup', async () => {
      const responses = new Map([['What is 2+2?', '4']]);
      const generator = new ReplayGenerator(responses);

      // Provide both dict and sample - sample should win
      const sample = {
        question: 'What is 2+2?',
        response: '5 (from sample)',
      };

      const output = await generator.generate({
        question: 'What is 2+2?',
        context: '',
        playbook: new Playbook(),
        sample,
      });

      expect(output.final_answer).toBe('5 (from sample)');
      expect(output.raw.replay_metadata.response_source).toBe('sample_dict_direct');
    });

    it('should fallback to dict when sample has no response', async () => {
      const responses = new Map([['What is 2+2?', '4']]);
      const generator = new ReplayGenerator(responses);

      // Sample without response field
      const sample = { question: 'What is 2+2?' };

      const output = await generator.generate({
        question: 'What is 2+2?',
        context: '',
        playbook: new Playbook(),
        sample,
      });

      expect(output.final_answer).toBe('4');
      expect(output.raw.replay_metadata.response_source).toBe('responses_dict');
    });
  });

  describe('Initialization and error handling', () => {
    it('should initialize with empty responses dict', async () => {
      const generator = new ReplayGenerator();

      // Access private field via generate() call to verify initialization
      await expect(
        generator.generate({
          question: 'Any question',
          context: '',
          playbook: new Playbook(),
        })
      ).rejects.toThrow('could not find response');
    });

    it('should handle null responses gracefully', async () => {
      // TypeScript doesn't allow null, but undefined is similar
      const generator = new ReplayGenerator(undefined as any);

      await expect(
        generator.generate({
          question: 'Any question',
          context: '',
          playbook: new Playbook(),
        })
      ).rejects.toThrow();
    });

    it('should throw detailed error when no response available', async () => {
      const generator = new ReplayGenerator();

      await expect(
        generator.generate({
          question: 'Unknown question',
          context: '',
          playbook: new Playbook(),
        })
      ).rejects.toThrow(/could not find response/);

      await expect(
        generator.generate({
          question: 'Unknown question',
          context: '',
          playbook: new Playbook(),
        })
      ).rejects.toThrow(/sample=false/);
    });
  });
});
