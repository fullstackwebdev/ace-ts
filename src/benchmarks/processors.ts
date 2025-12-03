/**
 * Dataset-specific processors for handling different data granularities.
 *
 * This module provides processors that convert raw dataset formats into
 * properly structured samples for evaluation.
 */

import { Sample } from "../adaptation";

/**
 * Processor for FiNER dataset that groups token-level data into sentences.
 *
 * FiNER dataset stores individual tokens as rows with BIO labels.
 * This processor reconstructs sentences and converts BIO tags to entity spans.
 */
export class FiNERProcessor {
  private labelMap: Record<number, string>;

  constructor() {
    this.labelMap = {
      0: "O", // Outside
      1: "B-PER", // Begin Person
      2: "I-PER", // Inside Person
      3: "B-LOC", // Begin Location
      4: "I-LOC", // Inside Location
      5: "B-ORG", // Begin Organization
      6: "I-ORG", // Inside Organization
    };
  }

  /**
   * Process token stream and yield sentence-level samples.
   */
  async *processTokenStream(
    tokenStream: AsyncGenerator<Record<string, any>>
  ): AsyncGenerator<Sample> {
    // Group tokens by document and sentence
    const docSentences = new Map<
      number,
      Map<number, Array<{ token: string; label: number }>>
    >();

    for await (const tokenData of tokenStream) {
      const docIdx = tokenData.doc_idx;
      const sentIdx = tokenData.sent_idx;

      if (!docSentences.has(docIdx)) {
        docSentences.set(docIdx, new Map());
      }

      const document = docSentences.get(docIdx)!;
      if (!document.has(sentIdx)) {
        document.set(sentIdx, []);
      }

      document.get(sentIdx)!.push({
        token: tokenData.gold_token,
        label: tokenData.gold_label,
      });
    }

    // Process each sentence
    let sampleId = 0;
    const sortedDocIndices = Array.from(docSentences.keys()).sort(
      (a, b) => a - b
    );

    for (const docIdx of sortedDocIndices) {
      const document = docSentences.get(docIdx)!;
      const sortedSentIndices = Array.from(document.keys()).sort(
        (a, b) => a - b
      );

      for (const sentIdx of sortedSentIndices) {
        const sentenceTokens = document.get(sentIdx)!;

        // Reconstruct sentence text
        const tokens = sentenceTokens.map((item) => item.token);
        const labels = sentenceTokens.map(
          (item) => this.labelMap[item.label] || "O"
        );

        const sentenceText = this.reconstructSentence(tokens);
        const entities = this.extractEntities(tokens, labels);

        yield {
          question: `Identify named entities in the following financial text:\n\n${sentenceText}`,
          ground_truth: this.formatEntitiesAsString(entities),
        };

        sampleId++;
      }
    }
  }

  /**
   * Reconstruct sentence from tokens, handling punctuation properly.
   */
  private reconstructSentence(tokens: string[]): string {
    if (tokens.length === 0) {
      return "";
    }

    const result: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // Add space before token unless it's punctuation or first token
      if (i > 0 && !this.isPunctuation(token)) {
        result.push(" ");
      }
      result.push(token);
    }

