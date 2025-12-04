/**
 * Test helpers and mock implementations.
 */

import { LLMClient, LLMResponse } from "../src/llm";

export class MockLLMClient extends LLMClient {
  /**
   * Mock LLM client for testing.
   *
   * Usage:
   *   const mockLLM = new MockLLMClient();
   *   mockLLM.queueResponse('{"answer": "42"}');
   *   const response = await mockLLM.complete('test prompt');
   */
  private responses: string[] = [];
  public callHistory: Array<{ prompt: string; [key: string]: any }> = [];

  constructor() {
    super();
  }

  queueResponse(response: string): void {
    /**
     * Queue a response for the next complete() call.
     */
    this.responses.push(response);
  }

  queueResponses(responses: string[]): void {
    /**
     * Queue multiple responses.
     */
    this.responses.push(...responses);
  }

  async complete(prompt: string): Promise<LLMResponse> {
    /**
     * Return queued response or throw if none available.
     */
    this.callHistory.push({ prompt });

    if (this.responses.length === 0) {
      throw new Error(
        "MockLLMClient has no queued responses. Use queueResponse() first.",
      );
    }

    const response = this.responses.shift()!;
    return { text: response };
  }

  reset(): void {
    /**
     * Clear all responses and history.
     */
    this.responses = [];
    this.callHistory = [];
  }

  getLastPrompt(): string {
    /**
     * Get the last prompt that was sent.
     */
    if (this.callHistory.length === 0) {
      throw new Error("No prompts in call history");
    }
    return this.callHistory[this.callHistory.length - 1].prompt;
  }
}
