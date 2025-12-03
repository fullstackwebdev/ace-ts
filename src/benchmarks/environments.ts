/**
 * Benchmark-specific environment implementations.
 *
 * This module provides specialized evaluation environments for different benchmarks,
 * each implementing the evaluation logic appropriate for their task type.
 */

import { EnvironmentResult, Sample } from "../adaptation";
import { BenchmarkEnvironment } from "./base";

/**
 * Generic benchmark environment for basic evaluation tasks.
 *
 * Provides standard evaluation metrics like exact match, accuracy, and F1 score.
 * Can be used for most text-based benchmarks with straightforward evaluation.
 */
export class GenericBenchmarkEnvironment extends BenchmarkEnvironment {
  async evaluate(sample: Sample, generatorOutput: any): Promise<EnvironmentResult> {
    const prediction = generatorOutput.final_answer || "";
    const groundTruth = sample.groundTruth || "";

    // Compute metrics based on configuration
    const metrics = this.computeMetrics(prediction, groundTruth);

    // Generate feedback based on primary metric
    const primaryMetric =
      this.config.metrics.length > 0
        ? this.config.metrics[0].name
        : "accuracy";
    const score = metrics[primaryMetric] || 0.0;

    let feedback: string;
    if (score >= 0.8) {
      feedback = `Good performance (${(score * 100).toFixed(0)}%). Answer aligns well with expected output.`;
    } else if (score >= 0.5) {
      feedback = `Moderate performance (${(score * 100).toFixed(0)}%). Consider refining approach for better accuracy.`;
    } else {
      feedback = `Low performance (${(score * 100).toFixed(0)}%). Significant improvement needed in reasoning or format.`;
    }

    return {
      feedback,
      groundTruth: groundTruth,
      metrics,
    };
  }
}

/**
 * Environment for FiNER (Financial Named Entity Recognition) benchmark.
 *
 * Evaluates NER predictions against gold labels with support for both
 * token-level and entity-level evaluation metrics.
 */
export class FiNEREnvironment extends BenchmarkEnvironment {
  async evaluate(sample: Sample, generatorOutput: any): Promise<EnvironmentResult> {
    const prediction = generatorOutput.final_answer || "";

    // Extract entities from prediction and ground truth
    const predictedEntities = this.extractEntities(prediction, sample);
    const goldEntities = this.extractGoldEntities(sample);

    // Compute NER-specific metrics
    const metrics = this.computeNERMetrics(predictedEntities, goldEntities);

    // Generate detailed feedback
    const feedback = this.generateNERFeedback(
      predictedEntities,
      goldEntities,
      metrics
    );

    return {
      feedback,
      groundTruth: sample.groundTruth,
      metrics,
    };
  }

