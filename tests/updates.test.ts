/**
 * Unit tests for UpdateOperation and UpdateBatch.
 */

import {
  createUpdateOperation,
  updateOperationFromJSON,
  updateOperationToJSON,
  createUpdateBatch,
  updateBatchFromJSON,
  updateBatchToJSON,
} from '../src/updates';

describe('UpdateOperation', () => {
  describe('createUpdateOperation', () => {
    test('creates ADD operation', () => {
      const op = createUpdateOperation({
        type: 'ADD',
        section: 'math',
        content: 'Show your work',
      });

      expect(op.type).toBe('ADD');
      expect(op.section).toBe('math');
      expect(op.content).toBe('Show your work');
      expect(op.skill_id).toBeUndefined();
    });

    test('creates TAG operation', () => {
      const op = createUpdateOperation({
        type: 'TAG',
        section: 'general',
        skill_id: 'skill_123',
        metadata: { helpful: 1 },
      });

      expect(op.type).toBe('TAG');
      expect(op.skill_id).toBe('skill_123');
      expect(op.metadata?.helpful).toBe(1);
    });

    test('creates UPDATE operation', () => {
      const op = createUpdateOperation({
        type: 'UPDATE',
        section: 'general',
        skill_id: 'skill_123',
        content: 'Updated content',
      });

      expect(op.type).toBe('UPDATE');
      expect(op.skill_id).toBe('skill_123');
      expect(op.content).toBe('Updated content');
    });

    test('creates REMOVE operation', () => {
      const op = createUpdateOperation({
        type: 'REMOVE',
        section: 'general',
        skill_id: 'skill_123',
      });

      expect(op.type).toBe('REMOVE');
      expect(op.skill_id).toBe('skill_123');
    });
  });

  describe('updateOperationFromJSON', () => {
    test('parses ADD operation from JSON', () => {
      const payload = { type: 'ADD', section: 'math', content: 'Test content' };
      const op = updateOperationFromJSON(payload);

      expect(op.type).toBe('ADD');
      expect(op.section).toBe('math');
      expect(op.content).toBe('Test content');
    });

    test('parses TAG operation from JSON', () => {
      const payload = {
        type: 'TAG',
        section: 'general',
        skill_id: 'skill_123',
        metadata: { helpful: 1, harmful: 0 },
      };
      const op = updateOperationFromJSON(payload);

      expect(op.type).toBe('TAG');
      expect(op.skill_id).toBe('skill_123');
      expect(op.metadata?.helpful).toBe(1);
      expect(op.metadata?.harmful).toBe(0);
    });

    test('TAG operation filters invalid metadata keys', () => {
      const payload = {
        type: 'TAG',
        section: 'general',
        skill_id: 'skill_123',
        metadata: {
          helpful: 1,
          invalid_key: 5, // Should be filtered out
          harmful: 2,
        },
      };
      const op = updateOperationFromJSON(payload);

      expect(op.metadata).toHaveProperty('helpful');
      expect(op.metadata).toHaveProperty('harmful');
      expect(op.metadata).not.toHaveProperty('invalid_key');
    });

    test('parsing invalid operation type throws error', () => {
      const payload = { type: 'INVALID', section: 'general' };

      expect(() => updateOperationFromJSON(payload)).toThrow('Invalid operation type');
    });

    test('operation type is case-insensitive', () => {
      const payload = { type: 'add', section: 'general', content: 'Test' };
      const op = updateOperationFromJSON(payload);

      expect(op.type).toBe('ADD'); // Should be uppercased
    });
  });

  describe('updateOperationToJSON', () => {
    test('serializes ADD operation to JSON', () => {
      const op = createUpdateOperation({
        type: 'ADD',
        section: 'math',
        content: 'Test content',
      });
      const jsonData = updateOperationToJSON(op);

      expect(jsonData.type).toBe('ADD');
      expect(jsonData.section).toBe('math');
      expect(jsonData.content).toBe('Test content');
      expect(jsonData.skill_id).toBeUndefined(); // Should not include undefined fields
    });

    test('serializes TAG operation to JSON', () => {
      const op = createUpdateOperation({
        type: 'TAG',
        section: 'general',
        skill_id: 'skill_123',
        metadata: { helpful: 1 },
      });
      const jsonData = updateOperationToJSON(op);

      expect(jsonData.type).toBe('TAG');
      expect(jsonData.skill_id).toBe('skill_123');
      expect(jsonData.metadata).toEqual({ helpful: 1 });
    });

    test('serializes REMOVE operation to JSON', () => {
      const op = createUpdateOperation({
        type: 'REMOVE',
        section: 'general',
        skill_id: 'skill_123',
      });
      const jsonData = updateOperationToJSON(op);

      expect(jsonData.type).toBe('REMOVE');
      expect(jsonData.skill_id).toBe('skill_123');
      expect(jsonData.content).toBeUndefined();
    });
  });

  describe('JSON roundtrip', () => {
    test('operation survives JSON serialization round-trip', () => {
      const original = createUpdateOperation({
        type: 'UPDATE',
        section: 'general',
        skill_id: 'skill_123',
        content: 'Updated',
        metadata: { helpful: 2 },
      });

      const jsonData = updateOperationToJSON(original);
      const restored = updateOperationFromJSON(jsonData);

      expect(original.type).toBe(restored.type);
      expect(original.section).toBe(restored.section);
      expect(original.content).toBe(restored.content);
      expect(original.skill_id).toBe(restored.skill_id);
      expect(original.metadata).toEqual(restored.metadata);
    });
  });
});

