/**
 * Benchmark task manager for configuration-driven evaluation.
 *
 * This module implements the BenchmarkTaskManager which handles YAML config loading,
 * task discovery, and benchmark instantiation following lm-evaluation-harness patterns.
 */

import * as fs from "fs";
import * as path from "path";
import { BenchmarkConfig, BenchmarkEnvironment, DataLoader, createBenchmarkConfig } from "./base";
import { HuggingFaceLoader } from "./loaders/huggingface";
import {
  GenericBenchmarkEnvironment,
  FiNEREnvironment,
  XBRLMathEnvironment,
  AppWorldEnvironment,
} from "./environments";

/**
 * Manages benchmark tasks with automatic discovery and configuration loading.
 *
 * Features:
 * - Automatic YAML/JSON config discovery in tasks/ directory
 * - Pluggable data loader system
 * - Lazy loading of benchmark instances
 * - Environment variable configuration
 *
 * Usage:
 *     const manager = new BenchmarkTaskManager();
 *     const benchmark = manager.getBenchmark("finer");
 *     const config = manager.getConfig("finer");
 *     const available = manager.listBenchmarks();
 */
export class BenchmarkTaskManager {
  private tasksDir: string;
  private configs: Map<string, BenchmarkConfig>;
  private benchmarks: Map<string, BenchmarkEnvironment>;
  private loaders: Map<string, DataLoader>;

  /**
   * Initialize the benchmark task manager.
   *
   * @param tasksDir - Directory containing benchmark task configs.
   *                   Defaults to benchmarks/tasks/ relative to this module.
   */
  constructor(tasksDir?: string) {
    if (!tasksDir) {
      tasksDir = path.join(__dirname, "tasks");
    }

    this.tasksDir = tasksDir;
    this.configs = new Map();
    this.benchmarks = new Map();

    // Register available data loaders
    this.loaders = new Map();
    this.loaders.set("huggingface", new HuggingFaceLoader());

    // Try to import and register AppWorld loader if available
    try {
      // Dynamic import would go here if AppWorld loader exists
      // const { AppWorldLoader } = require("./loaders/appworld");
      // this.loaders.set("appworld", new AppWorldLoader());
    } catch {
      // AppWorld loader not available
    }

    // Discover all available task configs
    this.discoverConfigs();
  }

