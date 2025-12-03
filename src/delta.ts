/**
 * Delta operations produced by the ACE Curator.
 */

/**
 * Valid operation types for delta mutations
 */
export type OperationType = 'ADD' | 'UPDATE' | 'TAG' | 'REMOVE';

/**
 * Single mutation to apply to the playbook
 */
export class DeltaOperation {
  constructor(
    public readonly type: OperationType,
    public readonly section: string,
    public readonly content: string | null = null,
    public readonly bullet_id: string | null = null,
    public readonly metadata: Record<string, number> = {}
  ) {}

  /**
   * Create a DeltaOperation from a JSON object
   */
  static fromJson(payload: Record<string, unknown>): DeltaOperation {
    // Filter metadata for TAG operations to only include valid tags
    let metadata = (payload.metadata as Record<string, number>) || {};

    if (String(payload.type).toUpperCase() === 'TAG') {
      // Only include valid tag names for TAG operations
      const validTags = new Set(['helpful', 'harmful', 'neutral']);
      metadata = Object.fromEntries(
        Object.entries(metadata).filter(([key]) => validTags.has(key))
      );
    }

    const opType = String(payload.type).toUpperCase();
    if (!['ADD', 'UPDATE', 'TAG', 'REMOVE'].includes(opType)) {
      throw new Error(`Invalid operation type: ${opType}`);
    }

    return new DeltaOperation(
      opType as OperationType,
      String(payload.section || ''),
      payload.content !== null && payload.content !== undefined
        ? String(payload.content)
        : null,
      payload.bullet_id !== null && payload.bullet_id !== undefined
        ? String(payload.bullet_id)
        : null,
      metadata
    );
  }

  /**
   * Convert the operation to a JSON object
   */
  toJson(): Record<string, unknown> {
    const data: Record<string, unknown> = {
      type: this.type,
      section: this.section,
    };

    if (this.content !== null) {
      data.content = this.content;
    }

    if (this.bullet_id !== null) {
      data.bullet_id = this.bullet_id;
    }

    if (Object.keys(this.metadata).length > 0) {
      data.metadata = this.metadata;
    }

    return data;
  }
}

/**
 * Bundle of curator reasoning and operations
 */
export class DeltaBatch {
  constructor(
    public readonly reasoning: string,
    public readonly operations: DeltaOperation[] = []
  ) {}

  /**
   * Create a DeltaBatch from a JSON object
   */
  static fromJson(payload: Record<string, unknown>): DeltaBatch {
    const operations: DeltaOperation[] = [];
    const opsPayload = payload.operations;

    if (Array.isArray(opsPayload)) {
      for (const item of opsPayload) {
        if (typeof item === 'object' && item !== null) {
          operations.push(DeltaOperation.fromJson(item as Record<string, unknown>));
        }
      }
    }

    return new DeltaBatch(String(payload.reasoning || ''), operations);
  }

  /**
   * Convert the batch to a JSON object
   */
  toJson(): Record<string, unknown> {
    return {
      reasoning: this.reasoning,
      operations: this.operations.map((op) => op.toJson()),
    };
  }
}
