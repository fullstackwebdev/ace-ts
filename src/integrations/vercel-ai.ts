/**
 * ACE + Vercel AI SDK integration for quick-start learning agents.
 *
 * This module provides ACEVercelAI, a high-level wrapper bundling ACE learning
 * with Vercel AI SDK for easy prototyping and simple tasks.
 *
 * When to Use ACEVercelAI:
 * - Quick start: Want to try ACE with minimal setup
 * - Simple tasks: Q&A, classification, reasoning
 * - Prototyping: Experimenting with ACE learning
 * - No framework needed: Direct LLM usage with learning
 *
 * When NOT to Use ACEVercelAI:
 * - Browser automation → Use browser-use integration
 * - LangChain chains/agents → Use LangChain integration
 * - Custom agentic system → Use integration pattern (see README.md)
 *
 * Example:
 *     import { ACEVercelAI } from './integrations/vercel-ai';
 *
 *     // Create Vercel AI-enhanced agent
 *     const agent = new ACEVercelAI({ model: 'gpt-4o-mini' });
 *
 *     // Ask questions (uses current knowledge)
 *     const answer = await agent.ask("What is 2+2?");
 *
 *     // Learn from examples
 *     import { Sample, SimpleEnvironment } from '../adaptation';
 *     const samples = [
 *         { question: "What is 2+2?", ground_truth: "4" },
 *         { question: "Capital of France?", ground_truth: "Paris" },
 *     ];
 *     await agent.learn(samples, new SimpleEnvironment());
 *
 *     // Save learned knowledge
 *     agent.savePlaybook("my_agent.json");
 *
 *     // Load in next session
 *     const agent2 = new ACEVercelAI({ model: 'gpt-4o-mini', playbookPath: 'my_agent.json' });
 */

import { Playbook } from "../playbook";
import {
  Generator,
  Reflector,
  Curator,
  GeneratorOutput,
} from "../roles";
import {
  OfflineAdapter,
  Sample,
  TaskEnvironment,
  AdapterStepResult,
} from "../adaptation";
import { PromptManager } from "../prompts-v2-1";
import { VercelAIClient, VercelAIConfig } from "../llm-providers/vercel-ai-client";

export interface ACEVercelAIConfig extends VercelAIConfig {
  /** Path to existing playbook (optional) */
  playbookPath?: string;
  /** Enable/disable learning (default: true) */
  isLearning?: boolean;
}

/**
 * Vercel AI SDK integration with ACE learning.
 *
 * Bundles Generator, Reflector, Curator, and Playbook into a simple interface
 * powered by Vercel AI SDK (supports 100+ LLM providers).
 *
 * Perfect for:
 * - Quick start with ACE
 * - Q&A, classification, and reasoning tasks
 * - Prototyping and experimentation
 * - Learning without external frameworks
 *
 * Insight Level: Micro
 *     Uses the full ACE loop with TaskEnvironment for ground truth evaluation.
 *     The learn() method runs OfflineAdapter which evaluates correctness and
 *     learns from whether answers are right or wrong.
 *
 * For other use cases:
 * - Browser automation: Use browser-use integration (meso-level)
 * - LangChain chains/agents: Use LangChain integration (meso for AgentExecutor)
 * - Integration pattern: Custom agent systems (see docs)
 *
 * Example:
 *     // Basic usage
 *     const agent = new ACEVercelAI({ model: 'gpt-4o-mini' });
 *     const answer = await agent.ask("What is the capital of France?");
 *     console.log(answer);  // "Paris"
 *
 *     // Learning from feedback
 *     import { Sample, SimpleEnvironment } from '../adaptation';
 *     const samples = [
 *         { question: "What is 2+2?", ground_truth: "4" },
 *         { question: "What is 3+3?", ground_truth: "6" },
 *     ];
 *     await agent.learn(samples, new SimpleEnvironment(), 1);
 *
 *     // Save and load
 *     agent.savePlaybook("learned.json");
 *     const agent2 = new ACEVercelAI({ model: 'gpt-4o-mini', playbookPath: 'learned.json' });
 */
export class ACEVercelAI {
  /** Learned strategies (Playbook instance) */
  public playbook: Playbook;

  /** Whether learning is enabled */
  public isLearning: boolean;

  /** Vercel AI model name */
  public model: string;

  private llm: VercelAIClient;
  private generator: Generator;
  private reflector: Reflector;
  private curator: Curator;
  private _adapter?: OfflineAdapter;
  private _lastInteraction?: { question: string; output: GeneratorOutput };

