/**
 * Tests for core LLM client abstractions
 * Ported from Python: tests/test_llm.py
 */

import { describe, it, expect } from 'vitest';
import { LLMClient, LLMResponse, DummyLLMClient } from '../llm.js';

describe('LLMResponse', () => {
  it('should create basic response', () => {
    const response: LLMResponse = { text: 'Hello world' };
    expect(response.text).toBe('Hello world');
    expect(response.raw).toBeUndefined();
  });

  it('should create response with raw metadata', () => {
    const rawData = { model: 'gpt-4', tokens: 100 };
    const response: LLMResponse = { text: 'Answer', raw: rawData };
    expect(response.text).toBe('Answer');
    expect(response.raw).toEqual(rawData);
  });
});

describe('LLMClient', () => {
  it('should allow valid subclass', async () => {
    class ValidLLM extends LLMClient {
      async complete(_prompt: string, _kwargs?: Record<string, unknown>): Promise<LLMResponse> {
        return { text: 'test' };
      }
    }

    const client = new ValidLLM('test-model');
    expect(client.model).toBe('test-model');
    const response = await client.complete('test');
    expect(response.text).toBe('test');
  });
});

describe('DummyLLMClient', () => {
  it('should initialize empty', () => {
    const client = new DummyLLMClient();
    expect(client.model).toBe('dummy');
  });

  it('should initialize with pre-queued responses', () => {
    const responses = ['response1', 'response2'];
    const client = new DummyLLMClient(responses);
    expect(client.model).toBe('dummy');
  });

  it('should queue single response', async () => {
    const client = new DummyLLMClient();
    client.queue('Hello');

    const response = await client.complete('test prompt');
    expect(response.text).toBe('Hello');
  });

  it('should queue multiple responses in order', async () => {
    const client = new DummyLLMClient();
    client.queue('First');
    client.queue('Second');
    client.queue('Third');

    expect((await client.complete('prompt1')).text).toBe('First');
    expect((await client.complete('prompt2')).text).toBe('Second');
    expect((await client.complete('prompt3')).text).toBe('Third');
  });

  it('should raise error when no responses queued', async () => {
    const client = new DummyLLMClient();

    await expect(client.complete('prompt')).rejects.toThrow('ran out of queued responses');
  });

  it('should accept kwargs in complete', async () => {
    const client = new DummyLLMClient();
    client.queue('Response');

    const response = await client.complete('prompt', {
      temperature: 0.5,
      max_tokens: 100,
      custom_param: 'value',
    });
    expect(response.text).toBe('Response');
  });

  it('should return responses in FIFO order', async () => {
    const client = new DummyLLMClient();
    client.queue('A');
    client.queue('B');
    client.queue('C');

    expect((await client.complete('p1')).text).toBe('A');
    expect((await client.complete('p2')).text).toBe('B');
    expect((await client.complete('p3')).text).toBe('C');
  });

  it('should allow queuing after completion', async () => {
    const client = new DummyLLMClient();
    client.queue('First');

    expect((await client.complete('p1')).text).toBe('First');

    // Queue more
    client.queue('Second');
    client.queue('Third');

    expect((await client.complete('p2')).text).toBe('Second');
    expect((await client.complete('p3')).text).toBe('Third');
  });

  it('should handle JSON response', async () => {
    const client = new DummyLLMClient();
    const jsonResponse = '{"answer": "42", "reasoning": "calculated"}';
    client.queue(jsonResponse);

    const response = await client.complete('What is the answer?');
    expect(response.text).toBe(jsonResponse);
  });

  it('should handle multiline response', async () => {
    const client = new DummyLLMClient();
    const multiline = 'Line 1\nLine 2\nLine 3';
    client.queue(multiline);

    const response = await client.complete('prompt');
    expect(response.text).toBe(multiline);
  });

  it('should handle empty string response', async () => {
    const client = new DummyLLMClient();
    client.queue('');

    const response = await client.complete('prompt');
    expect(response.text).toBe('');
  });

  it('should initialize from array', async () => {
    const responses = ['r1', 'r2', 'r3'];
    const client = new DummyLLMClient(responses);

    expect((await client.complete('p1')).text).toBe('r1');
    expect((await client.complete('p2')).text).toBe('r2');
    expect((await client.complete('p3')).text).toBe('r3');
  });
});
