/**
 * Operator Framework — Base Class
 *
 * Abstract base class that all concrete operators extend. Provides:
 * - Configuration management
 * - Lifecycle hooks (initialize, execute, pause, resume, teardown)
 * - State management (memory, metrics)
 * - Workflow creation helpers
 * - Integration access patterns
 *
 * Phase 8.1.1 — Operator Base Class
 */

import type { WorkflowDefinition } from "../engine/types";
import type {
  OperatorConfiguration,
  OperatorMetrics,
  OperatorMemory,
  OperatorLearning,
  OperatorStatus,
  OperatorType,
} from "./types";

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

/**
 * Abstract base class for all Unimble operators.
 *
 * Concrete operators (Content, Growth, Community, etc.) extend this class
 * and implement the abstract methods to define their specific behavior.
 */
export abstract class OperatorBase {
  protected config: OperatorConfiguration;
  protected metrics: OperatorMetrics;
  protected memory: OperatorMemory;
  protected status: OperatorStatus;

  constructor(config: OperatorConfiguration) {
    this.config = config;
    this.status = "draft";
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalCostUsd: 0,
      avgDurationMs: 0,
      custom: {},
    };
    this.memory = {
      learnings: [],
      preferences: {},
      executionHistory: [],
      custom: {},
    };
  }

  // -------------------------------------------------------------------------
  // Abstract methods — must be implemented by concrete operators
  // -------------------------------------------------------------------------

  /** Returns the operator type identifier. */
  abstract getType(): OperatorType;

  /** Returns the default workflows this operator creates on deployment. */
  abstract getDefaultWorkflows(): WorkflowDefinition[];

  /** Validates that the configuration is complete and correct. */
  abstract validateConfig(): { valid: boolean; errors: string[] };

  /** Returns the integrations required for this operator to function. */
  abstract getRequiredIntegrations(): string[];

  // -------------------------------------------------------------------------
  // Lifecycle methods
  // -------------------------------------------------------------------------

  /** Called when the operator is first deployed. */
  async initialize(): Promise<void> {
    const validation = this.validateConfig();
    if (!validation.valid) {
      throw new Error(`Operator configuration invalid: ${validation.errors.join(", ")}`);
    }
    this.status = "active";
  }

  /** Pauses the operator (stops scheduled executions). */
  async pause(): Promise<void> {
    this.status = "paused";
  }

  /** Resumes a paused operator. */
  async resume(): Promise<void> {
    if (this.status !== "paused") {
      throw new Error(`Cannot resume operator in status: ${this.status}`);
    }
    this.status = "active";
  }

  /** Tears down the operator (cleanup). */
  async teardown(): Promise<void> {
    this.status = "archived";
  }

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------

  /** Returns current operator status. */
  getStatus(): OperatorStatus {
    return this.status;
  }

  /** Returns current metrics. */
  getMetrics(): OperatorMetrics {
    return { ...this.metrics };
  }

  /** Returns current memory state. */
  getMemory(): OperatorMemory {
    return { ...this.memory };
  }

  /** Records a successful execution. */
  recordExecution(durationMs: number, costUsd: number): void {
    this.metrics.totalExecutions += 1;
    this.metrics.successfulExecutions += 1;
    this.metrics.totalCostUsd += costUsd;
    this.metrics.lastExecutionAt = Date.now();

    // Rolling average
    const n = this.metrics.totalExecutions;
    this.metrics.avgDurationMs = (this.metrics.avgDurationMs * (n - 1) + durationMs) / n;
  }

  /** Records a failed execution. */
  recordFailure(durationMs: number, costUsd: number): void {
    this.metrics.totalExecutions += 1;
    this.metrics.failedExecutions += 1;
    this.metrics.totalCostUsd += costUsd;
    this.metrics.lastExecutionAt = Date.now();

    const n = this.metrics.totalExecutions;
    this.metrics.avgDurationMs = (this.metrics.avgDurationMs * (n - 1) + durationMs) / n;
  }

  /** Adds a learning to operator memory. */
  addLearning(learning: Omit<OperatorLearning, "id" | "learnedAt">): void {
    this.memory.learnings.push({
      ...learning,
      id: `learn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      learnedAt: Date.now(),
    });

    // Keep only last 100 learnings
    if (this.memory.learnings.length > 100) {
      this.memory.learnings = this.memory.learnings.slice(-100);
    }
  }

  /** Increments a custom metric. */
  incrementMetric(key: string, amount = 1): void {
    this.metrics.custom[key] = (this.metrics.custom[key] ?? 0) + amount;
  }

  // -------------------------------------------------------------------------
  // Configuration access
  // -------------------------------------------------------------------------

  /** Returns the operator configuration. */
  getConfig(): OperatorConfiguration {
    return { ...this.config };
  }

  /** Updates operator settings (partial merge). */
  updateSettings(settings: Record<string, unknown>): void {
    this.config.settings = { ...this.config.settings, ...settings };
  }
}
