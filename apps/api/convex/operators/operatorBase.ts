/**
 * Operator Framework — Operator Base Class
 *
 * Defines the base behavior for all operators:
 * - Configuration validation
 * - Lifecycle management (deploy, pause, resume, archive)
 * - Workflow creation from templates
 * - Agent configuration building
 * - Metrics tracking
 * - Memory management
 *
 * Concrete operator types (ContentOperator, GrowthOperator, etc.)
 * extend this base and provide their specific templates, prompts,
 * and workflow logic.
 *
 * Phase 8.1.1 — Operator Base Class
 */

import type {
  OperatorType,
  OperatorTemplate,
  OperatorConfiguration,
  OperatorMetrics,
  OperatorMemoryState,
  DeployOperatorInput,
  DeploymentValidationError,
  OperatorSettingField,
} from "./types";
import type { AgentConfig } from "../agent/types";
import type { Persona } from "../agent/personas";

// ---------------------------------------------------------------------------
// Operator Base Class
// ---------------------------------------------------------------------------

/**
 * Base class for all operator types.
 *
 * Provides:
 * - Template access (config schema, defaults, workflows)
 * - Configuration validation
 * - Agent config building (from operator settings + persona)
 * - Metrics initialization
 * - Memory state management
 *
 * Subclasses override:
 * - getTemplate() — returns the operator's template definition
 * - buildAgentConfig() — customizes agent configuration
 * - getDefaultPersona() — returns the default persona (optional)
 */
export abstract class OperatorBase {
  protected config: OperatorConfiguration;
  protected metrics: OperatorMetrics;
  protected memory: OperatorMemoryState;

  constructor(config: OperatorConfiguration) {
    this.config = config;
    this.metrics = this.createInitialMetrics();
    this.memory = { learnings: [] };
  }

  // ---------------------------------------------------------------------------
  // Abstract methods (subclasses must implement)
  // ---------------------------------------------------------------------------

  /** Returns the operator template definition. */
  abstract getTemplate(): OperatorTemplate;

  /** Returns the operator type. */
  abstract getType(): OperatorType;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Validates deployment input against the template's config schema.
   * Returns an array of validation errors (empty if valid).
   */
  validateDeployment(input: DeployOperatorInput): DeploymentValidationError[] {
    const errors: DeploymentValidationError[] = [];
    const template = this.getTemplate();

    // Validate required integrations
    for (const req of template.requiredIntegrations) {
      const connected = input.integrations.filter((i) => req.providers.includes(i.provider));
      if (connected.length === 0) {
        errors.push({
          field: `integrations.${req.category}`,
          message: `At least one ${req.category} integration is required (${req.providers.join(", ")})`,
        });
      }
    }

    // Validate settings against schema
    for (const section of template.configSchema.sections) {
      for (const field of section.fields) {
        const value = input.settings[field.key];
        const fieldErrors = this.validateField(field, value);
        errors.push(...fieldErrors);
      }
    }

    // Validate name
    if (input.name && input.name.trim().length === 0) {
      errors.push({ field: "name", message: "Operator name cannot be empty" });
    }

    return errors;
  }

  /**
   * Builds the full operator configuration from deployment input.
   */
  buildConfiguration(input: DeployOperatorInput): OperatorConfiguration {
    const template = this.getTemplate();

    // Merge user settings with defaults
    const settings: Record<string, unknown> = {};
    for (const section of template.configSchema.sections) {
      for (const field of section.fields) {
        settings[field.key] = input.settings[field.key] ?? field.default;
      }
    }

    return {
      type: this.getType(),
      settings,
      integrations: input.integrations.map((i) => ({
        provider: i.provider,
        integrationId: i.integrationId,
        required: template.requiredIntegrations.some((r) => r.providers.includes(i.provider)),
        category: this.getCategoryForProvider(i.provider, template),
      })),
      schedules:
        input.schedules ??
        template.defaultWorkflows
          .filter((w) => w.defaultCron)
          .map((w) => ({
            workflowId: w.id,
            cron: w.defaultCron!,
            timezone: "UTC",
            enabled: w.enabledByDefault,
          })),
      persona: input.persona,
      approvalRequired: input.approvalRequired ?? true,
    };
  }

  // ---------------------------------------------------------------------------
  // Agent Configuration
  // ---------------------------------------------------------------------------

  /**
   * Builds an AgentConfig for this operator's primary agent.
   * Can be overridden by subclasses for custom agent behavior.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildAgentConfig(operatorId: string, persona?: Persona): AgentConfig {
    const template = this.getTemplate();

    let systemPrompt = template.defaultSystemPrompt;
    if (this.config.persona) {
      systemPrompt += `\n\n## Custom Instructions\n${this.config.persona}`;
    }

    return {
      id: `agent_${operatorId}`,
      name: `${template.name} Agent`,
      description: template.description,
      systemPrompt,
      modelTier: "generation",
      mode: "plan_execute",
      tools: template.defaultTools,
      memoryCategories: ["workspace", "operator"],
      temperature: 0.7,
      maxIterations: 15,
    };
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  /** Returns the current metrics. */
  getMetrics(): OperatorMetrics {
    return { ...this.metrics };
  }

