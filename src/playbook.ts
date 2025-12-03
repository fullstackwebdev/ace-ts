/**
 * Playbook storage and mutation logic for ACE.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { DeltaBatch, DeltaOperation } from './delta.js';

/**
 * Valid bullet status values
 */
export type BulletStatus = 'active' | 'invalid';

/**
 * Record of a Curator decision to KEEP two bullets separate
 */
export interface SimilarityDecision {
  decision: 'KEEP';
  reasoning: string;
  decided_at: string;
  similarity_at_decision: number;
}

/**
 * Single playbook entry
 */
export class Bullet {
  public id: string;
  public section: string;
  public content: string;
  public helpful: number;
  public harmful: number;
  public neutral: number;
  public created_at: string;
  public updated_at: string;
  public embedding: number[] | null;
  public status: BulletStatus;

  constructor(
    id: string,
    section: string,
    content: string,
    helpful: number = 0,
    harmful: number = 0,
    neutral: number = 0,
    created_at?: string,
    updated_at?: string,
    embedding: number[] | null = null,
    status: BulletStatus = 'active'
  ) {
    this.id = id;
    this.section = section;
    this.content = content;
    this.helpful = helpful;
    this.harmful = harmful;
    this.neutral = neutral;
    this.created_at = created_at || new Date().toISOString();
    this.updated_at = updated_at || new Date().toISOString();
    this.embedding = embedding;
    this.status = status;
  }

  /**
   * Apply metadata updates to the bullet
   */
  applyMetadata(metadata: Record<string, number>): void {
    for (const [key, value] of Object.entries(metadata)) {
      if (key in this && typeof (this as any)[key] === 'number') {
        (this as any)[key] = Math.floor(value);
      }
    }
  }

  /**
   * Increment a tag counter
   */
  tag(tag: string, increment: number = 1): void {
    if (!['helpful', 'harmful', 'neutral'].includes(tag)) {
      throw new Error(`Unsupported tag: ${tag}`);
    }
    (this as any)[tag] += increment;
    this.updated_at = new Date().toISOString();
  }

  /**
   * Return dictionary with only LLM-relevant fields.
   * Excludes created_at and updated_at which are internal metadata
   * not useful for LLM strategy selection.
   */
  toLLMDict(): Record<string, unknown> {
    return {
      id: this.id,
      section: this.section,
      content: this.content,
      helpful: this.helpful,
      harmful: this.harmful,
      neutral: this.neutral,
    };
  }

  /**
   * Convert bullet to plain object for serialization
   */
  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      section: this.section,
      content: this.content,
      helpful: this.helpful,
      harmful: this.harmful,
      neutral: this.neutral,
      created_at: this.created_at,
      updated_at: this.updated_at,
      embedding: this.embedding,
      status: this.status,
    };
  }

  /**
   * Create bullet from plain object
   */
  static fromDict(data: Record<string, unknown>): Bullet {
    return new Bullet(
      String(data.id),
      String(data.section),
      String(data.content),
      Number(data.helpful || 0),
      Number(data.harmful || 0),
      Number(data.neutral || 0),
      data.created_at ? String(data.created_at) : undefined,
      data.updated_at ? String(data.updated_at) : undefined,
      Array.isArray(data.embedding) ? data.embedding.map(Number) : null,
      (data.status as BulletStatus) || 'active'
    );
  }
}

/**
 * Helper class to create Set-like keys for similarity decision pairs
 */
class PairKey {
  private _key: string;

  constructor(id1: string, id2: string) {
    // Sort IDs to ensure consistent key regardless of order
    this._key = [id1, id2].sort().join(',');
  }

  toString(): string {
    return this._key;
  }

  static fromString(key: string): [string, string] {
    const parts = key.split(',');
    return [parts[0], parts[1]];
  }
}

/**
 * Structured context store as defined by ACE
 */
export class Playbook {
  private _bullets: Map<string, Bullet>;
  private _sections: Map<string, string[]>;
  private _next_id: number;
  private _similarity_decisions: Map<string, SimilarityDecision>;

  constructor() {
    this._bullets = new Map();
    this._sections = new Map();
    this._next_id = 0;
    this._similarity_decisions = new Map();
  }

  /**
   * Concise representation for debugging and object inspection
   */
  toString(): string {
    if (this._bullets.size === 0) {
      return 'Playbook(empty)';
    }
    return this._asMarkdownDebug();
  }

  /**
   * Human-readable representation showing actual playbook content
   */
  inspect(): string {
    return `Playbook(bullets=${this._bullets.size}, sections=[${Array.from(
      this._sections.keys()
    ).join(', ')}])`;
  }

  // ------------------------------------------------------------------ //
  // CRUD utils
  // ------------------------------------------------------------------ //

