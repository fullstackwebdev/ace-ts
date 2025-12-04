/**
 * LLM client abstractions used by ACE components.
 * Uses Vercel AI SDK for TypeScript instead of LiteLLM.
 */

import { generateText, LanguageModel } from 'ai';
import { z } from 'zod';

export interface LLMResponse {
  /** Container for LLM outputs */
  text: string;
  raw?: any;
}

export abstract class LLMClient {
  /** Abstract interface so ACE can plug into any chat/completions API */
  model?: string;

  constructor(model?: string) {
    this.model = model;
  }

  abstract complete(prompt: string, options?: any): Promise<LLMResponse>;
}

export class DummyLLMClient extends LLMClient {
  /**
   * Deterministic LLM stub for testing and dry runs.
   *
   * Includes completeStructured() to prevent auto-wrapping with structured output.
   */
  private _responses: string[] = [];

  constructor(responses?: string[]) {
    super('dummy');
    this._responses = responses ?? [];
  }

  queue(text: string): void {
    /** Enqueue a response to be used on the next completion call */
    this._responses.push(text);
  }

  async complete(_prompt: string, _options?: any): Promise<LLMResponse> {
    if (this._responses.length === 0) {
      throw new Error('DummyLLMClient ran out of queued responses.');
    }
    const text = this._responses.shift()!;
    return { text };
  }

  async completeStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: any
  ): Promise<T> {
    /**
     * Mock structured output - parses JSON and validates with Zod.
     *
     * This prevents roles from auto-wrapping with real structured output.
     */
    if (this._responses.length === 0) {
      throw new Error('DummyLLMClient ran out of queued responses.');
    }

    const response = this._responses.shift()!;

    // Parse JSON and validate with Zod schema
    const data = JSON.parse(response);
    return schema.parse(data);
  }
}

export class VercelAIClient extends LLMClient {
  /**
   * LLM client powered by Vercel AI SDK.
   * Supports all providers: OpenAI, Anthropic, Google, etc.
   */
  private languageModel: LanguageModel;
  private defaultOptions: any;

  constructor(params: {
    model: LanguageModel;
    defaultOptions?: any;
  }) {
    super();
    this.languageModel = params.model;
    this.defaultOptions = params.defaultOptions ?? {};
  }

  async complete(prompt: string, options?: any): Promise<LLMResponse> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    const result = await generateText({
      model: this.languageModel,
      prompt,
      ...mergedOptions,
    });

    return {
      text: result.text,
      raw: result,
    };
  }

  async completeStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: any
  ): Promise<T> {
    /**
     * Structured output using Vercel AI SDK's generateObject.
     */
    // Dynamic import to avoid circular dependency
    const { generateObject } = await import('ai');

    const mergedOptions = { ...this.defaultOptions, ...options };

    const result = await generateObject({
      model: this.languageModel,
      schema,
      prompt,
      ...mergedOptions,
    });

    return result.object;
  }
}

/**
 * Helper function to create LLM clients from provider strings.
 * This is a convenience wrapper around Vercel AI SDK providers.
 */
export async function createLLMClient(params: {
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  model: string;
  apiKey?: string;
  options?: any;
}): Promise<VercelAIClient> {
  let languageModel: LanguageModel;

  switch (params.provider) {
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      languageModel = openai(params.model, { apiKey: params.apiKey });
      break;
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      languageModel = anthropic(params.model, { apiKey: params.apiKey });
      break;
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      languageModel = google(params.model, { apiKey: params.apiKey });
      break;
    }
    case 'custom': {
      throw new Error('Custom provider not yet implemented. Please provide a LanguageModel directly.');
    }
  }

  return new VercelAIClient({
    model: languageModel,
    defaultOptions: params.options,
  });
}
