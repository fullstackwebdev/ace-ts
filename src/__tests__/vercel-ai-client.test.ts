/**
 * Tests for Vercel AI SDK client integration.
 * TypeScript port of test_litellm_client.py
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { VercelAIClient, VercelAIConfig } from '../llm-providers/vercel-ai-client.js';
import * as ai from 'ai';

// Mock the Vercel AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

describe('VercelAIClient - Basic Tests', () => {
  test('import VercelAIClient', () => {
    expect(VercelAIClient).toBeDefined();
  });

  test('basic completion', async () => {
    const mockResponse = {
      text: 'Test response',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-3.5-turbo' };
    const client = new VercelAIClient({ model: mockModel });
    const response = await client.complete('Test prompt');

    expect(response.text).toBe('Test response');
    expect(response.raw).toHaveProperty('usage');
    expect(response.raw.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  test('parameter filtering - ACE-specific params', async () => {
    const mockResponse = {
      text: 'Test',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'test' };
    const client = new VercelAIClient({ model: mockModel });

    // These ACE-specific parameters should be filtered out
    await client.complete('Test', {
      refinement_round: 1,
      max_refinement_rounds: 3,
    });

    const callArgs = vi.mocked(ai.generateText).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('refinement_round');
    expect(callArgs).not.toHaveProperty('max_refinement_rounds');
  });

  test('handle missing usage data', async () => {
    const mockResponse = {
      text: 'Test response',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-4' };
    const client = new VercelAIClient({ model: mockModel });
    const response = await client.complete('Test prompt');

    expect(response.text).toBe('Test response');
    expect(response.raw.usage).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
  });

  test('error handling', async () => {
    vi.mocked(ai.generateText).mockRejectedValue(new Error('API Error'));

    const mockModel = { modelId: 'gpt-4' };
    const client = new VercelAIClient({ model: mockModel });

    await expect(client.complete('Test prompt')).rejects.toThrow(
      'Vercel AI SDK completion failed: API Error'
    );
  });
});

describe('VercelAIClient - Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('default configuration values', async () => {
    const mockResponse = {
      text: 'Test',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-4' };
    const client = new VercelAIClient({ model: mockModel });
    await client.complete('Test prompt');

    const callArgs = vi.mocked(ai.generateText).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.0);
    expect(callArgs.maxTokens).toBe(2048);
  });

  test('custom configuration values', async () => {
    const mockResponse = {
      text: 'Test',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-4' };
    const config: VercelAIConfig = {
      model: mockModel,
      temperature: 0.7,
      maxTokens: 1024,
      topP: 0.9,
      topK: 50,
    };

    const client = new VercelAIClient(config);
    await client.complete('Test prompt');

    const callArgs = vi.mocked(ai.generateText).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.7);
    expect(callArgs.maxTokens).toBe(1024);
    expect(callArgs.topP).toBe(0.9);
    expect(callArgs.topK).toBe(50);
  });

  test('override temperature in complete call', async () => {
    const mockResponse = {
      text: 'Test',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-4' };
    const client = new VercelAIClient({
      model: mockModel,
      temperature: 0.0,
    });

    await client.complete('Test prompt', { temperature: 0.9 });

    const callArgs = vi.mocked(ai.generateText).mock.calls[0][0];
    expect(callArgs.temperature).toBe(0.9);
  });

  test('system message handling', async () => {
    const mockResponse = {
      text: 'Test',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-4' };
    const client = new VercelAIClient({ model: mockModel });
    await client.complete('Test prompt', {
      system: 'You are a helpful assistant.',
    });

    const callArgs = vi.mocked(ai.generateText).mock.calls[0][0];
    expect(callArgs.system).toBe('You are a helpful assistant.');
  });

  test('optional parameters not included when undefined', async () => {
    const mockResponse = {
      text: 'Test',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-4' };
    const client = new VercelAIClient({
      model: mockModel,
      // Only required params
    });

    await client.complete('Test prompt');

    const callArgs = vi.mocked(ai.generateText).mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('topP');
    expect(callArgs).not.toHaveProperty('topK');
    expect(callArgs).not.toHaveProperty('frequencyPenalty');
    expect(callArgs).not.toHaveProperty('presencePenalty');
    expect(callArgs).not.toHaveProperty('stopSequences');
  });

  test('all optional parameters included when set', async () => {
    const mockResponse = {
      text: 'Test',
      usage: undefined,
      finishReason: 'stop',
    };

    vi.mocked(ai.generateText).mockResolvedValue(mockResponse as any);

    const mockModel = { modelId: 'gpt-4' };
    const config: VercelAIConfig = {
      model: mockModel,
      temperature: 0.7,
      maxTokens: 1024,
      topP: 0.9,
      topK: 50,
      frequencyPenalty: 0.5,
      presencePenalty: 0.3,
      stopSequences: ['\n\n', 'END'],
    };

    const client = new VercelAIClient(config);
    await client.complete('Test prompt');

    const callArgs = vi.mocked(ai.generateText).mock.calls[0][0];
    expect(callArgs.topP).toBe(0.9);
    expect(callArgs.topK).toBe(50);
    expect(callArgs.frequencyPenalty).toBe(0.5);
    expect(callArgs.presencePenalty).toBe(0.3);
    expect(callArgs.stopSequences).toEqual(['\n\n', 'END']);
  });
});

describe('VercelAIClient - Model Name Extraction', () => {
  test('extract model name from model object', () => {
    const mockModel = { modelId: 'gpt-4-turbo' };
    const client = new VercelAIClient({ model: mockModel });
    expect(client.model).toBe('gpt-4-turbo');
  });

  test('fallback to unknown for non-standard model', () => {
    const mockModel = { someOtherProperty: 'value' };
    const client = new VercelAIClient({ model: mockModel });
    expect(client.model).toBe('unknown');
  });
});

describe('VercelAIClient - Regression Tests', () => {
  test('topP defaults to undefined to prevent conflicts', () => {
    const mockModel = { modelId: 'claude-3-sonnet-20240229' };
    const client = new VercelAIClient({ model: mockModel });

    // Access private config through type assertion for testing
    const config = (client as any).config as Required<VercelAIConfig>;

    expect(config.topP).toBeUndefined();
  });

  test('explicit topP value is preserved', () => {
    const mockModel = { modelId: 'gpt-4' };
    const client = new VercelAIClient({
      model: mockModel,
      topP: 0.9,
    });

    const config = (client as any).config as Required<VercelAIConfig>;
    expect(config.topP).toBe(0.9);
  });
});