  /**
   * Add a new bullet to the playbook
   */
  addBullet(
    section: string,
    content: string,
    bulletId?: string,
    metadata?: Record<string, number>
  ): Bullet {
    const id = bulletId || this._generateId(section);
    const bullet = new Bullet(id, section, content);

    if (metadata) {
      bullet.applyMetadata(metadata);
    }

    this._bullets.set(id, bullet);

    if (!this._sections.has(section)) {
      this._sections.set(section, []);
    }
    this._sections.get(section)!.push(id);

    return bullet;
  }

  /**
   * Update an existing bullet
   */
  updateBullet(
    bulletId: string,
    options: {
      content?: string;
      metadata?: Record<string, number>;
    } = {}
  ): Bullet | null {
    const bullet = this._bullets.get(bulletId);
    if (!bullet) {
      return null;
    }

    if (options.content !== undefined) {
      bullet.content = options.content;
    }

    if (options.metadata) {
      bullet.applyMetadata(options.metadata);
    }

    bullet.updated_at = new Date().toISOString();
    return bullet;
  }

  /**
   * Tag a bullet with helpful/harmful/neutral
   */
  tagBullet(bulletId: string, tag: string, increment: number = 1): Bullet | null {
    const bullet = this._bullets.get(bulletId);
    if (!bullet) {
      return null;
    }

    bullet.tag(tag, increment);
    return bullet;
  }

  /**
   * Remove a bullet from the playbook
   */
  removeBullet(bulletId: string, soft: boolean = false): void {
    const bullet = this._bullets.get(bulletId);
    if (!bullet) {
      return;
    }

    if (soft) {
      // Soft delete: mark as invalid but keep in storage
      bullet.status = 'invalid';
      bullet.updated_at = new Date().toISOString();
    } else {
      // Hard delete: remove entirely
      this._bullets.delete(bulletId);

      const sectionList = this._sections.get(bullet.section);
      if (sectionList) {
        const filtered = sectionList.filter((bid) => bid !== bulletId);
        if (filtered.length > 0) {
          this._sections.set(bullet.section, filtered);
        } else {
          this._sections.delete(bullet.section);
        }
      }
    }
  }

  /**
   * Get a bullet by ID
   */
  getBullet(bulletId: string): Bullet | null {
    return this._bullets.get(bulletId) || null;
  }

  /**
   * Get all bullets in the playbook
   */
  bullets(includeInvalid: boolean = false): Bullet[] {
    const allBullets = Array.from(this._bullets.values());
    if (includeInvalid) {
      return allBullets;
    }
    return allBullets.filter((b) => b.status === 'active');
  }

  // ------------------------------------------------------------------ //
  // Similarity decisions (for deduplication)
  // ------------------------------------------------------------------ //

  /**
   * Get a prior similarity decision for a pair of bullets
   */
  getSimilarityDecision(bulletIdA: string, bulletIdB: string): SimilarityDecision | null {
    const key = new PairKey(bulletIdA, bulletIdB).toString();
    return this._similarity_decisions.get(key) || null;
  }

  /**
   * Store a similarity decision for a pair of bullets
   */
  setSimilarityDecision(
    bulletIdA: string,
    bulletIdB: string,
    decision: SimilarityDecision
  ): void {
    const key = new PairKey(bulletIdA, bulletIdB).toString();
    this._similarity_decisions.set(key, decision);
  }

  /**
   * Check if there's a KEEP decision for this pair
   */
  hasKeepDecision(bulletIdA: string, bulletIdB: string): boolean {
    const decision = this.getSimilarityDecision(bulletIdA, bulletIdB);
    return decision !== null && decision.decision === 'KEEP';
  }

  // ------------------------------------------------------------------ //
  // Serialization
  // ------------------------------------------------------------------ //

  /**
   * Convert playbook to plain object
   */
  toDict(): Record<string, unknown> {
    const bullets: Record<string, unknown> = {};
    for (const [id, bullet] of this._bullets) {
      bullets[id] = bullet.toDict();
    }

    const sections: Record<string, string[]> = {};
    for (const [section, ids] of this._sections) {
      sections[section] = ids;
    }

    const similarityDecisions: Record<string, SimilarityDecision> = {};
    for (const [key, decision] of this._similarity_decisions) {
      similarityDecisions[key] = decision;
    }

    return {
      bullets,
      sections,
      next_id: this._next_id,
      similarity_decisions: similarityDecisions,
    };
  }

