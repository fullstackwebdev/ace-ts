/**
 * Test helpers and utilities - shared across test files
 */

import { LLMClient, LLMResponse } from '../llm.js';
import { z } from 'zod';

/**
 * Mock LLM client for testing - mimics the Python conftest.py MockLLMClient
 */
export class MockLLMClient extends LLMClient {
  private responses: string[] = [];
  public callHistory: Array<{
    prompt: string;
    responseModel?: z.ZodType<any>;
    kwargs?: Record<string, any>;
  }> = [];

  constructor() {
    super('mock');
  }

  /**
   * Queue a response for the next complete() call
   */
  setResponse(response: string): void {
    this.responses.push(response);
  }

  /**
   * Queue multiple responses
   */
  setResponses(responses: string[]): void {
    this.responses.push(...responses);
  }

  /**
   * Return queued response or throw if none available
   */
  async complete(prompt: string, kwargs?: Record<string, any>): Promise<LLMResponse> {
    this.callHistory.push({ prompt, kwargs });

    if (this.responses.length === 0) {
      throw new Error(
        'MockLLMClient has no queued responses. Use setResponse() or setResponses() first.'
      );
    }

    const response = this.responses.shift()!;
    return { text: response };
  }

  /**
   * Mock structured output - parses JSON and validates with Zod
   */
  async completeStructured<T>(
    prompt: string,
    responseModel: z.ZodType<T>,
    kwargs?: Record<string, any>
  ): Promise<T> {
    this.callHistory.push({ prompt, responseModel, kwargs });

    if (this.responses.length === 0) {
      throw new Error(
        'MockLLMClient has no queued responses. Use setResponse() or setResponses() first.'
      );
    }

    const response = this.responses.shift()!;
    const data = JSON.parse(response);
    return responseModel.parse(data);
  }

  /**
   * Clear all responses and history
   */
  reset(): void {
    this.responses = [];
    this.callHistory = [];
  }
}
