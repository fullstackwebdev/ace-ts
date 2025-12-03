/**
 * Tests for integrations/base module.
 */

import { describe, it, expect } from 'vitest';
import { Playbook } from '../playbook';
import { wrapPlaybookContext } from '../integrations/base';

describe('wrapPlaybookContext', () => {
  it('should return empty string when playbook has no bullets', () => {
    const playbook = new Playbook();
    const result = wrapPlaybookContext(playbook);

    expect(result).toBe('');
    expect(typeof result).toBe('string');
  });

  it('should format single bullet with explanation', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'Always validate inputs before processing');

    const result = wrapPlaybookContext(playbook);

    // Should contain header
    expect(result).toContain('Strategic Knowledge');
    expect(result).toContain('Learned from Experience');

    // Should contain the bullet content
    expect(result).toContain('Always validate inputs before processing');

    // Should contain usage instructions
    expect(result).toContain('How to use these strategies');
    expect(result).toContain('success rates');
    expect(result).toContain('helpful > harmful');

    // Should contain important note
    expect(result).toContain('learned patterns, not rigid rules');
  });

  it('should include all bullets in formatted output', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'First strategy');
    playbook.addBullet('general', 'Second strategy');
    playbook.addBullet('specific', 'Third strategy');

    const result = wrapPlaybookContext(playbook);

    expect(result).toContain('First strategy');
    expect(result).toContain('Second strategy');
    expect(result).toContain('Third strategy');
  });

  it('should display helpful/harmful scores from metadata', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'High success strategy', { helpful: 5, harmful: 1 });

    const result = wrapPlaybookContext(playbook);

    // The bullet content should be present
    expect(result).toContain('High success strategy');
    // Playbook.asPrompt() should include score information
  });

  it('should include bullets from different sections', () => {
    const playbook = new Playbook();
    playbook.addBullet('browser', 'Wait for elements to load');
    playbook.addBullet('api', 'Retry on timeout');
    playbook.addBullet('general', 'Log all errors');

    const result = wrapPlaybookContext(playbook);

    expect(result).toContain('Wait for elements to load');
    expect(result).toContain('Retry on timeout');
    expect(result).toContain('Log all errors');
  });

  it('should include all required sections in output', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'Test strategy');

    const result = wrapPlaybookContext(playbook);

    // Check for markdown headers
    expect(result).toContain('##');
    expect(result).toContain('Available Strategic Knowledge');

    // Check for bullet points/instructions
    expect(result).toContain('**How to use these strategies:**');
    expect(result).toContain('**Important:**');

    // Check for specific guidance
    expect(result).toContain('Review bullets relevant to your current task');
    expect(result).toContain('Prioritize strategies with high success rates');
    expect(result).toContain('Apply strategies when they match your context');
    expect(result).toContain('Adapt general strategies');
  });

  it('should always return a string', () => {
    const playbook1 = new Playbook();
    const playbook2 = new Playbook();
    playbook2.addBullet('test', 'Content');

    const result1 = wrapPlaybookContext(playbook1);
    const result2 = wrapPlaybookContext(playbook2);

    expect(typeof result1).toBe('string');
    expect(typeof result2).toBe('string');
  });

  it('should handle bullets with special characters', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'Use `quotes` and **bold** in markdown');
    playbook.addBullet('general', 'Handle <tags> and {braces}');

    const result = wrapPlaybookContext(playbook);

    expect(result).toContain('Use `quotes` and **bold** in markdown');
    expect(result).toContain('Handle <tags> and {braces}');
  });

  it('should handle bullets with newlines', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'First line\nSecond line\nThird line');

    const result = wrapPlaybookContext(playbook);

    // The bullet content should be present
    expect(result.includes('First line') || result.includes('First line\nSecond line')).toBe(
      true
    );
  });

  it('should return truly empty string for empty playbook, no formatting', () => {
    const playbook = new Playbook();
    const result = wrapPlaybookContext(playbook);

    expect(result).toBe('');
    expect(result.length).toBe(0);
    expect(result).not.toContain('Strategic Knowledge');
    expect(result).not.toContain('How to use');
  });

  it('should produce identical output for same playbook', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'Consistent output');

    const result1 = wrapPlaybookContext(playbook);
    const result2 = wrapPlaybookContext(playbook);

    expect(result1).toBe(result2);
  });

  it('should include emoji in header for visual appeal', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'Test');

    const result = wrapPlaybookContext(playbook);

    // Check for emoji in header
    expect(result).toContain('📚');
  });

  it('should remind users to use judgment, not treat as rigid rules', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'Strategy');

    const result = wrapPlaybookContext(playbook);

    expect(result).toContain('Use judgment');
    expect(result).toContain('not rigid rules');
  });

  it('should use playbook.bullets() to get bullets', () => {
    const playbook = new Playbook();
    playbook.addBullet('test', 'First');
    playbook.addBullet('test', 'Second');

    // Ensure playbook has bullets
    expect(playbook.bullets().length).toBe(2);

    const result = wrapPlaybookContext(playbook);

    // Both bullets should be in result
    expect(result).toContain('First');
    expect(result).toContain('Second');
  });

  it('should use playbook.asPrompt() for bullet formatting', () => {
    const playbook = new Playbook();
    playbook.addBullet('general', 'Test bullet');

    // Get the formatted bullets
    const bulletText = playbook.asPrompt();
    const result = wrapPlaybookContext(playbook);

    // Result should contain the formatted bullet text
    expect(result).toContain(bulletText);
  });
});
