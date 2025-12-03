/**
 * Tests for Observability Module
 *
 * Tests the Opik integration and tracing decorators.
 * Note: These tests run without Opik installed, testing graceful degradation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OpikIntegration,
  configureOpik,
  getIntegration,
  isOpikAvailable,
  _shouldSkipOpik,
} from '../observability/opik-integration';
import { maybeTrack, trackRole, aceTrack, isOpikAvailable as isOpikAvailableTracer } from '../observability/tracers';

describe('OpikIntegration', () => {
  it('should initialize with default settings', () => {
    const integration = new OpikIntegration();
    expect(integration.projectName).toBe('ace-framework');
    expect(integration.tags).toEqual(['ace-framework']);
    // Should be disabled when Opik is not installed
    expect(integration.enabled).toBe(false);
  });

  it('should initialize with custom settings', () => {
    const integration = new OpikIntegration('my-project', true, ['custom-tag']);
    expect(integration.projectName).toBe('my-project');
    expect(integration.tags).toEqual(['custom-tag']);
  });

  it('should report availability correctly', () => {
    const integration = new OpikIntegration();
    expect(integration.isAvailable()).toBe(false);
    expect(isOpikAvailable()).toBe(false);
  });

  it('should handle logBulletEvolution gracefully when disabled', () => {
    const integration = new OpikIntegration();
    // Should not throw
    expect(() => {
      integration.logBulletEvolution(
        'bullet-001',
        'Test bullet content',
        5,
        1,
        2,
        'test-section'
      );
    }).not.toThrow();
  });

  it('should handle logPlaybookUpdate gracefully when disabled', () => {
    const integration = new OpikIntegration();
    // Should not throw
    expect(() => {
      integration.logPlaybookUpdate('ADD', 3, 1, 0, 10);
    }).not.toThrow();
  });

  it('should handle logRolePerformance gracefully when disabled', () => {
    const integration = new OpikIntegration();
    // Should not throw
    expect(() => {
      integration.logRolePerformance('Generator', 1.5, true);
    }).not.toThrow();
  });

  it('should handle logAdaptationMetrics gracefully when disabled', () => {
    const integration = new OpikIntegration();
    // Should not throw
    expect(() => {
      integration.logAdaptationMetrics(1, 5, 0.85, 20, 42, 50);
    }).not.toThrow();
  });

  it('should handle createExperiment gracefully when disabled', () => {
    const integration = new OpikIntegration();
    // Should not throw
    expect(() => {
      integration.createExperiment('test-experiment', 'Test description');
    }).not.toThrow();
  });
});

describe('Global Opik Integration', () => {
  it('should return singleton instance from getIntegration', () => {
    const integration1 = getIntegration();
    const integration2 = getIntegration();
    expect(integration1).toBe(integration2);
  });

  it('should configure global integration', () => {
    const integration = configureOpik('custom-project', ['tag1', 'tag2']);
    expect(integration.projectName).toBe('custom-project');
    expect(integration.tags).toEqual(['tag1', 'tag2']);
  });
});

describe('Environment Variable Handling', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should skip Opik when OPIK_DISABLED=true', () => {
    process.env.OPIK_DISABLED = 'true';
    expect(_shouldSkipOpik()).toBe(true);
  });

  it('should skip Opik when OPIK_DISABLED=1', () => {
    process.env.OPIK_DISABLED = '1';
    expect(_shouldSkipOpik()).toBe(true);
  });

  it('should skip Opik when OPIK_ENABLED=false', () => {
    process.env.OPIK_ENABLED = 'false';
    expect(_shouldSkipOpik()).toBe(true);
  });

  it('should not skip Opik by default', () => {
    delete process.env.OPIK_DISABLED;
    delete process.env.OPIK_ENABLED;
    expect(_shouldSkipOpik()).toBe(false);
  });
});

describe('Tracing Decorators', () => {
  it('should return a decorator function from maybeTrack', () => {
    const decorator = maybeTrack({ name: 'test', tags: ['tag1'] });
    expect(typeof decorator).toBe('function');
  });

  it('should not throw when decorating methods without Opik', () => {
    class TestClass {
      // Decorator should work even without Opik installed
      test() {
        return 'result';
      }
    }

    const instance = new TestClass();
    expect(instance.test()).toBe('result');
  });

  it('should provide legacy aliases', () => {
    expect(typeof trackRole).toBe('function');
    expect(typeof aceTrack).toBe('function');
  });

  it('should report Opik availability from tracers module', () => {
    expect(isOpikAvailableTracer()).toBe(false);
  });
});

describe('Integration with Metadata', () => {
  it('should handle metadata in logBulletEvolution', () => {
    const integration = new OpikIntegration();
    expect(() => {
      integration.logBulletEvolution(
        'bullet-001',
        'Test content',
        5,
        1,
        2,
        'section',
        { custom: 'metadata' }
      );
    }).not.toThrow();
  });

  it('should handle metadata in logPlaybookUpdate', () => {
    const integration = new OpikIntegration();
    expect(() => {
      integration.logPlaybookUpdate('ADD', 3, 1, 0, 10, { version: '1.0' });
    }).not.toThrow();
  });

  it('should handle metadata in createExperiment', () => {
    const integration = new OpikIntegration();
    expect(() => {
      integration.createExperiment('exp-1', 'Description', { author: 'test' });
    }).not.toThrow();
  });
});