  /** Records a successful execution. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  recordExecution(cost: number, durationMs: number): void {
    this.metrics.totalExecutions++;
    this.metrics.successfulExecutions++;
    this.metrics.totalCost += cost;
    this.metrics.lastExecutionAt = Date.now();
  }

  /** Records a failed execution. */
  recordFailure(cost: number): void {
    this.metrics.totalExecutions++;
    this.metrics.failedExecutions++;
    this.metrics.totalCost += cost;
    this.metrics.lastExecutionAt = Date.now();
  }

  /** Returns the success rate (0-1). */
  getSuccessRate(): number {
    if (this.metrics.totalExecutions === 0) return 0;
    return this.metrics.successfulExecutions / this.metrics.totalExecutions;
  }

  /** Updates a custom metric value. */
  updateCustomMetric(key: string, value: number): void {
    this.metrics.custom[key] = value;
  }

  /** Increments a custom counter metric. */
  incrementCustomMetric(key: string, amount: number = 1): void {
    this.metrics.custom[key] = (this.metrics.custom[key] ?? 0) + amount;
  }

  // ---------------------------------------------------------------------------
  // Memory
  // ---------------------------------------------------------------------------

  /** Returns the current memory state. */
  getMemory(): OperatorMemoryState {
    return { ...this.memory, learnings: [...this.memory.learnings] };
  }

  /** Adds a learning to the operator's memory. */
  addLearning(
    key: string,
    value: string,
    source: "learned" | "manual" | "imported" = "learned"
  ): void {
    const now = Date.now();
    const existing = this.memory.learnings.find((l) => l.key === key);

    if (existing) {
      existing.value = value;
      existing.updatedAt = now;
    } else {
      this.memory.learnings.push({ key, value, source, createdAt: now, updatedAt: now });
    }
  }

  /** Removes a learning from memory. */
  removeLearning(key: string): boolean {
    const index = this.memory.learnings.findIndex((l) => l.key === key);
    if (index === -1) return false;
    this.memory.learnings.splice(index, 1);
    return true;
  }

  /** Gets a specific learning by key. */
  getLearning(key: string): string | undefined {
    return this.memory.learnings.find((l) => l.key === key)?.value;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Returns the current configuration. */
  getConfiguration(): OperatorConfiguration {
    return { ...this.config };
  }

  /** Updates the operator's settings. */
  updateSettings(settings: Record<string, unknown>): void {
    this.config.settings = { ...this.config.settings, ...settings };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private createInitialMetrics(): OperatorMetrics {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalCost: 0,
      custom: {},
    };
  }

  private validateField(field: OperatorSettingField, value: unknown): DeploymentValidationError[] {
    const errors: DeploymentValidationError[] = [];

    // Required check
    if (field.required && (value === undefined || value === null || value === "")) {
      errors.push({ field: `settings.${field.key}`, message: `${field.label} is required` });
      return errors;
    }

    // Skip further validation if not provided and not required
    if (value === undefined || value === null) return errors;

    // Type-specific validation
    if (field.type === "number" && typeof value === "number") {
      if (field.validation?.min !== undefined && value < field.validation.min) {
        errors.push({
          field: `settings.${field.key}`,
          message: `${field.label} must be at least ${field.validation.min}`,
        });
      }
      if (field.validation?.max !== undefined && value > field.validation.max) {
        errors.push({
          field: `settings.${field.key}`,
          message: `${field.label} must be at most ${field.validation.max}`,
        });
      }
    }

    if ((field.type === "text" || field.type === "textarea") && typeof value === "string") {
      if (field.validation?.minLength !== undefined && value.length < field.validation.minLength) {
        errors.push({
          field: `settings.${field.key}`,
          message: `${field.label} must be at least ${field.validation.minLength} characters`,
        });
      }
      if (field.validation?.maxLength !== undefined && value.length > field.validation.maxLength) {
        errors.push({
          field: `settings.${field.key}`,
          message: `${field.label} must be at most ${field.validation.maxLength} characters`,
        });
      }
    }

    if (field.type === "select" && field.options) {
      const validValues = field.options.map((o) => o.value);
      if (!validValues.includes(value as string)) {
        errors.push({
          field: `settings.${field.key}`,
          message: `${field.label} must be one of: ${validValues.join(", ")}`,
        });
      }
    }

    return errors;
  }

  private getCategoryForProvider(provider: string, template: OperatorTemplate): string {
    for (const req of [...template.requiredIntegrations, ...template.optionalIntegrations]) {
      if (req.providers.includes(provider)) return req.category;
    }
    return "other";
  }
}