describe('UpdateBatch', () => {
  describe('createUpdateBatch', () => {
    test('creates empty batch', () => {
      const batch = createUpdateBatch({ reasoning: 'No changes needed' });

      expect(batch.reasoning).toBe('No changes needed');
      expect(batch.operations).toHaveLength(0);
    });

    test('creates batch with operations', () => {
      const ops = [
        createUpdateOperation({
          type: 'ADD',
          section: 'math',
          content: 'New strategy',
        }),
        createUpdateOperation({
          type: 'TAG',
          section: 'general',
          skill_id: 'b1',
          metadata: { helpful: 1 },
        }),
      ];
      const batch = createUpdateBatch({
        reasoning: 'Multiple updates',
        operations: ops,
      });

      expect(batch.operations).toHaveLength(2);
      expect(batch.operations[0].type).toBe('ADD');
      expect(batch.operations[1].type).toBe('TAG');
    });
  });

  describe('updateBatchFromJSON', () => {
    test('parses empty batch from JSON', () => {
      const payload = { reasoning: 'No changes', operations: [] };
      const batch = updateBatchFromJSON(payload);

      expect(batch.reasoning).toBe('No changes');
      expect(batch.operations).toHaveLength(0);
    });

    test('parses batch with operations from JSON', () => {
      const payload = {
        reasoning: 'Add new strategies',
        operations: [
          { type: 'ADD', section: 'math', content: 'Strategy 1' },
          { type: 'ADD', section: 'general', content: 'Strategy 2' },
        ],
      };
      const batch = updateBatchFromJSON(payload);

      expect(batch.reasoning).toBe('Add new strategies');
      expect(batch.operations).toHaveLength(2);
      expect(batch.operations[0].content).toBe('Strategy 1');
      expect(batch.operations[1].content).toBe('Strategy 2');
    });

    test('parses batch with missing reasoning', () => {
      const payload = { operations: [] };
      const batch = updateBatchFromJSON(payload);

      expect(batch.reasoning).toBe(''); // Should default to empty string
    });

    test('parses batch with invalid operations (should skip)', () => {
      const payload = {
        reasoning: 'Test',
        operations: [
          { type: 'ADD', section: 'math', content: 'Valid' },
          'invalid_operation', // Not a dict, should be skipped
          { type: 'ADD', section: 'general', content: 'Also valid' },
        ],
      };
      const batch = updateBatchFromJSON(payload);

      expect(batch.operations).toHaveLength(2); // Only valid ones
      expect(batch.operations[0].content).toBe('Valid');
      expect(batch.operations[1].content).toBe('Also valid');
    });
  });

  describe('updateBatchToJSON', () => {
    test('serializes empty batch to JSON', () => {
      const batch = createUpdateBatch({ reasoning: 'No changes' });
      const jsonData = updateBatchToJSON(batch);

      expect(jsonData.reasoning).toBe('No changes');
      expect(jsonData.operations).toEqual([]);
    });

    test('serializes batch with operations to JSON', () => {
      const ops = [
        createUpdateOperation({
          type: 'ADD',
          section: 'math',
          content: 'Strategy',
        }),
        createUpdateOperation({
          type: 'TAG',
          section: 'general',
          skill_id: 'b1',
          metadata: { helpful: 1 },
        }),
      ];
      const batch = createUpdateBatch({
        reasoning: 'Updates',
        operations: ops,
      });
      const jsonData = updateBatchToJSON(batch);

      expect(jsonData.reasoning).toBe('Updates');
      expect(jsonData.operations).toHaveLength(2);
      expect(jsonData.operations[0].type).toBe('ADD');
      expect(jsonData.operations[1].type).toBe('TAG');
    });
  });

  describe('JSON roundtrip', () => {
    test('batch survives JSON serialization round-trip', () => {
      const originalOps = [
        createUpdateOperation({
          type: 'ADD',
          section: 'math',
          content: 'New',
        }),
        createUpdateOperation({
          type: 'REMOVE',
          section: 'old',
          skill_id: 'b1',
        }),
      ];
      const original = createUpdateBatch({
        reasoning: 'Test reasoning',
        operations: originalOps,
      });

      const jsonData = updateBatchToJSON(original);
      const restored = updateBatchFromJSON(jsonData);

      expect(original.reasoning).toBe(restored.reasoning);
      expect(original.operations).toHaveLength(restored.operations.length);

      for (let i = 0; i < original.operations.length; i++) {
        const origOp = original.operations[i];
        const restOp = restored.operations[i];
        expect(origOp.type).toBe(restOp.type);
        expect(origOp.section).toBe(restOp.section);
        expect(origOp.content).toBe(restOp.content);
        expect(origOp.skill_id).toBe(restOp.skill_id);
      }
    });
  });
});
