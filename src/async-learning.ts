/**
 * Async learning infrastructure for ACE.
 *
 * This module provides parallel Reflector execution with serialized Curator
 * for efficient learning without playbook conflicts.
 *
 * Architecture:
 *     Sample 1 ──► Generator ──► Env ──► Reflector ─┐
 *     Sample 2 ──► Generator ──► Env ──► Reflector ─┼──► [Queue] ──► Curator ──► Playbook
 *     Sample 3 ──► Generator ──► Env ──► Reflector ─┘              (serialized)
 *                (parallel)           (parallel)
 */

import { EventEmitter } from 'events';
import type { Playbook, Bullet } from './playbook.js';
import type { Reflector, ReflectorOutput, Curator, GeneratorOutput } from './roles.js';
import type { Sample, EnvironmentResult } from './adaptation.js';
import { DeltaBatch } from './delta.js';

// ---------------------------------------------------------------------------
// Data Classes
// ---------------------------------------------------------------------------

/**
 * Input to Reflector (from main thread).
 *
 * Contains all data needed to run reflection on a sample's results.
 */
export interface LearningTask {
  sample: Sample;
  generatorOutput: GeneratorOutput;
  environmentResult: EnvironmentResult;
  epoch: number;
  stepIndex: number;
  totalEpochs?: number;
  totalSteps?: number;
  timestamp?: number;
  metadata?: Record<string, any>;
}

/**
 * Output from Reflector (goes to Curator queue).
 *
 * Contains the original task plus the reflection analysis.
 */
export interface ReflectionResult {
  task: LearningTask;
  reflection: ReflectorOutput;
  timestamp: number;
}

/**
 * Options for error and completion callbacks
 */
export interface AsyncLearningCallbacks {
  onError?: (error: Error, task: LearningTask) => void;
  onComplete?: (task: LearningTask, curatorOutput: any) => void;
}

/**
 * Configuration options for AsyncLearningPipeline
 */
export interface AsyncLearningOptions extends AsyncLearningCallbacks {
  maxReflectorWorkers?: number;
  curatorQueueSize?: number;
  maxRefinementRounds?: number;
}

// ---------------------------------------------------------------------------
// Thread-Safe Playbook Wrapper
// ---------------------------------------------------------------------------

/**
 * Thread-safe wrapper for Playbook with RWLock semantics.
 *
 * Provides:
 * - Lock-free reads for eventual consistency (Generator can read anytime)
 * - Locked writes to ensure atomic playbook updates (Curator serialized)
 *
 * Note: In Node.js, JavaScript is single-threaded, so explicit locking is
 * typically not needed unless using Worker threads. This implementation
 * provides a consistent API with the Python version while leveraging
 * JavaScript's event loop for concurrency.
 *
 * @example
 * ```typescript
 * const tsPlaybook = new ThreadSafePlaybook(playbook);
 * // Reads are lock-free
 * const prompt = tsPlaybook.asPrompt();
 * // Writes are serialized
 * await tsPlaybook.applyDelta(deltaBatch);
 * ```
 */
export class ThreadSafePlaybook {
  private _playbook: Playbook;
  private _writeLock: Promise<void> = Promise.resolve();

  constructor(playbook: Playbook) {
    this._playbook = playbook;
  }

  /**
   * Direct access to underlying playbook (for read operations).
   */
  get playbook(): Playbook {
    return this._playbook;
  }

  // -----------------------------------------------------------------------
  // Lock-free reads (eventual consistency)
  // -----------------------------------------------------------------------

  /**
   * Get TOON-encoded playbook for LLM prompts (lock-free).
   */
  asPrompt(): string {
    return this._playbook.asPrompt();
  }

  /**
   * Get all bullets (lock-free).
   */
  bullets() {
    return this._playbook.bullets();
  }

  /**
   * Get a bullet by ID (lock-free).
   */
  getBullet(bulletId: string) {
    return this._playbook.getBullet(bulletId);
  }

  /**
   * Get playbook statistics (lock-free).
   */
  stats() {
    return this._playbook.stats();
  }

