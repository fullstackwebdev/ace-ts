/**
 * Prompts and report generation for bullet deduplication.
 */

import type { Bullet } from "../playbook";

const SIMILARITY_REPORT_HEADER = `
## Similar Bullets Detected

The following bullet pairs have high semantic similarity and may need consolidation.
For each pair, you can decide to:
- **MERGE**: Combine into a single improved bullet (provide merged_content and keep_id)
- **DELETE**: Remove one as redundant (specify bullet_id to delete)
- **KEEP**: Keep both separate if they serve different purposes (explain differentiation)
- **UPDATE**: Refine one bullet's content to clarify the difference (provide new_content)

`;

const PAIR_TEMPLATE = `### Pair {index}: {similarity} similar
**Bullet A** [{id_a}] (helpful={helpful_a}, harmful={harmful_a})
> {content_a}

**Bullet B** [{id_b}] (helpful={helpful_b}, harmful={harmful_b})
> {content_b}

`;

/**
 * Generate a human-readable similarity report for the Curator.
 *
 * @param similarPairs - List of [bullet_a, bullet_b, similarity_score] tuples
 * @returns Formatted report string to include in Curator prompt
 */
export function generateSimilarityReport(
  similarPairs: Array<[Bullet, Bullet, number]>
): string {
  if (similarPairs.length === 0) {
    return "";
  }

  const parts: string[] = [SIMILARITY_REPORT_HEADER];

  similarPairs.forEach(([bulletA, bulletB, similarity], index) => {
    const pairText = PAIR_TEMPLATE.replace("{index}", String(index + 1))
      .replace("{similarity}", `${Math.round(similarity * 100)}%`)
      .replace("{id_a}", bulletA.id)
      .replace("{helpful_a}", String(bulletA.helpful))
      .replace("{harmful_a}", String(bulletA.harmful))
      .replace("{content_a}", bulletA.content)
      .replace("{id_b}", bulletB.id)
      .replace("{helpful_b}", String(bulletB.helpful))
      .replace("{harmful_b}", String(bulletB.harmful))
      .replace("{content_b}", bulletB.content);
    parts.push(pairText);
  });

  parts.push(`
## Consolidation Operations Format

Include consolidation operations in your response under a \`consolidation_operations\` key.
Each operation should have a \`type\` field and relevant fields for that type:

\`\`\`json
{
  "consolidation_operations": [
    {
      "type": "MERGE",
      "source_ids": ["bullet-id-1", "bullet-id-2"],
      "keep_id": "bullet-id-1",
      "merged_content": "Improved combined strategy text",
      "reasoning": "Why merging improves the playbook"
    },
    {
      "type": "DELETE",
      "bullet_id": "bullet-id-to-remove",
      "reasoning": "Why this bullet is redundant"
    },
    {
      "type": "KEEP",
      "bullet_ids": ["bullet-id-1", "bullet-id-2"],
      "differentiation": "How they differ in purpose",
      "reasoning": "Why both are needed"
    },
    {
      "type": "UPDATE",
      "bullet_id": "bullet-id-to-update",
      "new_content": "Refined content with context tag like [Batch] or [API]",
      "reasoning": "How this clarifies the distinction"
    }
  ]
}
\`\`\`

**Guidelines:**
- Consider helpful/harmful counts (higher = more validated, prefer keeping these)
- MERGE when bullets are semantically identical or near-identical
- KEEP when they serve different contexts (batch vs real-time, different APIs, etc.)
- UPDATE to add context tags like "[Batch Jobs]" or "[User-Facing API]" to differentiate
- DELETE only when one is clearly redundant with no unique value

`);

  return parts.join("");
}

/**
 * Format a single pair for logging output.
 */
export function formatPairForLogging(
  bulletA: Bullet,
  bulletB: Bullet,
  similarity: number
): string {
  const contentA = bulletA.content.substring(0, 50);
  const contentB = bulletB.content.substring(0, 50);
  return (
    `[${bulletA.id}] '${contentA}...' ` +
    `↔ [${bulletB.id}] '${contentB}...' ` +
    `(${Math.round(similarity * 100)}% similar)`
  );
}