  /**
   * Extract entities from model prediction.
   */
  private extractEntities(
    prediction: string,
    _sample: Sample
  ): Set<string> {
    const entities = new Set<string>();

    // Try to parse structured output (JSON or similar)
    try {
      const trimmed = prediction.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const entity of parsed) {
            if (
              typeof entity === "object" &&
              "text" in entity &&
              "label" in entity
            ) {
              entities.add(`${entity.text}|||${entity.label}`);
            }
          }
        } else if (typeof parsed === "object" && "entities" in parsed) {
          for (const entity of parsed.entities) {
            entities.add(`${entity.text}|||${entity.label}`);
          }
        }
      }
    } catch {
      // JSON parsing failed, continue to fallback
    }

    // Fallback: extract from free text using patterns
    if (entities.size === 0) {
      const extracted = this.extractEntitiesFromText(prediction);
      for (const entity of extracted) {
        entities.add(entity);
      }
    }

    return entities;
  }

  /**
   * Extract entities from unstructured text using patterns.
   */
  private extractEntitiesFromText(text: string): Set<string> {
    const entities = new Set<string>();

    // Common patterns for entity mentions
    const patterns = [
      /(?:PERSON|PER):\s*([^,\n]+)/gi,
      /(?:ORGANIZATION|ORG):\s*([^,\n]+)/gi,
      /(?:LOCATION|LOC):\s*([^,\n]+)/gi,
      /(?:FINANCIAL|FIN):\s*([^,\n]+)/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const entityText = match[1].trim();
        const entityType = match[0].split(":")[0].trim().toUpperCase();
        entities.add(`${entityText}|||${entityType}`);
      }
    }

    return entities;
  }

  /**
   * Extract gold entities from sample metadata.
   */
  private extractGoldEntities(sample: Sample): Set<string> {
    const entities = new Set<string>();

    // Check if entities are already extracted by processor
    if (sample.metadata) {
      const metadata = sample.metadata as any;
      const extractedEntities = metadata.entities || [];

      if (extractedEntities.length > 0) {
        // Use pre-extracted entities from processor
        for (const entity of extractedEntities) {
          entities.add(`${entity.text}|||${entity.label}`);
        }
        return entities;
      }

      // Fallback: parse from BIO labels if available
      const tokens = metadata.tokens || [];
      const bioLabels = metadata.bio_labels || [];

      if (
        tokens.length > 0 &&
        bioLabels.length > 0 &&
        tokens.length === bioLabels.length
      ) {
        let currentEntity: string[] = [];
        let currentLabel: string | null = null;

        for (let i = 0; i < tokens.length; i++) {
          const _token = tokens[i];
          const label = bioLabels[i];

          if (label.startsWith("B-")) {
            // Beginning of entity
            if (currentEntity.length > 0 && currentLabel) {
              entities.add(`${currentEntity.join(" ")}|||${currentLabel}`);
            }
            currentEntity = [_token];
            currentLabel = label.substring(2); // Remove B- prefix
          } else if (label.startsWith("I-") && currentLabel) {
            // Inside entity
            currentEntity.push(_token);
          } else {
            // O or end of entity
            if (currentEntity.length > 0 && currentLabel) {
              entities.add(`${currentEntity.join(" ")}|||${currentLabel}`);
            }
            currentEntity = [];
            currentLabel = null;
          }
        }

        // Handle last entity
        if (currentEntity.length > 0 && currentLabel) {
          entities.add(`${currentEntity.join(" ")}|||${currentLabel}`);
        }
      }
    }

    return entities;
  }

  /**
   * Compute NER evaluation metrics.
   */
  private computeNERMetrics(
    predicted: Set<string>,
    gold: Set<string>
  ): Record<string, number> {
    if (gold.size === 0) {
      return {
        precision: predicted.size === 0 ? 1.0 : 0.0,
        recall: 1.0,
        f1: 1.0,
      };
    }

    const truePositives = [...predicted].filter((x) => gold.has(x)).length;
    const predictedCount = predicted.size;
    const goldCount = gold.size;

    const precision =
      predictedCount > 0 ? truePositives / predictedCount : 0.0;
    const recall = goldCount > 0 ? truePositives / goldCount : 0.0;
    const f1 =
      precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;

    return {
      precision,
      recall,
      f1,
      exact_match: predicted.size === gold.size && truePositives === goldCount ? 1.0 : 0.0,
    };
  }

  /**
   * Generate detailed feedback for NER evaluation.
   */
  private generateNERFeedback(
    predicted: Set<string>,
    gold: Set<string>,
    metrics: Record<string, number>
  ): string {
    const f1Score = metrics.f1;
    const precision = metrics.precision;
    const recall = metrics.recall;

    const feedbackParts = [
      `F1: ${(f1Score * 100).toFixed(0)}%, Precision: ${(precision * 100).toFixed(0)}%, Recall: ${(recall * 100).toFixed(0)}%`,
    ];

    if (f1Score >= 0.8) {
      feedbackParts.push("Excellent entity recognition performance.");
    } else if (f1Score >= 0.6) {
      feedbackParts.push("Good entity recognition with room for improvement.");
    } else {
      feedbackParts.push("Entity recognition needs significant improvement.");
    }

    // Specific guidance based on precision/recall balance
    if (precision < recall) {
      feedbackParts.push(
        "Focus on reducing false positives - be more selective in entity identification."
      );
    } else if (recall < precision) {
      feedbackParts.push(
        "Focus on improving recall - ensure all relevant entities are identified."
      );
    }

    // Identify missed and incorrect entities
    const missed = [...gold].filter((x) => !predicted.has(x));
    const incorrect = [...predicted].filter((x) => !gold.has(x));

    if (missed.length > 0) {
      feedbackParts.push(
        `Missed ${missed.length} entities: ${missed.slice(0, 3).join(", ")}...`
      );
    }
    if (incorrect.length > 0) {
      feedbackParts.push(
        `Incorrectly identified ${incorrect.length} entities: ${incorrect.slice(0, 3).join(", ")}...`
      );
    }

    return feedbackParts.join(" ");
  }
}

