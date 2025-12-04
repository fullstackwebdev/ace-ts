/**
 * Tests for Skillbook functionality.
 */

import { Skillbook, createSkill } from '../src/skillbook';
import { createUpdateBatch } from '../src/updates';

describe('Skillbook', () => {
  let skillbook: Skillbook;

  beforeEach(() => {
    skillbook = new Skillbook();
  });

  describe('addSkill', () => {
    it('should add a new skill to the skillbook', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test content',
      });

      expect(skill).toBeDefined();
      expect(skill.section).toBe('test');
      expect(skill.content).toBe('Test content');
      expect(skillbook.skills()).toHaveLength(1);
    });

    it('should add skills with metadata', () => {
      const skill = skillbook.addSkill({
        section: 'general',
        content: 'Always be clear',
        metadata: { helpful: 5, harmful: 0 },
      });

      expect(skill.helpful).toBe(5);
      expect(skill.harmful).toBe(0);
    });

    it('should generate unique IDs for each skill', () => {
      const skill1 = skillbook.addSkill({
        section: 'test',
        content: 'Content 1',
      });
      const skill2 = skillbook.addSkill({
        section: 'test',
        content: 'Content 2',
      });

      expect(skill1.id).not.toBe(skill2.id);
    });
  });

  describe('updateSkill', () => {
    it('should update existing skill content', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Original content',
      });

      const updated = skillbook.updateSkill(skill.id, {
        content: 'Updated content',
      });

      expect(updated).toBeDefined();
      expect(updated?.content).toBe('Updated content');
    });

    it('should update skill metadata', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test',
        metadata: { helpful: 5 },
      });

      const updated = skillbook.updateSkill(skill.id, {
        metadata: { helpful: 10, harmful: 2 },
      });

      expect(updated?.helpful).toBe(10);
      expect(updated?.harmful).toBe(2);
    });

    it('should return undefined for non-existent skill', () => {
      const updated = skillbook.updateSkill('non-existent-id', {
        content: 'New content',
      });

      expect(updated).toBeUndefined();
    });
  });

  describe('tagSkill', () => {
    it('should increment helpful counter', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test',
        metadata: { helpful: 5 },
      });

      skillbook.tagSkill(skill.id, 'helpful', 2);
      const updated = skillbook.getSkill(skill.id);

      expect(updated?.helpful).toBe(7); // 5 + 2
    });

    it('should increment harmful counter', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test',
      });

      skillbook.tagSkill(skill.id, 'harmful', 3);
      const updated = skillbook.getSkill(skill.id);

      expect(updated?.harmful).toBe(3);
    });

    it('should throw error for invalid tag', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test',
      });

      expect(() => {
        skillbook.tagSkill(skill.id, 'invalid' as any, 1);
      }).toThrow();
    });

    it('should throw error for non-existent skill', () => {
      expect(() => {
        skillbook.tagSkill('non-existent-id', 'helpful', 1);
      }).toThrow();
    });
  });

  describe('removeSkill', () => {
    it('should remove skill from skillbook', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test',
      });

      skillbook.removeSkill(skill.id);

      expect(skillbook.getSkill(skill.id)).toBeUndefined();
      expect(skillbook.skills()).toHaveLength(0);
    });
  });

  describe('getSkill', () => {
    it('should retrieve existing skill by ID', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test content',
      });

      const retrieved = skillbook.getSkill(skill.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(skill.id);
      expect(retrieved?.content).toBe('Test content');
    });

    it('should return undefined for non-existent skill', () => {
      const retrieved = skillbook.getSkill('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('skills', () => {
    it('should return all skills', () => {
      skillbook.addSkill({ section: 'test1', content: 'Content 1' });
      skillbook.addSkill({ section: 'test2', content: 'Content 2' });
      skillbook.addSkill({ section: 'test3', content: 'Content 3' });

      const allSkills = skillbook.skills();

      expect(allSkills).toHaveLength(3);
    });

    it('should return empty array when no skills', () => {
      expect(skillbook.skills()).toHaveLength(0);
    });
  });

  describe('applyUpdate', () => {
    it('should apply ADD operation', () => {
      const batch = createUpdateBatch([
        {
          operation: 'ADD',
          id: 'new-skill-001',
          section: 'test',
          content: 'New skill',
        },
      ]);

      skillbook.applyUpdate(batch);

      const skill = skillbook.getSkill('new-skill-001');
      expect(skill).toBeDefined();
      expect(skill?.content).toBe('New skill');
    });

    it('should apply UPDATE operation', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Original',
      });

      const batch = createUpdateBatch([
        {
          operation: 'UPDATE',
          id: skill.id,
          content: 'Updated',
        },
      ]);

      skillbook.applyUpdate(batch);

      const updated = skillbook.getSkill(skill.id);
      expect(updated?.content).toBe('Updated');
    });

    it('should apply TAG operation', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test',
        metadata: { helpful: 5 },
      });

      const batch = createUpdateBatch([
        {
          operation: 'TAG',
          id: skill.id,
          tag: 'helpful',
          delta: 3,
        },
      ]);

      skillbook.applyUpdate(batch);

      const updated = skillbook.getSkill(skill.id);
      expect(updated?.helpful).toBe(8); // 5 + 3
    });

    it('should apply REMOVE operation', () => {
      const skill = skillbook.addSkill({
        section: 'test',
        content: 'Test',
      });

      const batch = createUpdateBatch([
        {
          operation: 'REMOVE',
          id: skill.id,
        },
      ]);

      skillbook.applyUpdate(batch);

      expect(skillbook.getSkill(skill.id)).toBeUndefined();
    });
  });

  describe('asPrompt', () => {
    it('should return JSON string representation', () => {
      skillbook.addSkill({
        section: 'test',
        content: 'Test skill',
      });

      const prompt = skillbook.asPrompt();

      expect(prompt).toContain('"section":"test"');
      expect(prompt).toContain('"content":"Test skill"');
    });

    it('should return empty array JSON for empty skillbook', () => {
      const prompt = skillbook.asPrompt();
      expect(prompt).toBe('[]');
    });
  });

  describe('stats', () => {
    it('should return correct statistics', () => {
      skillbook.addSkill({
        section: 'test1',
        content: 'Skill 1',
        metadata: { helpful: 5, harmful: 1 },
      });
      skillbook.addSkill({
        section: 'test2',
        content: 'Skill 2',
        metadata: { helpful: 3, harmful: 0 },
      });

      const stats = skillbook.stats();

      expect(stats.total).toBe(2);
      expect(stats.bySection['test1']).toBe(1);
      expect(stats.bySection['test2']).toBe(1);
      expect(stats.avgHelpful).toBe(4); // (5 + 3) / 2
      expect(stats.avgHarmful).toBe(0.5); // (1 + 0) / 2
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const skill1 = skillbook.addSkill({
        section: 'test',
        content: 'Test 1',
      });
      const skill2 = skillbook.addSkill({
        section: 'test',
        content: 'Test 2',
      });

      const json = skillbook.toJSON();

      expect(json.skills).toHaveLength(2);
      expect(json.skills[0].content).toBe('Test 1');
      expect(json.skills[1].content).toBe('Test 2');
    });
  });

  describe('fromJSON', () => {
    it('should deserialize from JSON', () => {
      const json = {
        skills: [
          {
            id: 'skill-001',
            section: 'test',
            content: 'Test skill',
            helpful: 5,
            harmful: 1,
            neutral: 0,
            metadata: {},
          },
        ],
      };

      const loaded = Skillbook.fromJSON(JSON.stringify(json));

      expect(loaded.skills()).toHaveLength(1);
      const skill = loaded.getSkill('skill-001');
      expect(skill?.content).toBe('Test skill');
      expect(skill?.helpful).toBe(5);
    });
  });
});
