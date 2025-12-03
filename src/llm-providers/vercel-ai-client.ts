/**
 * Vercel AI SDK client for unified access to multiple LLM providers.
 * This is the TypeScript equivalent of Python's LiteLLM client.
 */

import { generateText } from 'ai';
import { LLMClient, LLMResponse } from '../llm.js';
import { z } from 'zod';

/**
 * Configuration for Vercel AI client
 */
export interface VercelAIConfig {
  model: any; // Vercel AI SDK model instance (from @ai-sdk/openai, @ai-sdk/anthropic, etc.)
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

/**
 * Production LLM client using Vercel AI SDK for unified access to multiple providers.
 *
 * Supports:
 * - OpenAI (GPT-3.5, GPT-4, GPT-4o, etc.)
 * - Anthropic (Claude-3, Claude-3.5, etc.)
 * - Google (Gemini)
 * - Mistral
 * - Cohere
 * - And many more via Vercel AI SDK
 *
 * Example:
 *     import { openai } from '@ai-sdk/openai';
 *     import { VercelAIClient } from './llm-providers/vercel-ai-client';
 *
 *     const client = new VercelAIClient({
 *       model: openai('gpt-4'),
 *       temperature: 0.0,
 *       maxTokens: 2048,
 *     });
 *
 *     const response = await client.complete('What is the capital of France?');
 *
 * Example with Anthropic:
 *     import { anthropic } from '@ai-sdk/anthropic';
 *
 *     const client = new VercelAIClient({
 *       model: anthropic('claude-3-5-sonnet-20241022'),
 *     });
 */
export class VercelAIClient extends LLMClient {
  private config: Required<VercelAIConfig>;

  constructor(config: VercelAIConfig) {
    // Extract model name if possible for the base class
    const modelName =
      typeof config.model === 'object' && 'modelId' in config.model
        ? String(config.model.modelId)
        : 'unknown';

    super(modelName);

    // Set defaults for optional parameters
    this.config = {
      model: config.model,
      temperature: config.temperature ?? 0.0,
      maxTokens: config.maxTokens ?? 2048,
      topP: config.topP,
      topK: config.topK,
      frequencyPenalty: config.frequencyPenalty,
      presencePenalty: config.presencePenalty,
      stopSequences: config.stopSequences,
    } as Required<VercelAIConfig>;
  }

  /**
   * Generate completion for the given prompt
   */
  async complete(
    prompt: string,
    options?: Record<string, unknown>
  ): Promise<LLMResponse> {
    const system = options?.system as string | undefined;

    // Build generation parameters
    const params: any = {
      model: this.config.model,
      prompt: prompt,
      temperature: (options?.temperature as number) ?? this.config.temperature,
      maxTokens: (options?.maxTokens as number) ?? this.config.maxTokens,
    };

    // Add optional parameters
    if (this.config.topP !== undefined) {
      params.topP = this.config.topP;
    }
    if (this.config.topK !== undefined) {
      params.topK = this.config.topK;
    }
    if (this.config.frequencyPenalty !== undefined) {
      params.frequencyPenalty = this.config.frequencyPenalty;
    }
    if (this.config.presencePenalty !== undefined) {
      params.presencePenalty = this.config.presencePenalty;
    }
    if (this.config.stopSequences !== undefined) {
      params.stopSequences = this.config.stopSequences;
    }

    // Add system message if provided
    if (system) {
      params.system = system;
    }

    try {
      const response = await generateText(params);

      // Build metadata
      const metadata: Record<string, unknown> = {
        model: response.usage?.model || this.model,
        usage: {
          prompt_tokens: response.usage?.promptTokens || 0,
          completion_tokens: response.usage?.completionTokens || 0,
          total_tokens: response.usage?.totalTokens || 0,
        },
        finishReason: response.finishReason,
      };

      return {
        text: response.text,
        raw: metadata,
      };
    } catch (error) {
      throw new Error(
        `Vercel AI SDK completion failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate structured output using Zod schema
   */
  async completeStructured<T extends z.ZodType>(
    prompt: string,
    responseSchema: T,
    options?: Record<string, unknown>
  ): Promise<z.infer<T>> {
    // For now, use the base implementation that parses JSON from text
    // In the future, we can use Vercel AI SDK's native structured output
    // when it's more widely available across providers
    return super.completeStructured(prompt, responseSchema, options);
  }
}