  // -----------------------------------------------------------------------
  // Locked writes (serialized for thread safety)
  // -----------------------------------------------------------------------

  /**
   * Apply delta operations to playbook (thread-safe).
   */
  async applyDelta(delta: DeltaBatch): Promise<void> {
    // Chain write operations to ensure serialization
    this._writeLock = this._writeLock.then(async () => {
      this._playbook.applyDelta(delta);
    });
    await this._writeLock;
  }

  /**
   * Tag a bullet (thread-safe).
   */
  async tagBullet(bulletId: string, tag: string, increment: number = 1): Promise<Bullet | null> {
    let result: Bullet | null = null;
    this._writeLock = this._writeLock.then(async () => {
      result = this._playbook.tagBullet(bulletId, tag, increment);
    });
    await this._writeLock;
    return result;
  }

  /**
   * Add a bullet (thread-safe).
   */
  async addBullet(
    section: string,
    content: string,
    bulletId?: string,
    metadata?: Record<string, number>
  ): Promise<Bullet> {
    let result!: Bullet;
    this._writeLock = this._writeLock.then(async () => {
      result = this._playbook.addBullet(section, content, bulletId, metadata);
    });
    await this._writeLock;
    return result;
  }

  /**
   * Update a bullet (thread-safe).
   */
  async updateBullet(
    bulletId: string,
    options: {
      content?: string;
      metadata?: Record<string, number>;
    }
  ): Promise<Bullet | null> {
    let result: Bullet | null = null;
    this._writeLock = this._writeLock.then(async () => {
      result = this._playbook.updateBullet(bulletId, options);
    });
    await this._writeLock;
    return result;
  }

  /**
   * Remove a bullet (thread-safe).
   */
  async removeBullet(bulletId: string): Promise<void> {
    this._writeLock = this._writeLock.then(async () => {
      this._playbook.removeBullet(bulletId);
    });
    await this._writeLock;
  }
}

// ---------------------------------------------------------------------------
// Async Learning Pipeline
// ---------------------------------------------------------------------------

/**
 * Parallel Reflectors + Serialized Curator pipeline.
 *
 * This class orchestrates async learning with:
 * 1. Promise.all for parallel Reflector.reflect() calls
 * 2. Single Curator processing queue sequentially
 * 3. Thread-safe playbook wrapper for safe concurrent access
 *
 * Flow:
 *     1. Main thread submits LearningTask via submit()
 *     2. Reflector.reflect() runs in parallel (Promise.all)
 *     3. ReflectionResult queued to Curator
 *     4. Single Curator processes queue sequentially
 *
 * @example
 * ```typescript
 * const pipeline = new AsyncLearningPipeline({
 *   playbook,
 *   reflector,
 *   curator,
 *   maxReflectorWorkers: 3,
 * });
 * pipeline.start();
 * pipeline.submit(task);  // Non-blocking
 * await pipeline.waitForCompletion();
 * pipeline.stop();
 * ```
 */
export class AsyncLearningPipeline extends EventEmitter {
  private _playbook: ThreadSafePlaybook;
  private _reflector: Reflector;
  private _curator: Curator;
  private _maxReflectorWorkers: number;
  private _onError?: (error: Error, task: LearningTask) => void;
  private _onComplete?: (task: LearningTask, curatorOutput: any) => void;

  // Queue for Curator (serialized processing)
  private _curatorQueue: ReflectionResult[] = [];
  private _curatorQueueSize: number;
  private _curatorProcessing = false;
  private _curatorBusy = false; // Track if curator is actively processing
  private _stopRequested = false;

  // Stats
  private _tasksSubmitted = 0;
  private _reflectionsCompleted = 0;
  private _curationsCompleted = 0;
  private _tasksFailed = 0;

  // Track pending promises for wait_for_completion
  private _pendingReflections: Set<Promise<void>> = new Set();