  /**
   * Initialize ACEVercelAI agent.
   *
   * @param config - Configuration object
   * @param config.model - Vercel AI model name (default: 'gpt-4o-mini')
   *                       Supports 100+ providers: OpenAI, Anthropic, Google, etc.
   * @param config.maxTokens - Max tokens for responses (default: 2048)
   * @param config.temperature - Sampling temperature (default: 0.0)
   * @param config.apiKey - API key for the LLM provider. Falls back to env vars if not set.
   * @param config.baseURL - Custom API endpoint URL (e.g., http://localhost:1234/v1)
   * @param config.headers - Custom HTTP headers object (e.g., {"X-Tenant-ID": "abc"})
   * @param config.playbookPath - Path to existing playbook (optional)
   * @param config.isLearning - Enable/disable learning (default: true)
   *
   * Example:
   *     // OpenAI
   *     const agent = new ACEVercelAI({ model: 'gpt-4o-mini' });
   *
   *     // Anthropic
   *     const agent = new ACEVercelAI({ model: 'claude-3-haiku-20240307' });
   *
   *     // Google
   *     const agent = new ACEVercelAI({ model: 'gemini-pro' });
   *
   *     // With explicit API key
   *     const agent = new ACEVercelAI({ model: 'gpt-4', apiKey: 'sk-...' });
   *
   *     // Custom endpoint (LM Studio, Ollama)
   *     const agent = new ACEVercelAI({
   *         model: 'local-model',
   *         baseURL: 'http://localhost:1234/v1'
   *     });
   *
   *     // Enterprise with custom headers
   *     const agent = new ACEVercelAI({
   *         model: 'gpt-4',
   *         baseURL: 'https://proxy.company.com/v1',
   *         headers: { 'X-Tenant-ID': 'team-alpha' }
   *     });
   *
   *     // With existing playbook
   *     const agent = new ACEVercelAI({
   *         model: 'gpt-4o-mini',
   *         playbookPath: 'expert.json'
   *     });
   */
  constructor(config: ACEVercelAIConfig) {
    this.model = config.model || "gpt-4o-mini";
    this.isLearning = config.isLearning ?? true;

    // Load or create playbook
    if (config.playbookPath) {
      this.playbook = Playbook.loadFromFile(config.playbookPath);
    } else {
      this.playbook = new Playbook();
    }

    // Create LLM client with configuration
    this.llm = new VercelAIClient(config);

    // Create ACE components with v2.1 prompts
    const promptMgr = new PromptManager();
    this.generator = new Generator(
      this.llm,
      promptMgr.getGeneratorPrompt()
    );
    this.reflector = new Reflector(
      this.llm,
      promptMgr.getReflectorPrompt()
    );
    this.curator = new Curator(
      this.llm,
      promptMgr.getCuratorPrompt()
    );
  }

  /**
   * Ask a question and get an answer (uses current playbook).
   *
   * This uses the ACE Generator with the current playbook's learned strategies.
   * The full GeneratorOutput trace is stored internally for potential learning
   * via learnFromFeedback().
   *
   * @param question - Question to answer
   * @param context - Additional context (optional)
   * @returns Answer string
   *
   * Example:
   *     const agent = new ACEVercelAI();
   *     const answer = await agent.ask("What is the capital of Japan?");
   *     console.log(answer);  // "Tokyo"
   *
   *     // With context
   *     const answer = await agent.ask(
   *         "What is GDP?",
   *         "Economics question"
   *     );
   *
   *     // Learn from feedback
   *     await agent.learnFromFeedback("correct");
   */
  async ask(question: string, context: string = ""): Promise<string> {
    const result = await this.generator.generate({
      question,
      context,
      playbook: this.playbook,
    });

    // Store full trace for potential learning via learnFromFeedback()
    this._lastInteraction = { question, output: result };

    return result.final_answer;
  }

  /**
   * Learn from examples (offline learning).
   *
   * Uses OfflineAdapter to learn from a batch of samples.
   *
   * Insight Level: Micro
   *     This is micro-level learning with ground truth evaluation.
   *     The TaskEnvironment evaluates each answer for correctness,
   *     and the Reflector learns from whether answers are right or wrong.
   *
   * @param samples - List of Sample objects to learn from
   * @param environment - TaskEnvironment for evaluating results
   * @param epochs - Number of training epochs (default: 1)
   * @param checkpointInterval - Save playbook every N samples (optional)
   * @param checkpointDir - Directory for checkpoints (optional)
   * @returns List of AdapterStepResult from training
   *
   * Example:
   *     import { Sample, SimpleEnvironment } from '../adaptation';
   *
   *     const samples = [
   *         { question: "What is 2+2?", ground_truth: "4" },
   *         { question: "Capital of France?", ground_truth: "Paris" },
   *     ];
   *
   *     const agent = new ACEVercelAI();
   *     const results = await agent.learn(samples, new SimpleEnvironment(), 1);
   *
   *     console.log(`Learned ${agent.playbook.bullets().length} strategies`);
   */
  async learn(
    samples: Sample[],
    environment: TaskEnvironment,
    epochs: number = 1,
    checkpointInterval?: number,
    checkpointDir?: string
  ): Promise<AdapterStepResult[]> {
    if (!this.isLearning) {
      throw new Error("Learning is disabled. Set isLearning=true first.");
    }

    // Create offline adapter
    this._adapter = new OfflineAdapter(
      this.generator,
      this.reflector,
      this.curator,
      { playbook: this.playbook }
    );

    // Run learning
    const results = await this._adapter.run(samples, environment, {
      epochs,
      checkpointInterval,
      checkpointDir,
    });

    return results;
  }

