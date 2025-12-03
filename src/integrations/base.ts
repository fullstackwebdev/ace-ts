/**
 * Base classes and utilities for ACE integrations with external agentic frameworks.
 *
 * This module provides the foundation for integrating ACE learning capabilities
 * with external agentic systems like browser-use, LangChain, CrewAI, and custom agents.
 *
 * ## When to Use Integrations vs Full ACE Pipeline
 *
 * ### Use INTEGRATIONS (this module) when:
 * - You have an existing agentic system (browser-use, LangChain, custom agent)
 * - The external agent handles task execution
 * - You want ACE to learn from that agent's results
 * - Example: Browser automation, LangChain chains, API-based agents
 *
 * ### Use FULL ACE PIPELINE when:
 * - Building a new agent from scratch
 * - Want ACE Generator to handle task execution
 * - Simple Q&A, classification, reasoning tasks
 * - Example: Question answering, data extraction, summarization
 *
 * ## Integration Pattern (Three Steps)
 *
 * The integration pattern allows external agents to benefit from ACE learning
 * without replacing their execution logic:
 *
 *     1. INJECT: Add playbook context to agent's input (optional)
 *        → wrapPlaybookContext(playbook) formats learned strategies
 *
 *     2. EXECUTE: External agent runs normally
 *        → Your framework handles the task (browser-use, LangChain, etc.)
 *
 *     3. LEARN: ACE analyzes results and updates playbook
 *        → Reflector: Analyzes what worked/failed
 *        → Curator: Updates playbook with new strategies
 *
 * ## Why No ACE Generator?
 *
 * Integrations bypass ACE's Generator because:
 * - External frameworks have their own execution logic
 * - They may use tools, browsers, or specialized workflows
 * - ACE focuses on LEARNING from their results, not replacing them
 *
 * ## Basic Example
 *
 * ```typescript
 * import { wrapPlaybookContext } from './integrations/base';
 * import { Playbook, Reflector, Curator } from '../index';
 * import { GeneratorOutput } from '../roles';
 * import { VercelAIClient } from '../llm-providers/vercel-ai-client';
 *
 * // Setup
 * const playbook = new Playbook();
 * const llm = new VercelAIClient({ model: 'gpt-4o-mini', maxTokens: 2048 });
 * const reflector = new Reflector(llm);
 * const curator = new Curator(llm);
 *
 * // 1. INJECT: Add learned strategies to task (optional)
 * let task = 'Process user request';
 * if (playbook.bullets().length > 0) {
 *   task = `${task}\n\n${wrapPlaybookContext(playbook)}`;
 * }
 *
 * // 2. EXECUTE: Your agent runs
 * const result = await yourAgent.execute(task);
 *
 * // 3. LEARN: ACE learns from results
 * const generatorOutput: GeneratorOutput = {
 *   reasoning: `Task: ${task}`,
 *   final_answer: result.output,
 *   bullet_ids: [],  // External agents don't cite bullets
 *   raw: { success: result.success }
 * };
 *
 * const reflection = await reflector.reflect({
 *   question: task,
 *   generatorOutput,
 *   playbook,
 *   feedback: `Task ${result.success ? 'succeeded' : 'failed'}`
 * });
 *
 * const curatorOutput = await curator.curate({
 *   reflection,
 *   playbook,
 *   questionContext: `task: ${task}`,
 *   progress: `Executing: ${task}`
 * });
 *
 * playbook.applyDelta(curatorOutput.delta);
 * playbook.saveToFile('learned.json');
 * ```
 *
 * ## See Also
 *
 * - Reference implementation: ace/integrations/browser_use.py
 * - Full integration guide: docs/INTEGRATION_GUIDE.md
 * - Out-of-box wrappers: ACELiteLLM, ACEAgent (browser-use), ACELangChain
 */

import { Playbook } from '../playbook';
import { wrapPlaybookForExternalAgent } from '../prompts-v2-1';

/**
 * Wrap playbook bullets with explanation for external agents.
 *
 * This helper formats learned strategies from the playbook with instructions
 * on how to apply them. Delegates to the canonical implementation in
 * prompts-v2-1 to ensure consistency across all ACE components.
 *
 * The formatted output includes:
 * - Header explaining these are learned strategies
 * - List of bullets with success rates (helpful/harmful scores)
 * - Usage instructions on how to apply strategies
 * - Reminder that these are patterns, not rigid rules
 *
 * @param playbook - Playbook with learned strategies
 * @returns Formatted text explaining playbook and listing strategies.
 *          Returns empty string if playbook has no bullets.
 *
 * @example
 * Basic usage with any agent:
 * ```typescript
 * const playbook = new Playbook();
 * playbook.addBullet('general', 'Always verify inputs');
 * const context = wrapPlaybookContext(playbook);
 * const enhancedTask = `${task}\n\n${context}`;
 * const result = await yourAgent.execute(enhancedTask);
 * ```
 *
 * @example
 * With browser-use:
 * ```typescript
 * import { Agent } from 'browser-use';
 * const task = 'Find top HN post';
 * const enhancedTask = `${task}\n\n${wrapPlaybookContext(playbook)}`;
 * const agent = new Agent({ task: enhancedTask, llm });
 * await agent.run();
 * ```
 *
 * @example
 * With LangChain:
 * ```typescript
 * import { LLMChain } from 'langchain/chains';
 * const context = wrapPlaybookContext(playbook);
 * await chain.call({ input: task, context });
 * ```
 *
 * @example
 * With API-based agents:
 * ```typescript
 * const payload = {
 *   task,
 *   strategies: wrapPlaybookContext(playbook)
 * };
 * const response = await apiClient.post('/execute', payload);
 * ```
 *
 * @example
 * Conditional injection (skip if empty):
 * ```typescript
 * if (playbook.bullets().length > 0) {
 *   task = `${task}\n\n${wrapPlaybookContext(playbook)}`;
 * }
 * // task unchanged if no learned strategies yet
 * ```
 *
 * Integration Patterns:
 * 1. String Concatenation (most common):
 *    ```typescript
 *    const enhancedTask = `${task}\n\n${context}`;
 *    ```
 *
 * 2. Dict/Object Injection:
 *    ```typescript
 *    await chain.call({ input: task, learned_strategies: context });
 *    ```
 *
 * 3. System Message Injection:
 *    ```typescript
 *    const messages = [
 *      { role: 'system', content: context },
 *      { role: 'user', content: task }
 *    ];
 *    ```
 *
 * 4. Tool Description Enhancement:
 *    ```typescript
 *    tool.description += `\n\nLearned patterns: ${context}`;
 *    ```
 *
 * @note
 * This function delegates to wrapPlaybookForExternalAgent() in
 * prompts-v2-1 module, which is the single source of truth for
 * playbook presentation. Kept here for backward compatibility and
 * convenience.
 *
 * @see {@link ../integrations/browser_use.ts} Reference implementation
 * @see {@link ../../docs/INTEGRATION_GUIDE.md} Full integration guide
 */
export function wrapPlaybookContext(playbook: Playbook): string {
  return wrapPlaybookForExternalAgent(playbook);
}
