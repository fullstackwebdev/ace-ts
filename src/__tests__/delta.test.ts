/**
 * Tests for delta.ts
 */

import { describe, it, expect } from 'vitest';
import { DeltaOperation, DeltaBatch } from '../delta';

describe('DeltaOperation', () => {
  it('should create an ADD operation', () => {
    const op = new DeltaOperation('ADD', 'General', 'Test bullet');
    expect(op.type).toBe('ADD');
    expect(op.section).toBe('General');
    expect(op.content).toBe('Test bullet');
  });

  it('should serialize to JSON', () => {
    const op = new DeltaOperation('ADD', 'General', 'Test bullet', null, {
      helpful: 1,
    });
    const json = op.toJson();
    expect(json.type).toBe('ADD');
    expect(json.section).toBe('General');
    expect(json.content).toBe('Test bullet');
    expect(json.metadata).toEqual({ helpful: 1 });
  });

  it('should deserialize from JSON', () => {
    const json = {
      type: 'TAG',
      section: 'General',
      bullet_id: 'general-00001',
      metadata: { helpful: 1, harmful: 0 },
    };
    const op = DeltaOperation.fromJson(json);
    expect(op.type).toBe('TAG');
    expect(op.section).toBe('General');
    expect(op.bullet_id).toBe('general-00001');
    expect(op.metadata).toEqual({ helpful: 1, harmful: 0 });
  });

  it('should filter invalid tags for TAG operations', () => {
    const json = {
      type: 'TAG',
      section: 'General',
      bullet_id: 'general-00001',
      metadata: { helpful: 1, invalid: 5 },
    };
    const op = DeltaOperation.fromJson(json);
    expect(op.metadata).toEqual({ helpful: 1 });
    expect(op.metadata.invalid).toBeUndefined();
  });
});

describe('DeltaBatch', () => {
  it('should create a batch with operations', () => {
    const ops = [
      new DeltaOperation('ADD', 'General', 'Test bullet 1'),
      new DeltaOperation('ADD', 'Strategies', 'Test bullet 2'),
    ];
    const batch = new DeltaBatch('Adding new bullets', ops);
    expect(batch.reasoning).toBe('Adding new bullets');
    expect(batch.operations).toHaveLength(2);
  });

  it('should serialize and deserialize correctly', () => {
    const batch = new DeltaBatch('Test reasoning', [
      new DeltaOperation('ADD', 'General', 'Bullet 1'),
      new DeltaOperation('TAG', 'General', null, 'general-00001', { helpful: 1 }),
    ]);

    const json = batch.toJson();
    const restored = DeltaBatch.fromJson(json);

    expect(restored.reasoning).toBe('Test reasoning');
    expect(restored.operations).toHaveLength(2);
    expect(restored.operations[0].type).toBe('ADD');
    expect(restored.operations[1].type).toBe('TAG');
  });
});