  /**
   * Learn from the last ask() interaction.
   *
   * Uses the stored GeneratorOutput trace from the previous ask() call.
   * This allows the Reflector to analyze the full reasoning and bullet
   * citations, not just the final answer.
   *
   * Follows the `learnFrom_X` naming pattern from other ACE integrations.
   *
   * @param feedback - User feedback describing the outcome. Can be:
   *                   - Simple: "correct", "wrong", "partially correct"
   *                   - Detailed: "Good answer but too verbose"
   * @param groundTruth - Optional correct answer if the response was wrong
   * @returns True if learning was applied
   *          False if no prior interaction exists or learning is disabled
   *
   * Example:
   *     const agent = new ACEVercelAI();
   *
   *     // Ask and provide feedback
   *     const answer = await agent.ask("What is 2+2?");
   *     await agent.learnFromFeedback("correct");
   *
   *     // With ground truth for incorrect answers
   *     const answer = await agent.ask("Capital of Australia?");
   *     await agent.learnFromFeedback("wrong", "Canberra");
   *
   *     // Detailed feedback
   *     const answer = await agent.ask("Explain quantum physics");
   *     await agent.learnFromFeedback("Too technical for a beginner audience");
   */
  async learnFromFeedback(
    feedback: string,
    groundTruth?: string
  ): Promise<boolean> {
    if (!this.isLearning) {
      return false;
    }

    if (!this._lastInteraction) {
      return false;
    }

    const { question, output: generatorOutput } = this._lastInteraction;

    // Run Reflector with full trace context
    const reflection = await this.reflector.reflect({
      question,
      generatorOutput, // Full trace: reasoning, bullet_ids
      feedback,
      playbook: this.playbook,
      groundTruth,
    });

    // Run Curator to generate playbook updates
    const deltaBatch = await this.curator.curate({
      reflection,
      playbook: this.playbook,
      questionContext: `User interaction: ${question}`,
      progress: "Learning from user feedback",
    });

    // Apply updates to playbook
    this.playbook.applyDelta(deltaBatch);
    return true;
  }

  /**
   * Save learned playbook to file.
   *
   * @param path - File path to save to (creates parent dirs if needed)
   *
   * Example:
   *     agent.savePlaybook("my_agent.json");
   */
  savePlaybook(path: string): void {
    this.playbook.saveToFile(path);
  }

  /**
   * Load playbook from file (replaces current playbook).
   *
   * @param path - File path to load from
   *
   * Example:
   *     agent.loadPlaybook("expert.json");
   */
  loadPlaybook(path: string): void {
    this.playbook = Playbook.loadFromFile(path);
  }

  /**
   * Enable learning (allows learn() to update playbook).
   */
  enableLearning(): void {
    this.isLearning = true;
  }

  /**
   * Disable learning (prevents learn() from updating playbook).
   */
  disableLearning(): void {
    this.isLearning = false;
  }

  /**
   * Get current playbook strategies as formatted text.
   *
   * @returns Formatted string with learned strategies (empty if none)
   *
   * Example:
   *     const strategies = agent.getStrategies();
   *     console.log(strategies);
   */
  getStrategies(): string {
    if (!this.playbook || this.playbook.bullets().length === 0) {
      return "";
    }
    const { wrapPlaybookContext } = require("./base");
    return wrapPlaybookContext(this.playbook);
  }

  // Note: Async learning methods (waitForLearning, learningStats, stopAsyncLearning)
  // are not yet implemented in TypeScript OfflineAdapter.
  // These will be added when async-learning.ts is integrated with OfflineAdapter.

  /**
   * String representation.
   */
  toString(): string {
    const bulletsCount = this.playbook ? this.playbook.bullets().length : 0;
    return (
      `ACEVercelAI(model='${this.model}', ` +
      `strategies=${bulletsCount}, ` +
      `learning=${this.isLearning ? "enabled" : "disabled"})`
    );
  }
}