    return result.join("");
  }

  /**
   * Check if token is punctuation that shouldn't have space before it.
   */
  private isPunctuation(token: string): boolean {
    const punctuation = new Set([
      ".",
      ",",
      "!",
      "?",
      ";",
      ":",
      "'",
      '"',
      ")",
      "]",
      "}",
      "%",
    ]);
    return punctuation.has(token);
  }

  /**
   * Convert BIO labels to entity spans.
   */
  private extractEntities(
    tokens: string[],
    labels: string[]
  ): Array<Record<string, any>> {
    const entities: Array<Record<string, any>> = [];
    let currentEntity: Record<string, any> | null = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const label = labels[i];

      if (label.startsWith("B-")) {
        // Save previous entity if exists
        if (currentEntity) {
          entities.push(this.finalizeEntity(currentEntity, tokens));
        }

        // Start new entity
        const entityType = label.substring(2); // Remove 'B-' prefix
        currentEntity = {
          type: entityType,
          start_idx: i,
          end_idx: i,
          token_indices: [i],
        };
      } else if (label.startsWith("I-") && currentEntity) {
        // Continue current entity
        const entityType = label.substring(2); // Remove 'I-' prefix
        if (entityType === currentEntity.type) {
          currentEntity.end_idx = i;
          currentEntity.token_indices.push(i);
        } else {
          // Type mismatch - finalize previous and start new
          entities.push(this.finalizeEntity(currentEntity, tokens));
          currentEntity = {
            type: entityType,
            start_idx: i,
            end_idx: i,
            token_indices: [i],
          };
        }
      } else if (label === "O") {
        // Outside - finalize current entity if exists
        if (currentEntity) {
          entities.push(this.finalizeEntity(currentEntity, tokens));
          currentEntity = null;
        }
      }
    }

    // Finalize last entity if exists
    if (currentEntity) {
      entities.push(this.finalizeEntity(currentEntity, tokens));
    }

    return entities;
  }

  /**
   * Convert entity info to final entity dictionary.
   */
  private finalizeEntity(
    entityInfo: Record<string, any>,
    tokens: string[]
  ): Record<string, any> {
    const entityTokens = entityInfo.token_indices.map(
      (i: number) => tokens[i]
    );
    const entityText = this.reconstructEntityText(entityTokens);

    return {
      text: entityText,
      label: entityInfo.type,
      start_idx: entityInfo.start_idx,
      end_idx: entityInfo.end_idx,
      tokens: entityTokens,
    };
  }

  /**
   * Reconstruct entity text from tokens.
   */
  private reconstructEntityText(entityTokens: string[]): string {
    if (entityTokens.length === 0) {
      return "";
    }

    // Simple reconstruction - join with spaces, but handle subwords
    const result: string[] = [];
    for (let i = 0; i < entityTokens.length; i++) {
      const token = entityTokens[i];
      if (
        i > 0 &&
        !token.startsWith("'") &&
        !this.isPunctuation(token)
      ) {
        result.push(" ");
      }
      result.push(token);
    }

    return result.join("");
  }

  /**
   * Format entities as string for ground truth comparison.
   */
  private formatEntitiesAsString(
    entities: Array<Record<string, any>>
  ): string {
    if (entities.length === 0) {
      return "No named entities found.";
    }

    const entityStrs = entities.map(
      (entity) => `${entity.text} (${entity.label})`
    );

    return entityStrs.join("; ");
  }
}

/**
 * Processor for XBRL-Math dataset - handles numerical reasoning problems.
 */
export class XBRLMathProcessor {
  /**
   * Process XBRL-Math samples - may need restructuring based on actual format.
   */
  async *processSamples(
    sampleStream: AsyncGenerator<Record<string, any>>
  ): AsyncGenerator<Sample> {
    let sampleId = 0;

    for await (const sampleData of sampleStream) {
      yield {
        question: sampleData.question || "",
        context: sampleData.context || "",
        ground_truth: String(sampleData.answer || ""),
      };
      sampleId++;
    }
  }
}

/**
 * Processor for AppWorld dataset - handles agent tasks.
 */
export class AppWorldProcessor {
  /**
   * Process AppWorld tasks.
   */
  async *processTasks(
    taskStream: AsyncGenerator<Record<string, any>>
  ): AsyncGenerator<Sample> {
    for await (const taskData of taskStream) {
      yield {
        question: taskData.instruction,
        context: `Available APIs: ${taskData.api_docs}`,
        ground_truth: "Task completion successful",
      };
    }
  }
}

/**
 * Get appropriate processor for benchmark.
 */
export function getProcessor(
  benchmarkName: string
):
  | FiNERProcessor
  | XBRLMathProcessor
  | AppWorldProcessor
  | undefined {
  const processors: Record<
    string,
    FiNERProcessor | XBRLMathProcessor | AppWorldProcessor
  > = {
    finer_ord: new FiNERProcessor(),
    xbrl_math: new XBRLMathProcessor(),
    appworld: new AppWorldProcessor(),
  };

  return processors[benchmarkName];
}
