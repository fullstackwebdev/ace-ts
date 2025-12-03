/**
 * Generator, Reflector, and Curator components - the three core ACE roles.
 */

import { z } from 'zod';
import { LLMClient } from './llm.js';
import { Playbook } from './playbook.js';
import { DeltaBatch } from './delta.js';
import { GENERATOR_PROMPT, REFLECTOR_PROMPT, CURATOR_PROMPT } from './prompts.js';

/**
 * Helper function to safely parse JSON from LLM responses
 */
function safeJsonParse(text: string): Record<string, unknown> {
  // Strip markdown code blocks if present
  let cleaned = text.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7).trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3).trim();
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3).trim();
  }

  try {
    const data = JSON.parse(cleaned);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('Expected a JSON object from LLM');
    }
    return data as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `LLM response is not valid JSON: ${error instanceof Error ? error.message : String(error)}\nText: ${cleaned.slice(0, 200)}...`
    );
  }
}

/**
 * Format optional values for prompts
 */
function formatOptional(value: string | null | undefined): string {
  return value || '(none)';
}

/**
 * Extract bullet IDs cited in text using [id-format] notation
 */
export function extractCitedBulletIds(text: string): string[] {
  const matches = text.match(/\[([a-zA-Z_]+-\d+)\]/g) || [];
  const ids = matches.map((m) => m.slice(1, -1));
  // Deduplicate while preserving order
  return Array.from(new Set(ids));
}

/**
 * Generator output schema
 */
const GeneratorOutputSchema = z.object({
  reasoning: z.string().describe('Step-by-step reasoning process'),
  final_answer: z.string().describe('The final answer to the question'),
  bullet_ids: z.array(z.string()).optional().default([]),
});

export type GeneratorOutput = z.infer<typeof GeneratorOutputSchema> & {
  raw?: Record<string, unknown>;
};

/**
 * Generator - produces answers using the current playbook of strategies
 */
export class Generator {
  constructor(
    private llm: LLMClient,
    private promptTemplate: string = GENERATOR_PROMPT
  ) {}

  /**
   * Generate an answer using the playbook strategies
   */
  async generate(options: {
    question: string;
    context?: string | null;
    playbook: Playbook;
    reflection?: string | null;
  }): Promise<GeneratorOutput> {
    const prompt = this.promptTemplate
      .replace('{playbook}', options.playbook.asPrompt() || '(empty playbook)')
      .replace('{reflection}', formatOptional(options.reflection))
      .replace('{question}', options.question)
      .replace('{context}', formatOptional(options.context));

    // Use structured output if available, otherwise parse JSON manually
    let output: GeneratorOutput;

    if (this.llm.completeStructured) {
      output = await this.llm.completeStructured(prompt, GeneratorOutputSchema);
    } else {
      const response = await this.llm.complete(prompt);
      const parsed = safeJsonParse(response.text);
      output = GeneratorOutputSchema.parse(parsed);
    }

    // Extract cited bullet IDs from reasoning
    output.bullet_ids = extractCitedBulletIds(output.reasoning);

    return output;
  }
}

/**
 * Bullet tag schema
 */
const BulletTagSchema = z.object({
  id: z.string().describe('The bullet ID being tagged'),
  tag: z
    .enum(['helpful', 'harmful', 'neutral'])
    .describe('Classification of strategy effectiveness'),
});

export type BulletTag = z.infer<typeof BulletTagSchema>;

/**
 * Reflector output schema
 */
const ReflectorOutputSchema = z.object({
  reasoning: z.string().describe('Overall reasoning about the outcome'),
  error_identification: z
    .string()
    .optional()
    .default('')
    .describe('Description of what went wrong'),
  root_cause_analysis: z
    .string()
    .optional()
    .default('')
    .describe('Analysis of why errors occurred'),
  correct_approach: z.string().describe('What the correct approach should be'),
  key_insight: z.string().describe('The main lesson learned from this iteration'),
  bullet_tags: z
    .array(BulletTagSchema)
    .optional()
    .default([])
    .describe('Classifications of strategy effectiveness'),
});

export type ReflectorOutput = z.infer<typeof ReflectorOutputSchema> & {
  raw?: Record<string, unknown>;
};

/**
 * Reflector - analyzes generator outputs to extract lessons and improve strategies
 */
