/**
 * Tests for optional dependency detection (features.ts)
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  hasOpik,
  hasVercelAI,
  hasLangChain,
  hasBrowserUse,
  hasPlaywright,
  getAvailableFeatures,
  resetFeatureCache,
} from '../features.js';

describe('Features - Dependency Detection', () => {
  beforeEach(() => {
    // Reset cache before each test
    resetFeatureCache();
  });

  test('getAvailableFeatures returns record of all features', () => {
    const features = getAvailableFeatures();

    expect(features).toHaveProperty('opik');
    expect(features).toHaveProperty('vercelAI');
    expect(features).toHaveProperty('langchain');
    expect(features).toHaveProperty('browserUse');
    expect(features).toHaveProperty('playwright');

    // All values should be booleans
    for (const value of Object.values(features)) {
      expect(typeof value).toBe('boolean');
    }
  });

  test('hasVercelAI detects Vercel AI SDK', () => {
    const result = hasVercelAI();
    // Should be boolean
    expect(typeof result).toBe('boolean');
    // In this test environment, Vercel AI SDK should be available
    expect(result).toBe(true);
  });

  test('hasOpik detects Opik availability', () => {
    const result = hasOpik();
    expect(typeof result).toBe('boolean');
    // Opik is optional, may or may not be installed
  });

  test('hasLangChain detects LangChain availability', () => {
    const result = hasLangChain();
    expect(typeof result).toBe('boolean');
    // LangChain is optional, may or may not be installed
  });

  test('hasBrowserUse detects browser-use availability', () => {
    const result = hasBrowserUse();
    expect(typeof result).toBe('boolean');
    // browser-use is optional
  });

  test('hasPlaywright detects Playwright availability', () => {
    const result = hasPlaywright();
    expect(typeof result).toBe('boolean');
    // Playwright is optional
  });

  test('feature checks are cached', () => {
    // First call
    const first = hasVercelAI();

    // Second call should use cache
    const second = hasVercelAI();

    expect(first).toBe(second);
  });

  test('resetFeatureCache clears the cache', () => {
    // Call to populate cache
    hasVercelAI();

    // Reset cache
    resetFeatureCache();

    // Call again should re-check
    const result = hasVercelAI();
    expect(typeof result).toBe('boolean');
  });

  test('getAvailableFeatures returns consistent results', () => {
    const first = getAvailableFeatures();
    const second = getAvailableFeatures();

    expect(first).toEqual(second);
  });

  test('feature detection handles missing packages gracefully', () => {
    // These should not throw errors even if packages are missing
    expect(() => hasOpik()).not.toThrow();
    expect(() => hasLangChain()).not.toThrow();
    expect(() => hasBrowserUse()).not.toThrow();
    expect(() => hasPlaywright()).not.toThrow();
  });
});
