/**
 * Centralized optional dependency detection for ACE framework.
 *
 * This module provides a clean interface for checking which optional dependencies
 * are available, avoiding scattered try/catch imports throughout the codebase.
 *
 * Usage:
 * ```typescript
 * import { hasOpik, hasLangChain, getAvailableFeatures } from './features.js';
 *
 * if (hasOpik()) {
 *   // Import and use Opik integration
 * }
 * ```
 */

// Cache for dependency checks to avoid repeated imports
const featureCache: Map<string, boolean> = new Map();

/**
 * Check if a module can be imported
 */
function checkImport(moduleName: string): boolean {
  if (featureCache.has(moduleName)) {
    return featureCache.get(moduleName)!;
  }

  try {
    require.resolve(moduleName);
    featureCache.set(moduleName, true);
    return true;
  } catch {
    featureCache.set(moduleName, false);
    return false;
  }
}

/**
 * Check if Opik observability integration is available
 */
export function hasOpik(): boolean {
  return checkImport('opik');
}

/**
 * Check if Vercel AI SDK is available
 */
export function hasVercelAI(): boolean {
  return checkImport('ai');
}

/**
 * Check if LangChain integration is available
 */
export function hasLangChain(): boolean {
  return checkImport('@langchain/core');
}

/**
 * Check if browser-use library for browser automation is available
 */
export function hasBrowserUse(): boolean {
  return checkImport('browser-use');
}

/**
 * Check if Playwright browser automation is available
 */
export function hasPlaywright(): boolean {
  return checkImport('playwright');
}

/**
 * Get a dictionary of all available features
 *
 * @returns Record mapping feature names to availability status
 *
 * @example
 * ```typescript
 * const features = getAvailableFeatures();
 * console.log(features);
 * // { opik: true, vercelAI: true, langchain: false, ... }
 * ```
 */
export function getAvailableFeatures(): Record<string, boolean> {
  return {
    opik: hasOpik(),
    vercelAI: hasVercelAI(),
    langchain: hasLangChain(),
    browserUse: hasBrowserUse(),
    playwright: hasPlaywright(),
  };
}

/**
 * Print a formatted table of available features
 */
export function printFeatureStatus(): void {
  const features = getAvailableFeatures();

  console.log('\n' + '='.repeat(50));
  console.log('ACE Framework - Available Features');
  console.log('='.repeat(50));

  for (const [feature, available] of Object.entries(features)) {
    const status = available ? '✓ Available' : '✗ Not installed';
    console.log(`  ${feature.padEnd(15)} ${status}`);
  }

  console.log('='.repeat(50) + '\n');
}

/**
 * Reset the feature cache (useful for testing)
 */
export function resetFeatureCache(): void {
  featureCache.clear();
}
