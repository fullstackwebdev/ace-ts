/**
 * Adaptation loops for offline and online ACE training.
 */

import { Playbook } from './playbook.js';
import {
  Generator,
  Reflector,
  Curator,
  GeneratorOutput,
  ReflectorOutput,
} from './roles.js';
import { DeltaBatch } from './delta.js';
import { mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Single task instance presented to ACE
 */
export interface Sample {
  question: string;
  context?: string;
  groundTruth?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Feedback returned by the task environment
 */
export interface EnvironmentResult {
  feedback: string;
  groundTruth?: string | null;
  metrics?: Record<string, number>;
}

/**
 * Abstract interface for evaluating generator outputs
 */
export abstract class TaskEnvironment {
  /**
   * Evaluate the generator's output for a given sample
   */
  abstract evaluate(
    sample: Sample,
    generatorOutput: GeneratorOutput
  ): Promise<EnvironmentResult>;
}

/**
 * Simple built-in environment for quick testing and demos
 */
export class SimpleEnvironment extends TaskEnvironment {
  async evaluate(
    sample: Sample,
    generatorOutput: GeneratorOutput
  ): Promise<EnvironmentResult> {
    if (!sample.groundTruth) {
      return {
        feedback: 'No ground truth provided',
        groundTruth: null,
        metrics: { correct: 0 },
      };
    }

    const answer = generatorOutput.final_answer.toLowerCase();
    const truth = sample.groundTruth.toLowerCase();
    const isCorrect = answer.includes(truth);

    return {
      feedback: isCorrect
        ? 'Correct!'
        : `Incorrect. Expected: ${sample.groundTruth}`,
      groundTruth: sample.groundTruth,
      metrics: { correct: isCorrect ? 1 : 0 },
    };
  }
}

/**
 * Result from processing a single sample
 */
export interface AdapterStepResult {
  sample: Sample;
  generatorOutput: GeneratorOutput;
  environmentResult: EnvironmentResult;
  reflection: ReflectorOutput;
  curatorDelta: DeltaBatch;
  playbookSnapshot: string;
  epoch: number;
  step: number;
}

/**
 * Base adapter with shared orchestration logic
 */
abstract class AdapterBase {
  protected playbook: Playbook;
  protected recentReflections: string[] = [];

  constructor(
    protected generator: Generator,
    protected reflector: Reflector,
    protected curator: Curator,
    protected options: {
      playbook?: Playbook;
      reflectionWindow?: number;
    } = {}
  ) {
    this.playbook = options.playbook || new Playbook();
  }

  /**
   * Get the current playbook
   */
  getPlaybook(): Playbook {
    return this.playbook;
  }

  /**
   * Apply bullet tags from reflection to playbook
   */
  protected applyBulletTags(reflection: ReflectorOutput): void {
    for (const bulletTag of reflection.bullet_tags || []) {
      this.playbook.tagBullet(bulletTag.id, bulletTag.tag);
    }
  }

  /**
   * Update recent reflections for context
   */
  protected updateRecentReflections(reflection: ReflectorOutput): void {
    const maxWindow = this.options.reflectionWindow || 3;
    this.recentReflections.push(reflection.key_insight);
    if (this.recentReflections.length > maxWindow) {
      this.recentReflections.shift();
    }
  }

  /**
   * Get reflection context from recent reflections
   */
  protected getReflectionContext(): string | null {
    if (this.recentReflections.length === 0) {
      return null;
    }
    return this.recentReflections.join('\n');
  }

  /**
   * Build question context string for curator
   */
  protected buildQuestionContext(
    sample: Sample,
    envResult: EnvironmentResult
  ): string {
    const parts = [
      `question: ${sample.question}`,
      `context: ${sample.context || ''}`,
      `metadata: ${JSON.stringify(sample.metadata || {})}`,
      `feedback: ${envResult.feedback}`,
      `ground_truth: ${envResult.groundTruth || ''}`,
    ];
    return parts.join('\n');
  }

  /**
   * Build progress string for curator
   */
  protected buildProgressString(
    epoch: number,
    totalEpochs: number,
    step: number,
    totalSteps: number
  ): string {
    return `epoch ${epoch}/${totalEpochs} · sample ${step}/${totalSteps}`;
  }

  /**
   * Process a single sample through the ACE pipeline
   */
  protected async processSample(
    sample: Sample,
    environment: TaskEnvironment,
    epoch: number,
    totalEpochs: number,
    stepIndex: number,
    totalSteps: number
  ): Promise<AdapterStepResult> {
    // Generate answer
    const generatorOutput = await this.generator.generate({
      question: sample.question,
      context: sample.context || null,
      playbook: this.playbook,
      reflection: this.getReflectionContext(),
    });

    // Evaluate
    const envResult = await environment.evaluate(sample, generatorOutput);

    // Reflect
    const reflection = await this.reflector.reflect({
      question: sample.question,
      generatorOutput: generatorOutput,
      playbook: this.playbook,
      groundTruth: envResult.groundTruth || null,
      feedback: envResult.feedback,
    });

    // Apply tags and update reflection context
    this.applyBulletTags(reflection);
    this.updateRecentReflections(reflection);

    // Curate playbook updates
    const curatorDelta = await this.curator.curate({
      reflection: reflection,
      playbook: this.playbook,
      questionContext: this.buildQuestionContext(sample, envResult),
      progress: this.buildProgressString(
        epoch,
        totalEpochs,
        stepIndex,
        totalSteps
      ),
    });

    // Apply updates to playbook
    this.playbook.applyDelta(curatorDelta);

    return {
      sample,
      generatorOutput,
      environmentResult: envResult,
      reflection,
      curatorDelta,
      playbookSnapshot: this.playbook.asPrompt(),
      epoch,
      step: stepIndex,
    };
  }
}

/**
 * Orchestrates offline ACE adaptation over multiple training epochs
 */
export class OfflineAdapter extends AdapterBase {
  /**
   * Run offline adaptation on a training set
   */
  async run(
    samples: Sample[],
    environment: TaskEnvironment,
    options: {
      epochs?: number;
      checkpointInterval?: number;
      checkpointDir?: string;
      onEpochStart?: (epoch: number) => void;
      onSampleProcessed?: (result: AdapterStepResult) => void;
      onEpochComplete?: (epoch: number, results: AdapterStepResult[]) => void;
    } = {}
  ): Promise<AdapterStepResult[]> {
    const epochs = options.epochs || 1;
    const allResults: AdapterStepResult[] = [];

    // Validate checkpoint parameters
    if (options.checkpointInterval !== undefined && !options.checkpointDir) {
      throw new Error(
        'checkpointDir must be provided when checkpointInterval is set'
      );
    }

    // Create checkpoint directory if needed
    if (options.checkpointDir) {
      await mkdir(options.checkpointDir, { recursive: true });
    }

    for (let epoch = 1; epoch <= epochs; epoch++) {
      if (options.onEpochStart) {
        options.onEpochStart(epoch);
      }

      const epochResults: AdapterStepResult[] = [];

      for (let i = 0; i < samples.length; i++) {
        try {
          const result = await this.processSample(
            samples[i],
            environment,
            epoch,
            epochs,
            i + 1,
            samples.length
          );

          epochResults.push(result);
          allResults.push(result);

          if (options.onSampleProcessed) {
            options.onSampleProcessed(result);
          }

          // Save checkpoint if interval reached
          if (
            options.checkpointInterval &&
            options.checkpointDir &&
            allResults.length % options.checkpointInterval === 0
          ) {
            const numberedCheckpoint = join(
              options.checkpointDir,
              `convex_checkpoint_${allResults.length}.json`
            );
            const latestCheckpoint = join(
              options.checkpointDir,
              'convex_latest.json'
            );

            await this.playbook.saveToFile(numberedCheckpoint);
            await this.playbook.saveToFile(latestCheckpoint);
            console.log(
              `Checkpoint saved: ${allResults.length} samples → convex_checkpoint_${allResults.length}.json`
            );
          }
        } catch (error) {
          // Log error and continue to next sample
          console.warn(
            `Failed to process sample ${i + 1} in epoch ${epoch}:`,
            error instanceof Error ? error.message : String(error)
          );
          // Skip this sample and continue
          continue;
        }
      }

      if (options.onEpochComplete) {
        options.onEpochComplete(epoch, epochResults);
      }
    }

    return allResults;
  }
}

/**
 * Orchestrates online ACE adaptation for sequential test samples
 */
export class OnlineAdapter extends AdapterBase {
  /**
   * Run online adaptation on test samples
   */
  async run(
    samples: Sample[],
    environment: TaskEnvironment,
    options: {
      onSampleProcessed?: (result: AdapterStepResult) => void;
    } = {}
  ): Promise<AdapterStepResult[]> {
    const results: AdapterStepResult[] = [];

    for (let i = 0; i < samples.length; i++) {
      try {
        const result = await this.processSample(
          samples[i],
          environment,
          1, // Online is single-pass (epoch=1)
          1,
          i + 1,
          samples.length
        );

        results.push(result);

        if (options.onSampleProcessed) {
          options.onSampleProcessed(result);
        }
      } catch (error) {
        // Log error and continue to next sample
        console.warn(
          `Failed to process sample ${i + 1}:`,
          error instanceof Error ? error.message : String(error)
        );
        // Skip this sample and continue
        continue;
      }
    }

    return results;
  }
}