/**
 * Environment for XBRL-Math benchmark (financial reasoning with numerical computation).
 *
 * Evaluates numerical reasoning capabilities with XBRL financial data,
 * focusing on accuracy of calculations and understanding of financial relationships.
 */
export class XBRLMathEnvironment extends BenchmarkEnvironment {
  async evaluate(sample: Sample, generatorOutput: any): Promise<EnvironmentResult> {
    const prediction = generatorOutput.final_answer || "";
    const groundTruth = sample.groundTruth || "";

    // Extract numerical answer from prediction
    const predictedNumber = this.extractNumber(prediction);
    const groundTruthNumber = this.extractNumber(groundTruth);

    // Compute numerical accuracy metrics
    const metrics = this.computeNumericalMetrics(
      predictedNumber,
      groundTruthNumber
    );

    // Generate feedback focused on numerical reasoning
    const feedback = this.generateNumericalFeedback(
      predictedNumber,
      groundTruthNumber,
      metrics,
      prediction
    );

    return {
      feedback,
      groundTruth: groundTruth,
      metrics,
    };
  }

  /**
   * Extract numerical value from text response.
   */
  private extractNumber(text: string): number {
    if (!text) {
      return NaN;
    }

    // Remove common currency symbols and formatting
    const cleaned = text.replace(/[\$,\s%]/g, "");

    // Look for numerical patterns
    const patterns = [
      /(?:answer|result|equals?|is)[\s:]*([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/i,
      /([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)(?:\s*(?:dollars?|USD|\$))?/,
      /(?:^|\s)([+-]?\d+\.?\d*)(?:\s|$)/,
    ];

    for (const pattern of patterns) {
      const matches = cleaned.match(pattern);
      if (matches) {
        try {
          return parseFloat(matches[1] || matches[0]);
        } catch {
          continue;
        }
      }
    }

    return NaN;
  }

  /**
   * Compute numerical accuracy metrics with tolerance.
   */
  private computeNumericalMetrics(
    predicted: number,
    groundTruth: number
  ): Record<string, number> {
    if (isNaN(predicted) || isNaN(groundTruth)) {
      return {
        exact_match: 0.0,
        relative_error: Infinity,
        within_1_percent: 0.0,
        within_5_percent: 0.0,
      };
    }

    const exactMatch = Math.abs(predicted - groundTruth) < 1e-6 ? 1.0 : 0.0;

    let relativeError: number;
    if (groundTruth !== 0) {
      relativeError = Math.abs(predicted - groundTruth) / Math.abs(groundTruth);
    } else {
      relativeError = predicted !== 0 ? Infinity : 0.0;
    }

    const within1Percent = relativeError <= 0.01 ? 1.0 : 0.0;
    const within5Percent = relativeError <= 0.05 ? 1.0 : 0.0;

    return {
      exact_match: exactMatch,
      relative_error: relativeError,
      within_1_percent: within1Percent,
      within_5_percent: within5Percent,
    };
  }

  /**
   * Generate feedback for numerical reasoning performance.
   */
  private generateNumericalFeedback(
    predicted: number,
    groundTruth: number,
    metrics: Record<string, number>,
    _fullPrediction: string
  ): string {
    if (isNaN(predicted)) {
      return (
        "Could not extract numerical answer from response. " +
        "Ensure final answer is clearly stated with numerical value."
      );
    }

    if (isNaN(groundTruth)) {
      return "No ground truth available for comparison.";
    }

    const relError = metrics.relative_error;

    if (metrics.exact_match) {
      return `Perfect! Exact numerical match: ${predicted}`;
    } else if (metrics.within_1_percent) {
      return `Excellent accuracy (within 1%): predicted ${predicted}, expected ${groundTruth}`;
    } else if (metrics.within_5_percent) {
      return (
        `Good accuracy (within 5%): predicted ${predicted}, expected ${groundTruth}. ` +
        `Relative error: ${(relError * 100).toFixed(1)}%`
      );
    } else {
      const errorMag = relError > 0.5 ? "large" : "moderate";
      return (
        `Numerical error (${errorMag}): predicted ${predicted}, expected ${groundTruth}. ` +
        `Relative error: ${(relError * 100).toFixed(1)}%. Review calculation steps and XBRL relationships.`
      );
    }
  }
}

/**
 * Environment for AppWorld benchmark (autonomous agent execution).
 *
 * Evaluates agent performance in realistic application environments with
 * API interactions, task completion, and execution success metrics.
 */
export class AppWorldEnvironment extends BenchmarkEnvironment {
  async evaluate(sample: Sample, generatorOutput: any): Promise<EnvironmentResult> {
    // AppWorld evaluation is typically done through the world.execute() method
    // This environment focuses on analyzing the execution results

    const prediction = generatorOutput.final_answer || "";

    // Extract execution results from sample metadata if available
    const executionResults = this.extractExecutionResults(sample);

    // Compute execution metrics
    const metrics = this.computeExecutionMetrics(executionResults, prediction);

    // Generate feedback based on execution success
    const feedback = this.generateExecutionFeedback(executionResults, metrics);

    return {
      feedback,
      groundTruth: sample.groundTruth,
      metrics,
    };
  }

  /**
   * Extract execution results from sample metadata.
   */
  private extractExecutionResults(sample: Sample): Record<string, any> {
    if (!sample.metadata) {
      return { success: false, error: "No execution results available" };
    }

    return (
      sample.metadata.execution_results || {
        success: false,
        error: "No execution results in metadata",
      }
    );
  }

  /**
   * Compute execution success metrics.
   */
  private computeExecutionMetrics(
    executionResults: Record<string, any>,
    _prediction: string
  ): Record<string, number> {
    const success = executionResults.success || false;

    const metrics: Record<string, number> = {
      task_success: success ? 1.0 : 0.0,
      execution_error: success ? 0.0 : 1.0,
    };

    // Add API usage metrics if available
    if (executionResults.api_calls) {
      const apiCalls = executionResults.api_calls;
      metrics.api_calls_count = apiCalls.length;
      metrics.api_success_rate =
        apiCalls.length > 0
          ? apiCalls.filter((call: any) => call.success || false).length /
            apiCalls.length
          : 0.0;
    }

    return metrics;
  }

  /**
   * Generate feedback for agent execution performance.
   */
  private generateExecutionFeedback(
    executionResults: Record<string, any>,
    metrics: Record<string, number>
  ): string {
    if (metrics.task_success) {
      let feedback = "Task completed successfully! ";

      const apiSuccessRate = metrics.api_success_rate || 0.0;
      if (apiSuccessRate >= 0.9) {
        feedback += "Excellent API usage with minimal errors.";
      } else if (apiSuccessRate >= 0.7) {
        feedback += "Good API usage with some recoverable errors.";
      } else {
        feedback += "API usage had issues but task still completed.";
      }

      return feedback;
    } else {
      const error = executionResults.error || "Unknown error";
      let feedback = `Task failed: ${error}. `;

      if (error.toLowerCase().includes("timeout")) {
        feedback +=
          "Consider optimizing execution time and reducing unnecessary API calls.";
      } else if (error.toLowerCase().includes("api")) {
        feedback +=
          "Review API documentation and ensure correct parameter usage.";
      } else {
        feedback +=
          "Analyze task requirements and improve reasoning approach.";
      }

      return feedback;
    }
  }
}