  /**
   * Scan tasks directory for YAML and JSON configuration files.
   */
  private discoverConfigs(): void {
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true });
      return;
    }

    // Load YAML and JSON configs
    this.scanDirectory(this.tasksDir);
  }

  /**
   * Recursively scan directory for config files.
   */
  private scanDirectory(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.scanDirectory(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        if (ext === ".yaml" || ext === ".yml") {
          this.loadYAMLConfig(fullPath);
        } else if (ext === ".json") {
          this.loadJSONConfig(fullPath);
        } else if (ext === ".toml") {
          // TOML support would require additional dependency
          console.warn(`TOML config ${fullPath} skipped - install js-yaml or similar for support`);
        }
      }
    }
  }

  /**
   * Load YAML config file.
   * Note: Requires js-yaml package (optional dependency)
   */
  private loadYAMLConfig(filePath: string): void {
    try {
      // Note: This would require js-yaml package
      // For now, we'll note that YAML support requires optional dependency
      console.warn(`YAML config ${filePath} requires 'js-yaml' package (optional dependency)`);

      // Example implementation with js-yaml:
      // const yaml = require('js-yaml');
      // const content = fs.readFileSync(filePath, 'utf8');
      // const configDict = yaml.load(content);
      // const config = createBenchmarkConfig(configDict);
      // this.configs.set(config.task, config);
    } catch (error) {
      console.warn(`Failed to load YAML config from ${filePath}:`, error);
    }
  }

  /**
   * Load JSON config file.
   */
  private loadJSONConfig(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const configDict = JSON.parse(content);
      const config = createBenchmarkConfig(configDict);
      this.configs.set(config.task, config);
    } catch (error) {
      console.warn(`Failed to load JSON config from ${filePath}:`, error);
    }
  }

  /**
   * Return list of available benchmark task names.
   */
  listBenchmarks(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Get configuration for a specific benchmark task.
   */
  getConfig(taskName: string): BenchmarkConfig {
    const config = this.configs.get(taskName);
    if (!config) {
      throw new Error(`Unknown benchmark task: ${taskName}`);
    }
    return config;
  }

  /**
   * Get benchmark environment instance for a task.
   *
   * Uses lazy loading - benchmark is instantiated only when first requested.
   */
  getBenchmark(taskName: string): BenchmarkEnvironment {
    if (!this.benchmarks.has(taskName)) {
      const config = this.getConfig(taskName);

      // Determine benchmark environment class based on task
      const envClass = this.getEnvironmentClass(config);
      this.benchmarks.set(taskName, new envClass(config));
    }

    return this.benchmarks.get(taskName)!;
  }

  /**
   * Get data loader for the specified source.
   */
  getDataLoader(source: string): DataLoader {
    const loader = this.loaders.get(source);
    if (!loader) {
      throw new Error(`Unknown data source: ${source}`);
    }
    return loader;
  }

  /**
   * Load data for a specific benchmark task.
   */
  async *loadBenchmarkData(
    taskName: string
  ): AsyncGenerator<Record<string, any>> {
    const config = this.getConfig(taskName);
    const dataConfig = { ...config.data }; // Make a copy to avoid modifying original
    const source = dataConfig.source;

    // Extract limit and remove from loader args
    const limit = dataConfig.limit;
    delete dataConfig.limit;

    // Add benchmark name for processor selection
    dataConfig.benchmark_name = taskName;

    const loader = this.getDataLoader(source);
    const dataIter = loader.load(dataConfig);

    // Apply limit if specified in config
    let count = 0;
    for await (const item of dataIter) {
      if (limit && count >= limit) {
        break;
      }
      yield item;
      count++;
    }
  }

  /**
   * Determine the appropriate environment class for a benchmark.
   *
   * This can be extended to support custom environment classes
   * based on task configuration.
   */
  private getEnvironmentClass(
    config: BenchmarkConfig
  ): new (config: BenchmarkConfig) => BenchmarkEnvironment {
    const taskName = config.task.toLowerCase();

    if (taskName.includes("finer")) {
      return FiNEREnvironment;
    } else if (taskName.includes("xbrl") || taskName.includes("math")) {
      return XBRLMathEnvironment;
    } else if (taskName.includes("appworld")) {
      return AppWorldEnvironment;
    } else {
      return GenericBenchmarkEnvironment;
    }
  }

  /**
   * Register a custom data loader for a source.
   */
  registerLoader(source: string, loader: DataLoader): void {
    this.loaders.set(source, loader);
  }

  /**
   * Reload all configuration files from tasks directory.
   */
  reloadConfigs(): void {
    this.configs.clear();
    this.benchmarks.clear();
    this.discoverConfigs();
  }

  /**
   * Validate a benchmark configuration and return any issues found.
   *
   * @returns Array of validation error messages, empty if valid.
   */
  validateConfig(taskName: string): string[] {
    const errors: string[] = [];

    let config: BenchmarkConfig;
    try {
      config = this.getConfig(taskName);
    } catch (error) {
      return [String(error)];
    }

    // Validate data source
    const source = config.data.source;
    if (!source) {
      errors.push("Missing 'source' in data configuration");
    } else if (!this.loaders.has(source)) {
      errors.push(`Unknown data source: ${source}`);
    }

    // Validate required fields
    const requiredFields: Array<keyof BenchmarkConfig> = [
      "task",
      "version",
      "data",
      "preprocessing",
      "metrics",
    ];
    for (const field of requiredFields) {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate metrics configuration
    if (config.metrics) {
      for (const metric of config.metrics) {
        if (!metric.name) {
          errors.push("Metric missing 'name' field");
        }
      }
    }

    return errors;
  }
}
