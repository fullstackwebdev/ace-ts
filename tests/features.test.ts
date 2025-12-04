/**
 * Unit tests for features module
 */

import {
  hasVercelAI,
  hasOpenAI,
  hasAnthropic,
  hasGoogleAI,
  hasLangChain,
  hasPlaywright,
  hasPuppeteer,
  hasZod,
  hasDotenv,
  getAvailableFeatures,
  printFeatureStatus,
  clearFeatureCache,
} from '../src/features';

describe('Features Module', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearFeatureCache();
  });

  describe('Individual feature checks', () => {
    test('hasVercelAI should check for ai package', () => {
      const result = hasVercelAI();
      expect(typeof result).toBe('boolean');
      // We know 'ai' is installed in this project
      expect(result).toBe(true);
    });

    test('hasOpenAI should check for openai package', () => {
      const result = hasOpenAI();
      expect(typeof result).toBe('boolean');
    });

    test('hasAnthropic should check for @anthropic-ai/sdk package', () => {
      const result = hasAnthropic();
      expect(typeof result).toBe('boolean');
    });

    test('hasGoogleAI should check for @google/generative-ai package', () => {
      const result = hasGoogleAI();
      expect(typeof result).toBe('boolean');
    });

    test('hasLangChain should check for @langchain/core package', () => {
      const result = hasLangChain();
      expect(typeof result).toBe('boolean');
    });

    test('hasPlaywright should check for playwright package', () => {
      const result = hasPlaywright();
      expect(typeof result).toBe('boolean');
    });

    test('hasPuppeteer should check for puppeteer package', () => {
      const result = hasPuppeteer();
      expect(typeof result).toBe('boolean');
    });

    test('hasZod should check for zod package', () => {
      const result = hasZod();
      expect(typeof result).toBe('boolean');
      // We know 'zod' is installed in this project
      expect(result).toBe(true);
    });

    test('hasDotenv should check for dotenv package', () => {
      const result = hasDotenv();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Feature caching', () => {
    test('should cache feature check results', () => {
      // First call
      const result1 = hasVercelAI();
      // Second call should use cache
      const result2 = hasVercelAI();
      expect(result1).toBe(result2);
    });

    test('should clear cache when clearFeatureCache is called', () => {
      // Populate cache
      hasVercelAI();
      hasZod();

      // Clear cache
      clearFeatureCache();

      // Should still work after clearing
      const result = hasVercelAI();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getAvailableFeatures', () => {
    test('should return object with all feature checks', () => {
      const features = getAvailableFeatures();

      expect(features).toHaveProperty('vercelAI');
      expect(features).toHaveProperty('openai');
      expect(features).toHaveProperty('anthropic');
      expect(features).toHaveProperty('googleAI');
      expect(features).toHaveProperty('langchain');
      expect(features).toHaveProperty('playwright');
      expect(features).toHaveProperty('puppeteer');
      expect(features).toHaveProperty('zod');
      expect(features).toHaveProperty('dotenv');
    });

    test('all values should be booleans', () => {
      const features = getAvailableFeatures();

      Object.values(features).forEach(value => {
        expect(typeof value).toBe('boolean');
      });
    });

    test('should include known installed packages', () => {
      const features = getAvailableFeatures();

      // We know these are installed in this project
      expect(features.vercelAI).toBe(true);
      expect(features.zod).toBe(true);
    });
  });

  describe('printFeatureStatus', () => {
    test('should not throw when called', () => {
      // Mock console.log to avoid output during tests
      const originalLog = console.log;
      console.log = jest.fn();

      expect(() => printFeatureStatus()).not.toThrow();

      // Restore console.log
      console.log = originalLog;
    });

    test('should call console.log with feature information', () => {
      // Mock console.log
      const originalLog = console.log;
      const mockLog = jest.fn();
      console.log = mockLog;

      printFeatureStatus();

      // Should have logged multiple lines
      expect(mockLog.mock.calls.length).toBeGreaterThan(5);

      // Should include header
      expect(mockLog.mock.calls.some(call =>
        call[0].includes('ACE Framework')
      )).toBe(true);

      // Restore console.log
      console.log = originalLog;
    });
  });

  describe('Edge cases', () => {
    test('should handle non-existent packages gracefully', () => {
      // These checks should return false without throwing
      expect(() => getAvailableFeatures()).not.toThrow();
    });

    test('should work after multiple cache clears', () => {
      clearFeatureCache();
      clearFeatureCache();
      clearFeatureCache();

      const result = hasVercelAI();
      expect(typeof result).toBe('boolean');
    });
  });
});
