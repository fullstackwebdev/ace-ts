/**
 * Base classes and interfaces for benchmark integration.
 *
 * This module provides the foundation for configuration-driven benchmark
 * evaluation that follows production patterns from lm-evaluation-harness.
 */

import { Sample, TaskEnvironment, EnvironmentResult } from "../adaptation";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

/**
 * Configuration for a benchmark task loaded from YAML/JSON.
 */
export interface BenchmarkConfig {
  task: string;
  version: string;
  data: Record<string, any>;
  preprocessing: Record<string, string>;
  metrics: Array<Record<string, any>>;
  metadata?: Record<string, any>;
}

/**
 * Create BenchmarkConfig from loaded YAML/JSON dictionary.
 */
export function createBenchmarkConfig(
  configDict: Record<string, any>
): BenchmarkConfig {
  return {
    task: configDict.task,
    version: configDict.version,
    data: configDict.data,
    preprocessing: configDict.preprocessing,
    metrics: configDict.metrics,
    metadata: configDict.metadata,
  };
}

/**
 * Note: BenchmarkSample is now just an alias for Sample for simplicity.
 * Legacy code can still use BenchmarkSample, but new code should use Sample directly.
 */
export type BenchmarkSample = Sample;

/**
 * Abstract base class for loading benchmark data from different sources.
 */
export abstract class DataLoader {
  /**
   * Load benchmark data and yield individual samples.
   */
  abstract load(kwargs?: Record<string, any>): AsyncGenerator<Record<string, any>>;

  /**
   * Check if this loader supports the given data source.
   */
  abstract supportsSource(source: string): boolean;
}

/**
 * Base class for benchmark evaluation environments.
 */
export abstract class BenchmarkEnvironment extends TaskEnvironment {
  config: BenchmarkConfig;
  metricsConfig: Record<string, Record<string, any>>;

  constructor(config: BenchmarkConfig) {
    super();
    this.config = config;
    this.metricsConfig = {};
    for (const m of config.metrics) {
      this.metricsConfig[m.name] = m;
    }
  }

  /**
   * Evaluate generator output against benchmark criteria.
   */
  abstract evaluate(sample: Sample, generatorOutput: any): Promise<EnvironmentResult>;

  /**
   * Compute configured metrics for the benchmark.
   */
  protected computeMetrics(
    prediction: string,
    groundTruth: string
  ): Record<string, number> {
    const metrics: Record<string, number> = {};

    for (const metricConfig of this.config.metrics) {
      const metricName = metricConfig.name;

      if (metricName === "exact_match") {
        metrics[metricName] =
          prediction.trim() === groundTruth.trim() ? 1.0 : 0.0;
      } else if (metricName === "accuracy") {
        metrics[metricName] =
          prediction.trim() === groundTruth.trim() ? 1.0 : 0.0;
      } else if (metricName === "f1") {
        // Simplified F1 - can be extended for token-level F1
        metrics[metricName] = this.computeF1(prediction, groundTruth);
      }
    }

    return metrics;
  }

  /**
   * Compute F1 score between prediction and ground truth.
   */
  protected computeF1(prediction: string, groundTruth: string): number {
    const predTokens = new Set(prediction.toLowerCase().split(/\s+/));
    const gtTokens = new Set(groundTruth.toLowerCase().split(/\s+/));

    if (gtTokens.size === 0) {
      return predTokens.size === 0 ? 1.0 : 0.0;
    }

    const intersection = new Set(
      [...predTokens].filter((x) => gtTokens.has(x))
    );
    if (intersection.size === 0) {
      return 0.0;
    }

    const precision =
      predTokens.size > 0 ? intersection.size / predTokens.size : 0.0;
    const recall = intersection.size / gtTokens.size;

    if (precision + recall === 0) {
      return 0.0;
    }

    return (2 * (precision * recall)) / (precision + recall);
  }
}

/**
 * Get cache directory for a benchmark, respecting environment variables.
 */
export function getCacheDir(benchmarkName: string): string {
  // Check for benchmark-specific cache dir
  let cacheDir = process.env.BENCHMARK_CACHE_DIR;
  if (!cacheDir) {
    // Fall back to HuggingFace default location
    cacheDir =
      process.env.HF_DATASETS_CACHE ||
      path.join(os.homedir(), ".cache", "huggingface", "datasets");
  }

  const cachePath = path.join(cacheDir, "benchmarks", benchmarkName);
  fs.mkdirSync(cachePath, { recursive: true });
  return cachePath;
}

/**
 * Get data directory for benchmarks requiring local storage.
 */
export function getDataDir(benchmarkName: string): string {
  const dataDir = process.env.BENCHMARK_DATA_DIR || "/tmp/benchmark_data";
  const dataPath = path.join(dataDir, benchmarkName);
  fs.mkdirSync(dataPath, { recursive: true });
  return dataPath;
}
