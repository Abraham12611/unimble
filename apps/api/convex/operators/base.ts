/**
 * Phase 8 — Pre-built Operators: abstract Operator base class.
 *
 * All operator implementations extend this class. It provides:
 *   - Zod-validated config parsing
 *   - Lifecycle hooks: deploy, pause, resume, destroy
 *   - Default workflow declarations (operator-specific)
 *   - Memory namespace for long-term memory isolation
 *   - Metric counters (executionsRun, errors, tokens, cost)
 *   - Required integration descriptors for UI discovery
 */

import { z } from "zod";
import type {
  BaseOperatorConfig,
  DeployResult,
  IntegrationDescriptor,
  OperatorMetrics,
  OperatorStatus,
  OperatorType,
  WorkflowDefinition,
} from "./types";
import { emptyMetrics } from "./types";

// ---------------------------------------------------------------------------
// Abstract base class
// ---------------------------------------------------------------------------

export abstract class Operator<
  TConfig extends BaseOperatorConfig = BaseOperatorConfig,
> {
  abstract readonly operatorType: OperatorType;
  abstract readonly version: string;
  abstract readonly displayName: string;
  abstract readonly description: string;

  abstract readonly configSchema: z.ZodType<TConfig>;
  abstract readonly memoryNamespace: string;
  abstract readonly requiredIntegrations: IntegrationDescriptor[];

  // Store raw config and parse lazily so that subclass field initializers
  // (configSchema) have time to run before we call .parse().
  private readonly _rawConfig: unknown;
  private _parsedConfig: TConfig | undefined;

  protected metrics: OperatorMetrics;
  protected status: OperatorStatus;

  constructor(rawConfig: unknown = {}) {
    this._rawConfig = rawConfig;
    this.metrics = emptyMetrics();
    this.status = "idle";
  }

  // ---------------------------------------------------------------------------
  // Abstract: operator-specific workflow declarations
  // ---------------------------------------------------------------------------

  abstract defaultWorkflows(): WorkflowDefinition[];

  // ---------------------------------------------------------------------------
  // Lifecycle hooks (called by deployOperator, pauseOperator, etc.)
  // ---------------------------------------------------------------------------

  async deploy(): Promise<DeployResult> {
    this.status = "active";
    return { operatorId: "", workflowIds: [] };
  }

  async pause(): Promise<void> {
    if (this.status !== "active") {
      throw new Error(`Cannot pause operator in status "${this.status}"`);
    }
    this.status = "paused";
  }

  async resume(): Promise<void> {
    if (this.status !== "paused") {
      throw new Error(`Cannot resume operator in status "${this.status}"`);
    }
    this.status = "active";
  }

  async destroy(): Promise<void> {
    this.status = "deleted";
  }

  // ---------------------------------------------------------------------------
  // Config / metrics accessors
  // ---------------------------------------------------------------------------

  getConfig(): TConfig {
    if (!this._parsedConfig) {
      this._parsedConfig = this.configSchema.parse(this._rawConfig);
    }
    return { ...this._parsedConfig };
  }

  getMetrics(): OperatorMetrics {
    return { ...this.metrics };
  }

  getStatus(): OperatorStatus {
    return this.status;
  }

  // ---------------------------------------------------------------------------
  // Metric mutation helpers
  // ---------------------------------------------------------------------------

  incrementRun(): void {
    this.metrics.executionsRun++;
    this.metrics.lastRunAt = Date.now();
  }

  incrementError(): void {
    this.metrics.errors++;
  }

  trackTokens(tokens: number, costUsd: number): void {
    this.metrics.tokensUsed += tokens;
    this.metrics.costUsd += costUsd;
  }

  // ---------------------------------------------------------------------------
  // Config validation (static helper used by deployOperator)
  // ---------------------------------------------------------------------------

  static validateConfig<T extends BaseOperatorConfig>(
    schema: z.ZodType<T>,
    raw: unknown
  ): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(raw);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      error: result.error.issues.map((i) => i.message).join("; "),
    };
  }
}