export class Reflector {
  constructor(
    private llm: LLMClient,
    private promptTemplate: string = REFLECTOR_PROMPT
  ) {}

  /**
   * Analyze the generator's performance and extract lessons
   */
  async reflect(options: {
    question: string;
    generatorOutput: GeneratorOutput;
    feedback: string;
    playbook: Playbook;
    groundTruth?: string | null;
  }): Promise<ReflectorOutput> {
    // Build playbook excerpt from cited bullets
    const excerptParts: string[] = [];
    for (const bulletId of options.generatorOutput.bullet_ids || []) {
      const bullet = options.playbook.getBullet(bulletId);
      if (bullet) {
        excerptParts.push(`[${bullet.id}] ${bullet.content}`);
      }
    }
    const playbookExcerpt =
      excerptParts.length > 0 ? excerptParts.join('\n') : '(no bullets cited)';

    const prompt = this.promptTemplate
      .replace('{question}', options.question)
      .replace('{reasoning}', options.generatorOutput.reasoning)
      .replace('{prediction}', options.generatorOutput.final_answer)
      .replace('{ground_truth}', formatOptional(options.groundTruth))
      .replace('{feedback}', options.feedback)
      .replace('{playbook_excerpt}', playbookExcerpt);

    // Use structured output if available, otherwise parse JSON manually
    let output: ReflectorOutput;

    if (this.llm.completeStructured) {
      output = await this.llm.completeStructured(prompt, ReflectorOutputSchema);
    } else {
      const response = await this.llm.complete(prompt);
      const parsed = safeJsonParse(response.text);
      output = ReflectorOutputSchema.parse(parsed);
    }

    return output;
  }
}

/**
 * Curator output schema (DeltaBatch)
 */
const CuratorOutputSchema = z.object({
  reasoning: z.string().describe('How you decided on the updates'),
  operations: z
    .array(
      z.object({
        type: z.enum(['ADD', 'UPDATE', 'TAG', 'REMOVE']),
        section: z.string(),
        content: z.string().optional(),
        bullet_id: z.string().optional(),
        metadata: z.record(z.string(), z.number()).optional(),
      })
    )
    .describe('List of playbook operations'),
});

/**
 * Curator - updates playbook based on reflections
 */
export class Curator {
  constructor(
    private llm: LLMClient,
    private promptTemplate: string = CURATOR_PROMPT
  ) {}

  /**
   * Generate playbook updates based on reflection
   */
  async curate(options: {
    reflection: ReflectorOutput;
    playbook: Playbook;
    progress?: string;
    questionContext?: string;
  }): Promise<DeltaBatch> {
    const stats = options.playbook.stats();
    const statsStr = JSON.stringify(stats, null, 2);

    const prompt = this.promptTemplate
      .replace('{progress}', options.progress || '(no progress info)')
      .replace('{stats}', statsStr)
      .replace('{reflection}', JSON.stringify(options.reflection, null, 2))
      .replace('{playbook}', options.playbook.toString())
      .replace('{question_context}', options.questionContext || '(none)');

    // Use structured output if available, otherwise parse JSON manually
    let parsed: Record<string, unknown>;

    if (this.llm.completeStructured) {
      parsed = await this.llm.completeStructured(prompt, CuratorOutputSchema);
    } else {
      const response = await this.llm.complete(prompt);
      parsed = safeJsonParse(response.text);
      CuratorOutputSchema.parse(parsed); // Validate
    }

    // Convert to DeltaBatch
    return DeltaBatch.fromJson(parsed);
  }
}

/**
 * Replay Generator - replays pre-recorded responses instead of calling an LLM
 * Useful for offline training from historical data
 */
export class ReplayGenerator {
  constructor(
    private responses: Map<string, string> = new Map(),
    private defaultResponse: string = ''
  ) {}

  /**
   * Return the pre-recorded response for the given question
   */
  async generate(options: {
    question: string;
    context?: string | null;
    playbook: Playbook;
    reflection?: string | null;
  }): Promise<GeneratorOutput> {
    const answer =
      this.responses.get(options.question) || this.defaultResponse;

    if (!answer) {
      throw new Error(
        `ReplayGenerator could not find response for question: ${options.question.slice(0, 100)}...`
      );
    }

    return {
      reasoning: '[Replayed from recorded responses]',
      final_answer: answer,
      bullet_ids: [],
      raw: { replayed: true },
    };
  }
}