  /**
   * Create playbook from plain object
   */
  static fromDict(payload: Record<string, unknown>): Playbook {
    const instance = new Playbook();

    const bulletsPayload = payload.bullets as Record<string, unknown> | undefined;
    if (bulletsPayload) {
      for (const [bulletId, bulletValue] of Object.entries(bulletsPayload)) {
        if (typeof bulletValue === 'object' && bulletValue !== null) {
          const bulletData = bulletValue as Record<string, unknown>;
          // Handle new optional fields with defaults for backwards compatibility
          if (!('embedding' in bulletData)) {
            bulletData.embedding = null;
          }
          if (!('status' in bulletData)) {
            bulletData.status = 'active';
          }
          instance._bullets.set(bulletId, Bullet.fromDict(bulletData));
        }
      }
    }

    const sectionsPayload = payload.sections as Record<string, unknown> | undefined;
    if (sectionsPayload) {
      for (const [section, ids] of Object.entries(sectionsPayload)) {
        if (Array.isArray(ids)) {
          instance._sections.set(section, ids);
        }
      }
    }

    const nextIdValue = payload.next_id;
    instance._next_id =
      nextIdValue !== null && nextIdValue !== undefined ? Number(nextIdValue) : 0;

    // Deserialize similarity decisions
    const similarityPayload = payload.similarity_decisions as
      | Record<string, unknown>
      | undefined;
    if (similarityPayload) {
      for (const [key, decisionValue] of Object.entries(similarityPayload)) {
        if (typeof decisionValue === 'object' && decisionValue !== null) {
          instance._similarity_decisions.set(
            key,
            decisionValue as SimilarityDecision
          );
        }
      }
    }

    return instance;
  }

  /**
   * Serialize playbook to JSON string
   */
  dumps(): string {
    return JSON.stringify(this.toDict(), null, 2);
  }

  /**
   * Deserialize playbook from JSON string
   */
  static loads(data: string): Playbook {
    const payload = JSON.parse(data);
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Playbook serialization must be a JSON object.');
    }
    return Playbook.fromDict(payload as Record<string, unknown>);
  }

  /**
   * Save playbook to a JSON file
   */
  saveToFile(path: string): void {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, this.dumps(), 'utf-8');
  }

  /**
   * Load playbook from a JSON file
   */
  static loadFromFile(path: string): Playbook {
    const data = readFileSync(path, 'utf-8');
    return Playbook.loads(data);
  }

  // ------------------------------------------------------------------ //
  // Delta application
  // ------------------------------------------------------------------ //

  /**
   * Apply a delta batch to the playbook
   */
  applyDelta(delta: DeltaBatch): void {
    for (const operation of delta.operations) {
      this._applyOperation(operation);
    }
  }

  private _applyOperation(operation: DeltaOperation): void {
    const opType = operation.type.toUpperCase();

    if (opType === 'ADD') {
      this.addBullet(
        operation.section,
        operation.content || '',
        operation.bullet_id || undefined,
        operation.metadata
      );
    } else if (opType === 'UPDATE') {
      if (operation.bullet_id === null) {
        return;
      }
      this.updateBullet(operation.bullet_id, {
        content: operation.content || undefined,
        metadata: operation.metadata,
      });
    } else if (opType === 'TAG') {
      if (operation.bullet_id === null) {
        return;
      }
      // Only apply valid tag names as defensive measure
      const validTags = new Set(['helpful', 'harmful', 'neutral']);
      for (const [tag, increment] of Object.entries(operation.metadata)) {
        if (validTags.has(tag)) {
          this.tagBullet(operation.bullet_id, tag, increment);
        }
      }
    } else if (opType === 'REMOVE') {
      if (operation.bullet_id === null) {
        return;
      }
      this.removeBullet(operation.bullet_id);
    }
  }

  // ------------------------------------------------------------------ //
  // Presentation helpers
  // ------------------------------------------------------------------ //

  /**
   * Return TOON-encoded playbook for LLM prompts.
   *
   * NOTE: This requires the optional 'toon' package to be installed.
   * For now, returns markdown format as fallback.
   */
  asPrompt(): string {
    // TODO: Implement TOON encoding when TypeScript TOON library is available
    // For now, use JSON format which is still more compact than markdown
    const bulletsData = this.bullets().map((b) => b.toLLMDict());
    return JSON.stringify({ bullets: bulletsData });
  }

  /**
   * Human-readable markdown format for debugging/inspection only.
   */
  private _asMarkdownDebug(): string {
    const parts: string[] = [];

    const sortedSections = Array.from(this._sections.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    for (const [section, bulletIds] of sortedSections) {
      parts.push(`## ${section}`);
      for (const bulletId of bulletIds) {
        const bullet = this._bullets.get(bulletId);
        if (bullet) {
          const counters = `(helpful=${bullet.helpful}, harmful=${bullet.harmful}, neutral=${bullet.neutral})`;
          parts.push(`- [${bullet.id}] ${bullet.content} ${counters}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * Get playbook statistics
   */
  stats(): Record<string, unknown> {
    const bullets = Array.from(this._bullets.values());
    return {
      sections: this._sections.size,
      bullets: this._bullets.size,
      tags: {
        helpful: bullets.reduce((sum, b) => sum + b.helpful, 0),
        harmful: bullets.reduce((sum, b) => sum + b.harmful, 0),
        neutral: bullets.reduce((sum, b) => sum + b.neutral, 0),
      },
    };
  }

  // ------------------------------------------------------------------ //
  // Internal helpers
  // ------------------------------------------------------------------ //

  private _generateId(section: string): string {
    this._next_id += 1;
    const sectionPrefix = section.split(' ')[0].toLowerCase();
    return `${sectionPrefix}-${String(this._next_id).padStart(5, '0')}`;
  }
}
