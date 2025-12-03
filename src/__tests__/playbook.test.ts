/**
 * Tests for playbook.ts
 */

import { describe, it, expect } from 'vitest';
import { Playbook, Bullet } from '../playbook';
import { DeltaOperation, DeltaBatch } from '../delta';

describe('Bullet', () => {
  it('should create a bullet with defaults', () => {
    const bullet = new Bullet('b1', 'General', 'Test content');
    expect(bullet.id).toBe('b1');
    expect(bullet.section).toBe('General');
    expect(bullet.content).toBe('Test content');
    expect(bullet.helpful).toBe(0);
    expect(bullet.harmful).toBe(0);
    expect(bullet.neutral).toBe(0);
    expect(bullet.status).toBe('active');
  });

  it('should tag a bullet', () => {
    const bullet = new Bullet('b1', 'General', 'Test');
    bullet.tag('helpful');
    expect(bullet.helpful).toBe(1);
    bullet.tag('helpful', 2);
    expect(bullet.helpful).toBe(3);
  });

  it('should throw on invalid tag', () => {
    const bullet = new Bullet('b1', 'General', 'Test');
    expect(() => bullet.tag('invalid')).toThrow('Unsupported tag');
  });
});

describe('Playbook', () => {
  it('should start empty', () => {
    const playbook = new Playbook();
    expect(playbook.bullets()).toHaveLength(0);
  });

  it('should add bullets', () => {
    const playbook = new Playbook();
    const bullet = playbook.addBullet('General', 'Always verify inputs');
    expect(bullet.section).toBe('General');
    expect(bullet.content).toBe('Always verify inputs');
    expect(playbook.bullets()).toHaveLength(1);
  });

  it('should generate IDs automatically', () => {
    const playbook = new Playbook();
    const b1 = playbook.addBullet('General', 'Bullet 1');
    const b2 = playbook.addBullet('Strategies', 'Bullet 2');
    expect(b1.id).toMatch(/^general-\d{5}$/);
    expect(b2.id).toMatch(/^strategies-\d{5}$/);
  });

  it('should update bullets', () => {
    const playbook = new Playbook();
    const bullet = playbook.addBullet('General', 'Original');
    const updated = playbook.updateBullet(bullet.id, { content: 'Updated' });
    expect(updated?.content).toBe('Updated');
    expect(playbook.getBullet(bullet.id)?.content).toBe('Updated');
  });

  it('should tag bullets', () => {
    const playbook = new Playbook();
    const bullet = playbook.addBullet('General', 'Test');
    playbook.tagBullet(bullet.id, 'helpful', 2);
    expect(playbook.getBullet(bullet.id)?.helpful).toBe(2);
  });

  it('should remove bullets (hard delete)', () => {
    const playbook = new Playbook();
    const bullet = playbook.addBullet('General', 'Test');
    playbook.removeBullet(bullet.id, false);
    expect(playbook.bullets()).toHaveLength(0);
    expect(playbook.getBullet(bullet.id)).toBeNull();
  });

  it('should soft delete bullets', () => {
    const playbook = new Playbook();
    const bullet = playbook.addBullet('General', 'Test');
    playbook.removeBullet(bullet.id, true);
    expect(playbook.bullets()).toHaveLength(0); // Excluded by default
    expect(playbook.bullets(true)).toHaveLength(1); // Included when requested
    expect(playbook.getBullet(bullet.id)?.status).toBe('invalid');
  });

  it('should apply delta operations', () => {
    const playbook = new Playbook();
    const delta = new DeltaBatch('Test', [
      new DeltaOperation('ADD', 'General', 'Bullet 1'),
      new DeltaOperation('ADD', 'General', 'Bullet 2'),
    ]);
    playbook.applyDelta(delta);
    expect(playbook.bullets()).toHaveLength(2);
  });

  it('should serialize and deserialize', () => {
    const playbook = new Playbook();
    playbook.addBullet('General', 'Bullet 1');
    playbook.addBullet('Strategies', 'Bullet 2');

    const json = playbook.dumps();
    const restored = Playbook.loads(json);

    expect(restored.bullets()).toHaveLength(2);
    expect(restored.stats()).toEqual(playbook.stats());
  });
});
