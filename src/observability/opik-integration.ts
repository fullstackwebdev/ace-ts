/**
 * Opik Integration for ACE Framework
 *
 * Provides enterprise-grade observability and tracing for ACE components.
 * Replaces custom explainability with production-ready Opik platform.
 *
 * Note: This module gracefully degrades when Opik is not installed.
 * Install with: npm install @opik/sdk (optional dependency)
 */

// Optional Opik imports - gracefully degrade if not available
let OPIK_AVAILABLE = false;
let opikModule: any = null;
let opikContext: any = null;

try {
  // @ts-ignore - opik may not be installed
  opikModule = require('@opik/sdk');
  opikContext = opikModule.opikContext;
  OPIK_AVAILABLE = true;
} catch (error) {
  // Opik not installed - graceful degradation
  OPIK_AVAILABLE = false;
}

/**
 * Check if Opik should be disabled via environment variable.
 *
 * Supports both patterns:
 * - OPIK_DISABLED=true/1/yes (disable pattern)
 * - OPIK_ENABLED=false/0/no (enable pattern)
 */
export function _shouldSkipOpik(): boolean {
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
 * Main integration class for ACE + Opik observability.
 *
 * Provides enterprise-grade tracing, evaluation, and monitoring
 * capabilities for ACE framework components.
 */
export class OpikIntegration {
  public readonly projectName: string;
  public readonly tags: string[];
  public enabled: boolean;

  /**
   * Initialize Opik integration.
   *
   * @param projectName - Opik project name for organizing traces
   * @param enableAutoConfig - Auto-configure Opik if available
   * @param tags - Default tags to apply to all traces
   */
  constructor(
    projectName: string = 'ace-framework',
    enableAutoConfig: boolean = true,
    tags?: string[]
  ) {
    this.projectName = projectName;
    this.tags = tags || ['ace-framework'];
    // Check both OPIK_AVAILABLE and env var before enabling
    this.enabled = OPIK_AVAILABLE && !_shouldSkipOpik();

    if (this.enabled && enableAutoConfig) {
      try {
        // Configure Opik for local use without interactive prompts
        // Set environment variables to prevent prompts
        process.env.OPIK_URL_OVERRIDE = process.env.OPIK_URL_OVERRIDE || 'http://localhost:5173';
        process.env.OPIK_WORKSPACE = process.env.OPIK_WORKSPACE || 'default';

        if (opikModule && opikModule.configure) {
          opikModule.configure({ useLocal: true });
          console.log(`Opik configured locally for project: ${projectName}`);
        }
      } catch (error) {
        console.debug(`Opik configuration skipped: ${error}`);
        this.enabled = false;
      }
    } else if (!OPIK_AVAILABLE) {
      console.debug(
        'Opik not available. Install with: npm install @opik/sdk'
      );
    }
  }

  /**
   * Log bullet evolution metrics to Opik.
   */
  logBulletEvolution(
    bulletId: string,
    bulletContent: string,
    helpfulCount: number,
    harmfulCount: number,
    neutralCount: number,
    section: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled || !opikContext) {
      return;
    }

    try {
      // Calculate effectiveness score
      const totalVotes = helpfulCount + harmfulCount + neutralCount;
      const effectiveness = totalVotes > 0 ? helpfulCount / totalVotes : 0.0;

      // Update current trace with bullet metrics
      opikContext.updateCurrentTrace({
        feedbackScores: [
          {
            name: 'bullet_effectiveness',
            value: effectiveness,
            reason: `Bullet ${bulletId}: ${helpfulCount}H/${harmfulCount}H/${neutralCount}N`,
          },
        ],
        metadata: {
          bullet_id: bulletId,
          bullet_content: bulletContent,
          section: section,
          helpful_count: helpfulCount,
          harmful_count: harmfulCount,
          neutral_count: neutralCount,
          total_votes: totalVotes,
          ...(metadata || {}),
        },
        tags: [...this.tags, 'bullet-evolution'],
      });
    } catch (error) {
      console.error(`Failed to log bullet evolution: ${error}`);
    }
  }

  /**
   * Log playbook update metrics to Opik.
   */
  logPlaybookUpdate(
    operationType: string,
    bulletsAdded: number = 0,
    bulletsUpdated: number = 0,
    bulletsRemoved: number = 0,
    totalBullets: number = 0,
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled || !opikContext) {
      return;
    }

    try {
      opikContext.updateCurrentTrace({
        feedbackScores: [
          {
            name: 'playbook_size',
            value: totalBullets,
            reason: `Playbook contains ${totalBullets} bullets after ${operationType}`,
          },
        ],
        metadata: {
          operation_type: operationType,
          bullets_added: bulletsAdded,
          bullets_updated: bulletsUpdated,
          bullets_removed: bulletsRemoved,
          total_bullets: totalBullets,
          ...(metadata || {}),
        },
        tags: [...this.tags, 'playbook-update'],
      });
    } catch (error) {
      console.error(`Failed to log playbook update: ${error}`);
    }
  }

  /**
   * Log ACE role performance metrics.
   */
  logRolePerformance(
    roleName: string,
    executionTime: number,
    success: boolean,
    inputData?: Record<string, any>,
    outputData?: Record<string, any>,
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled || !opikContext) {
      return;
    }

    try {
      opikContext.updateCurrentTrace({
        feedbackScores: [
          {
            name: 'role_success',
            value: success ? 1.0 : 0.0,
            reason: `${roleName} ${success ? 'succeeded' : 'failed'} in ${executionTime.toFixed(2)}s`,
          },
          {
            name: 'execution_time',
            value: executionTime,
            reason: `${roleName} execution time in seconds`,
          },
        ],
        metadata: {
          role_name: roleName,
          execution_time: executionTime,
          success: success,
          input_data: inputData,
          output_data: outputData,
          ...(metadata || {}),
        },
        tags: [...this.tags, `role-${roleName.toLowerCase()}`],
      });
    } catch (error) {
      console.error(`Failed to log role performance: ${error}`);
    }
  }

  /**
   * Log adaptation training metrics.
   */
  logAdaptationMetrics(
    epoch: number,
    step: number,
    performanceScore: number,
    bulletCount: number,
    successfulPredictions: number,
    totalPredictions: number,
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled || !opikContext) {
      return;
    }

    try {
      const accuracy =
        totalPredictions > 0 ? successfulPredictions / totalPredictions : 0.0;

      opikContext.updateCurrentTrace({
        feedbackScores: [
          {
            name: 'performance_score',
            value: performanceScore,
            reason: `Epoch ${epoch}, Step ${step} performance`,
          },
          {
            name: 'accuracy',
            value: accuracy,
            reason: `Accuracy: ${successfulPredictions}/${totalPredictions}`,
          },
        ],
        metadata: {
          epoch: epoch,
          step: step,
          performance_score: performanceScore,
          bullet_count: bulletCount,
          successful_predictions: successfulPredictions,
          total_predictions: totalPredictions,
          accuracy: accuracy,
          ...(metadata || {}),
        },
        tags: [...this.tags, 'adaptation-training'],
      });
    } catch (error) {
      console.error(`Failed to log adaptation metrics: ${error}`);
    }
  }

  /**
   * Create an Opik experiment for evaluation.
   */
  createExperiment(
    name: string,
    description: string = '',
    metadata?: Record<string, any>
  ): void {
    if (!this.enabled || !opikContext) {
      return;
    }

    try {
      // Opik experiments are automatically created when logging
      // We'll use trace metadata to organize experiments
      opikContext.updateCurrentTrace({
        metadata: {
          experiment_name: name,
          experiment_description: description,
          experiment_timestamp: new Date().toISOString(),
          ...(metadata || {}),
        },
        tags: [...this.tags, 'experiment', `exp-${name}`],
      });
      console.log(`Opik experiment created: ${name}`);
    } catch (error) {
      console.error(`Failed to create experiment: ${error}`);
    }
  }

  /**
   * Check if Opik integration is available and configured.
   */
  isAvailable(): boolean {
    return this.enabled;
  }
}

// Global integration instance
let _globalIntegration: OpikIntegration | null = null;

/**
 * Get or create global Opik integration instance.
 */
export function getIntegration(): OpikIntegration {
  if (_globalIntegration === null) {
    if (_shouldSkipOpik()) {
      // Return disabled integration
      _globalIntegration = new OpikIntegration('ace-framework', false);
      _globalIntegration.enabled = false;
    } else {
      _globalIntegration = new OpikIntegration();
    }
  }
  return _globalIntegration;
}

/**
 * Configure global Opik integration.
 */
export function configureOpik(
  projectName: string = 'ace-framework',
  tags?: string[]
): OpikIntegration {
  if (_shouldSkipOpik()) {
    // Return disabled integration when OPIK_DISABLED is set
    console.debug(
      'Opik configuration skipped via OPIK_DISABLED environment variable'
    );
    _globalIntegration = new OpikIntegration(projectName, false, tags);
    _globalIntegration.enabled = false;
  } else {
    _globalIntegration = new OpikIntegration(projectName, true, tags);
  }
  return _globalIntegration;
}

/**
 * Check if Opik is available in the environment.
 */
export function isOpikAvailable(): boolean {
  return OPIK_AVAILABLE;
}
