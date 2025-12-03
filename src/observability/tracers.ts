/**
 * ACE-specific tracing utilities for Opik integration.
 *
 * Provides utilities for conditionally applying Opik tracing to ACE framework components.
 */

// Flag to check if Opik is installed (importable)
let OPIK_INSTALLED = false;
let opikTrack: any = null;

try {
  // Try to import Opik - note: this is optional dependency
  // @ts-ignore - opik may not be installed
  const opik = require('@opik/sdk');
  opikTrack = opik.track;
  OPIK_INSTALLED = true;
} catch (error) {
  // Opik not installed - graceful degradation
  OPIK_INSTALLED = false;
}

/**
 * Check if Opik should be disabled via environment variable.
 *
 * Supports both patterns:
 * - OPIK_DISABLED=true/1/yes (disable pattern)
 * - OPIK_ENABLED=false/0/no (enable pattern)
 */
function shouldSkipOpik(): boolean {
  // Check disable pattern: OPIK_DISABLED=true/1/yes
  const disabled = process.env.OPIK_DISABLED?.toLowerCase();
  if (disabled === 'true' || disabled === '1' || disabled === 'yes') {
    return true;
  }
  // Check enable pattern: OPIK_ENABLED=false/0/no
  const enabled = process.env.OPIK_ENABLED?.toLowerCase();
  if (enabled === 'false' || enabled === '0' || enabled === 'no') {
    return true;
  }
  return false;
}

/**
 * Conditionally apply Opik tracking decorator if Opik is available and enabled.
 *
 * Respects environment variables:
 * - OPIK_ENABLED=false (or 0/no) - disables tracing
 * - OPIK_DISABLED=true (or 1/yes) - disables tracing
 *
 * @param options - Tracking options
 * @param options.name - Name for the trace
 * @param options.tags - Tags for the trace
 * @returns Decorator function that applies Opik tracking if available
 *
 * @example
 * ```typescript
 * class MyRole {
 *   @maybeTrack({ name: 'my-role-generate', tags: ['role', 'generator'] })
 *   async generate(input: string): Promise<string> {
 *     // Implementation
 *     return "result";
 *   }
 * }
 * ```
 */
export function maybeTrack(options?: {
  name?: string;
  tags?: string[];
  [key: string]: any;
}): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    const originalMethod = descriptor.value;

    // First check: is Opik installed?
    if (!OPIK_INSTALLED) {
      return descriptor;
    }

    // Second check: is Opik disabled via environment variable?
    if (shouldSkipOpik()) {
      return descriptor;
    }

    try {
      // Apply Opik's tracking decorator if available
      if (opikTrack) {
        descriptor.value = opikTrack(options)(originalMethod);
      }
    } catch (error) {
      console.warn(
        `Failed to apply Opik tracking to ${String(propertyKey)}:`,
        error
      );
    }

    return descriptor;
  };
}

/**
 * Legacy alias for backward compatibility.
 * @deprecated Use maybeTrack instead.
 */
export function trackRole(options?: {
  name?: string;
  tags?: string[];
  [key: string]: any;
}): MethodDecorator {
  return maybeTrack(options);
}

/**
 * Legacy alias for backward compatibility.
 * @deprecated Use maybeTrack instead.
 */
export function aceTrack(options?: {
  name?: string;
  tags?: string[];
  [key: string]: any;
}): MethodDecorator {
  return maybeTrack(options);
}

/**
 * Check if Opik is installed and available.
 */
export function isOpikAvailable(): boolean {
  return OPIK_INSTALLED && !shouldSkipOpik();
}
