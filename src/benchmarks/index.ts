/**
 * ACE Benchmarks Module
 *
 * Configuration-driven benchmark evaluation framework for ACE agents.
 * Supports scientific evaluation with standardized metrics and data loading.
 *
 * Example usage:
 *     import { BenchmarkTaskManager, GenericBenchmarkEnvironment } from './benchmarks';
 *
 *     // Create task manager
 *     const manager = new BenchmarkTaskManager();
 *
 *     // List available benchmarks
 *     const benchmarks = manager.listBenchmarks();
 *
 *     // Get benchmark configuration and environment
 *     const config = manager.getConfig("finer_ord");
 *     const env = manager.getBenchmark("finer_ord");
 *
 *     // Load benchmark data
 *     for await (const sample of manager.loadBenchmarkData("finer_ord")) {
 *       console.log(sample);
 *     }
 */

// Base classes and interfaces
export {
  BenchmarkConfig,
  createBenchmarkConfig,
  BenchmarkSample,
  DataLoader,
  BenchmarkEnvironment,
  getCacheDir,
  getDataDir,
} from "./base";

// Environment implementations
export {
  GenericBenchmarkEnvironment,
  FiNEREnvironment,
  XBRLMathEnvironment,
  AppWorldEnvironment,
} from "./environments";

// Data processors
export {
  FiNERProcessor,
  XBRLMathProcessor,
  AppWorldProcessor,
  getProcessor,
} from "./processors";

// Data loaders
export { HuggingFaceLoader } from "./loaders";

// Benchmark manager
export { BenchmarkTaskManager } from "./manager";