  constructor(
    playbook: Playbook,
    reflector: Reflector,
    curator: Curator,
    options: AsyncLearningOptions = {}
  ) {
    super();
    this._playbook = new ThreadSafePlaybook(playbook);
    this._reflector = reflector;
    this._curator = curator;
    this._maxReflectorWorkers = options.maxReflectorWorkers ?? 3;
    this._curatorQueueSize = options.curatorQueueSize ?? 100;
    this._onError = options.onError;
    this._onComplete = options.onComplete;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the async learning pipeline.
   */
  start(): void {
    if (this._curatorProcessing) {
      console.warn('AsyncLearningPipeline already started');
      return;
    }

    this._stopRequested = false;
    this._startCuratorLoop();

    console.log(
      `AsyncLearningPipeline started with ${this._maxReflectorWorkers} Reflector workers`
    );
  }

  /**
   * Stop the async learning pipeline.
   *
   * @param wait - If true, wait for pending tasks to complete
   * @param timeout - Max milliseconds to wait for completion
   * @returns Number of tasks remaining in queue
   */
  async stop(wait: boolean = true, timeout: number = 30000): Promise<number> {
    if (wait) {
      await this.waitForCompletion(timeout);
    }

    // Signal stop
    this._stopRequested = true;

    const remaining = this._curatorQueue.length;
    console.log(`AsyncLearningPipeline stopped, ${remaining} tasks remaining`);
    return remaining;
  }

  /**
   * Check if the pipeline is running.
   */
  isRunning(): boolean {
    return this._curatorProcessing && !this._stopRequested;
  }

  // -----------------------------------------------------------------------
  // Task Submission
  // -----------------------------------------------------------------------

  /**
   * Submit a learning task (non-blocking).
   *
   * @param task - LearningTask containing sample results to learn from
   * @returns Promise that resolves when task completes
   */
  submit(task: LearningTask): Promise<void> {
    if (!this._curatorProcessing) {
      console.warn('Cannot submit task: pipeline not started');
      return Promise.reject(new Error('Pipeline not started'));
    }

    this._tasksSubmitted++;

    // Submit to reflector worker pool
    const reflectionPromise = this._reflectorWorker(task);

    // Track promise for wait_for_completion
    this._pendingReflections.add(reflectionPromise);
    reflectionPromise.finally(() => {
      this._pendingReflections.delete(reflectionPromise);
    });

    return reflectionPromise;
  }

  // -----------------------------------------------------------------------
  // Synchronization
  // -----------------------------------------------------------------------

  /**
   * Wait for all pending learning tasks to complete.
   *
   * @param timeout - Max milliseconds to wait (undefined = wait forever)
   * @returns true if all tasks completed, false if timeout
   */
  async waitForCompletion(timeout?: number): Promise<boolean> {
    const startTime = Date.now();

    // Wait for all Reflector promises to complete
    const pending = Array.from(this._pendingReflections);
    try {
      if (timeout) {
        await Promise.race([
          Promise.all(pending),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          ),
        ]);
      } else {
        await Promise.all(pending);
      }
    } catch (error) {
      if ((error as Error).message === 'Timeout') {
        return false;
      }
      // Other errors are already handled in workers
    }

    // Wait for Curator queue to drain AND for any active curator processing to complete
    const pollInterval = 100; // ms
    while (this._curatorQueue.length > 0 || this._curatorBusy) {
      if (timeout) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeout) {
          return false;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return true;
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  /**
   * Get pipeline statistics.
   */
  get stats() {
    return {
      tasksSubmitted: this._tasksSubmitted,
      reflectionsCompleted: this._reflectionsCompleted,
      curationsCompleted: this._curationsCompleted,
      tasksFailed: this._tasksFailed,
      curatorQueueSize: this._curatorQueue.length,
      isRunning: this.isRunning(),
    };
  }

  // -----------------------------------------------------------------------
  // Internal Workers
  // -----------------------------------------------------------------------

  /**
   * Run Reflector.reflect() - executes asynchronously.
   *
   * Can have multiple instances running concurrently.
   */
  private async _reflectorWorker(task: LearningTask): Promise<void> {
    try {
      // Run reflection (safe to parallelize - reads only)
      const reflection = await this._reflector.reflect({
        question: task.sample.question,
        generatorOutput: task.generatorOutput,
        playbook: this._playbook.playbook, // Read-only access
        groundTruth: task.environmentResult.groundTruth,
        feedback: task.environmentResult.feedback,
      });

      // Create result
      const result: ReflectionResult = {
        task,
        reflection,
        timestamp: Date.now(),
      };

      // Queue for Curator
      if (this._curatorQueue.length >= this._curatorQueueSize) {
        console.warn(
          `Curator queue full, dropping reflection for sample ${task.stepIndex}`
        );
        this._tasksFailed++;
        return;
      }

      this._curatorQueue.push(result);
      this._reflectionsCompleted++;

      // Trigger curator processing (don't await to allow parallel reflections)
      // Use setImmediate to ensure queue processing happens asynchronously
      setImmediate(() => this._processCuratorQueue());
    } catch (error) {
      console.warn(
        `Reflector failed for sample ${task.stepIndex}: ${(error as Error).message}`
      );
      this._tasksFailed++;

      if (this._onError) {
        try {
          this._onError(error as Error, task);
        } catch {
          // Don't let callback errors propagate
        }
      }
    }
  }

  /**
   * Start the curator processing loop.
   */
  private _startCuratorLoop(): void {
    this._curatorProcessing = true;
  }

  /**
   * Process the curator queue sequentially.
   *
   * Only one instance processes at a time to serialize playbook updates.
   */
  private async _processCuratorQueue(): Promise<void> {
    // Skip if already processing or stopped
    if (this._stopRequested || this._curatorBusy) {
      return;
    }

    this._curatorBusy = true;
    try {
      // Process queue items sequentially
      while (this._curatorQueue.length > 0) {
        const result = this._curatorQueue.shift();
        if (!result) break;

        try {
          await this._processCuration(result);
        } catch (error) {
          console.warn(
            `Curator failed for sample ${result.task.stepIndex}: ${(error as Error).message}`
          );
          this._tasksFailed++;

          if (this._onError) {
            try {
              this._onError(error as Error, result.task);
            } catch {
              // Don't let callback errors propagate
            }
          }
        }
      }
    } finally {
      this._curatorBusy = false;
    }
  }

  /**
   * Process a single reflection result through Curator.
   *
   * Runs in the single Curator context - serialized execution.
   */
  private async _processCuration(result: ReflectionResult): Promise<void> {
    const { task, reflection } = result;

    // Apply bullet tags (thread-safe)
    for (const tag of reflection.bullet_tags || []) {
      try {
        await this._playbook.tagBullet(tag.id, tag.tag);
      } catch {
        continue; // Bullet not found, skip
      }
    }

    // Build question context
    const questionContext = this._buildQuestionContext(task);
    const progress = this._buildProgressString(task);

    // Run Curator (sees latest playbook state)
    const curatorOutput = await this._curator.curate({
      reflection,
      playbook: this._playbook.playbook, // Pass underlying playbook
      questionContext,
      progress,
    });

    // Apply delta (thread-safe)
    await this._playbook.applyDelta(curatorOutput);

    this._curationsCompleted++;

    // Completion callback
    if (this._onComplete) {
      try {
        this._onComplete(task, curatorOutput);
      } catch {
        // Don't let callback errors propagate
      }
    }
  }

  /**
   * Build question context string for Curator.
   */
  private _buildQuestionContext(task: LearningTask): string {
    const parts = [
      `question: ${task.sample.question}`,
      `context: ${task.sample.context || ''}`,
      `metadata: ${JSON.stringify(task.sample.metadata || {})}`,
      `feedback: ${task.environmentResult.feedback}`,
      `ground_truth: ${task.environmentResult.groundTruth || ''}`,
    ];
    return parts.join('\n');
  }

  /**
   * Build progress string for Curator.
   */
  private _buildProgressString(task: LearningTask): string {
    const totalEpochs = task.totalEpochs || 1;
    const totalSteps = task.totalSteps || 1;
    return `epoch ${task.epoch}/${totalEpochs} · sample ${task.stepIndex}/${totalSteps}`;
  }
}
