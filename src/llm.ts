/**
 * LLM client abstractions used by ACE components.
 */

import { z } from 'zod';

/**
 * Container for LLM outputs
 */
export interface LLMResponse {
  text: string;
  raw?: Record<string, unknown>;
}

/**
 * Abstract interface so ACE can plug into any chat/completions API
 */
export abstract class LLMClient {
  constructor(public readonly model?: string) {}

  /**
   * Return the model text for a given prompt
   */
  abstract complete(prompt: string, options?: Record<string, unknown>): Promise<LLMResponse>;

  /**
   * Optional structured output support.
   * Clients can override this to provide native structured output.
   * Default implementation parses JSON from text response.
   */
  async completeStructured<T extends z.ZodType>(
    prompt: string,
    responseSchema: T,
    options?: Record<string, unknown>
  ): Promise<z.infer<T>> {
    const response = await this.complete(prompt, options);
    const parsed = JSON.parse(response.text);
    return responseSchema.parse(parsed);
  }
}

/**
 * Deterministic LLM stub for testing and dry runs
 */
export class DummyLLMClient extends LLMClient {
  private _responses: string[];

  constructor(responses: string[] = []) {
    super('dummy');
    this._responses = [...responses];
  }

  /**
   * Enqueue a response to be used on the next completion call
   */
  queue(text: string): void {
    this._responses.push(text);
  }

  async complete(
    prompt: string,
    options?: Record<string, unknown>
  ): Promise<LLMResponse> {
    if (this._responses.length === 0) {
      throw new Error('DummyLLMClient ran out of queued responses.');
    }
    return { text: this._responses.shift()! };
  }

  async completeStructured<T extends z.ZodType>(
    prompt: string,
    responseSchema: T,
    options?: Record<string, unknown>
  ): Promise<z.infer<T>> {
    if (this._responses.length === 0) {
      throw new Error('DummyLLMClient ran out of queued responses.');
    }

    const response = this._responses.shift()!;
    const data = JSON.parse(response);
    return responseSchema.parse(data);
  }
}
