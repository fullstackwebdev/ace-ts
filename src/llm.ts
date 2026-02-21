/**
 * LLM client abstractions used by ACE components.
 * Provides OpenAI-compatible HTTP client for any compliant API server.
 */

import { z } from "zod";

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
    super("dummy");
    this._responses = responses ?? [];
  }

  queue(text: string): void {
    /** Enqueue a response to be used on the next completion call */
    this._responses.push(text);
  }

  async complete(_prompt: string, _options?: any): Promise<LLMResponse> {
    if (this._responses.length === 0) {
      throw new Error("DummyLLMClient ran out of queued responses.");
    }
    const text = this._responses.shift()!;
    return { text };
  }

  async completeStructured<T>(
    _prompt: string,
    schema: z.ZodType<T>,
    _options?: any,
  ): Promise<T> {
    /**
     * Mock structured output - parses JSON and validates with Zod.
     *
     * This prevents roles from auto-wrapping with real structured output.
     */
    if (this._responses.length === 0) {
      throw new Error("DummyLLMClient ran out of queued responses.");
    }

    const response = this._responses.shift()!;

    // Parse JSON and validate with Zod schema
    const data = JSON.parse(response);
    return schema.parse(data);
  }
}

export interface OpenAICompatibleClientConfig {
  /** Base URL of the OpenAI-compatible API (e.g., "http://localhost:8080") */
  baseURL: string;
  /** Model name to use (e.g., "llama-3.1-8b", "gpt-4", etc.) */
  model: string;
  /** API key (optional - many local servers don't require auth) */
  apiKey?: string;
  /** Default request timeout in milliseconds (default: 600000 = 10 minutes) */
  timeout?: number;
  /** Default temperature (default: 0.3) */
  temperature?: number;
  /** Default max tokens (default: 16384) */
  maxTokens?: number;
  /** System prompt to use (default: "You are a helpful assistant.") */
  systemPrompt?: string;
}

export class OpenAICompatibleClient extends LLMClient {
  /**
   * OpenAI-compatible HTTP client for any compliant API server.
   *
   * Works with:
   * - Local LLM servers (llama.cpp, Ollama, vLLM, etc.)
   * - OpenAI API
   * - Any OpenAI-compatible endpoint
   *
   * @example
   * ```typescript
   * // Local llama.cpp server
   * const client = new OpenAICompatibleClient({
   *   baseURL: "http://localhost:8080",
   *   model: "llama-3.1-8b"
   * });
   *
   * // OpenAI API
   * const client = new OpenAICompatibleClient({
   *   baseURL: "https://api.openai.com/v1",
   *   model: "gpt-4",
   *   apiKey: process.env.OPENAI_API_KEY
   * });
   * ```
   */
  private baseURL: string;
  private apiKey?: string;
  private timeout: number;
  private temperature: number;
  private maxTokens: number;
  private systemPrompt: string;

  constructor(config: OpenAICompatibleClientConfig) {
    super(config.model);
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 600000;
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 16384;
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
  }

  async complete(prompt: string, options?: any): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: this.systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: options?.temperature ?? this.temperature,
          max_tokens: options?.maxTokens ?? this.maxTokens,
          ...options,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${errorText || response.statusText}`,
        );
      }

      const data = await response.json() as any;
      return {
        text: data.choices?.[0]?.message?.content || "",
        raw: data,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async completeStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: any,
  ): Promise<T> {
    /**
     * Structured output via JSON mode.
     *
     * Appends instruction to return valid JSON, then parses and validates
     * the response against the provided Zod schema.
     */
    const jsonPrompt = `${prompt}\n\nRespond with ONLY valid JSON. No markdown, no code fences.`;
    const response = await this.complete(jsonPrompt, {
      ...options,
      maxTokens: options?.maxTokens ?? this.maxTokens,
    });

    let jsonText = response.text.trim();

    // Strip markdown code fences if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.slice(7).trim();
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.slice(3).trim();
    }
    if (jsonText.endsWith("```")) {
      jsonText = jsonText.slice(0, -3).trim();
    }

    // Extract JSON object from text
    const startIdx = jsonText.indexOf("{");
    const endIdx = jsonText.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) {
      throw new Error("No JSON object found in response");
    }

    const parsed = JSON.parse(jsonText.substring(startIdx, endIdx + 1));
    return schema.parse(parsed) as T;
  }
}

/**
 * Helper function to create OpenAI-compatible clients.
 *
 * @example
 * ```typescript
 * // Local server
 * const client = createLLMClient({
 *   baseURL: "http://localhost:8080",
 *   model: "llama-3.1-8b"
 * });
 *
 * // OpenAI
 * const client = createLLMClient({
 *   baseURL: "https://api.openai.com/v1",
 *   model: "gpt-4",
 *   apiKey: process.env.OPENAI_API_KEY
 * });
 * ```
 */
export function createLLMClient(config: OpenAICompatibleClientConfig): OpenAICompatibleClient {
  return new OpenAICompatibleClient(config);
}
