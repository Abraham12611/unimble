/**
 * Operator Framework — Operator Deployment
 *
 * Handles the deployment lifecycle:
 * - Validates deployment input against template schema
 * - Creates the operator record in Convex
 * - Creates default workflows for the operator
 * - Sets up initial schedules
 * - Returns deployment result with any warnings
 *
 * This module provides pure validation and configuration logic.
 * The actual Convex mutations that persist data are in the
 * parent operators.ts module — this module is called by those
 * mutations to validate and prepare the data.
 *
 * Phase 8.1.3 — Operator Deployment
 */

import { operatorRegistry } from "./registry";
import type {
  DeployOperatorInput,
  DeploymentValidationError,
  OperatorConfiguration,
  OperatorWorkflowTemplate,
} from "./types";

// ---------------------------------------------------------------------------
// Deployment Validation
// ---------------------------------------------------------------------------

/**
 * Validates a deployment request against the template's requirements.
 * Returns an array of errors (empty if valid).
 */
export function validateDeployment(input: DeployOperatorInput): DeploymentValidationError[] {
  const errors: DeploymentValidationError[] = [];

  // Check template exists
  const template = operatorRegistry.get(input.templateId);
  if (!template) {
    errors.push({
      field: "templateId",
      message: `Template "${input.templateId}" not found`,
    });
    return errors; // Can't validate further without a template
  }

  // Validate workspace ID
  if (!input.workspaceId || input.workspaceId.trim().length === 0) {
    errors.push({ field: "workspaceId", message: "Workspace ID is required" });
  }

  // Validate name (if provided)
  if (input.name !== undefined && input.name.trim().length === 0) {
    errors.push({ field: "name", message: "Operator name cannot be empty" });
  }

  // Validate required integrations
  for (const req of template.requiredIntegrations) {
    const connected = input.integrations.filter((i) => req.providers.includes(i.provider));
    if (connected.length === 0) {
      errors.push({
        field: `integrations.${req.category}`,
        message: `At least one ${req.category} integration is required (${req.providers.join(" or ")})`,
      });
    }
  }

  // Validate integration IDs are provided
  for (const integration of input.integrations) {
    if (!integration.integrationId || integration.integrationId.trim().length === 0) {
      errors.push({
        field: `integrations.${integration.provider}`,
        message: `Integration ID is required for ${integration.provider}`,
      });
    }
  }

  // Validate settings against schema
  for (const section of template.configSchema.sections) {
    for (const field of section.fields) {
      const value = input.settings[field.key];

      // Required check
      if (field.required && (value === undefined || value === null || value === "")) {
        errors.push({
          field: `settings.${field.key}`,
          message: `${field.label} is required`,
        });
        continue;
      }

      // Skip further validation if not provided
      if (value === undefined || value === null) continue;

      // Number validation — coerce strings to numbers for validation
      if (field.type === "number") {
        const numValue = typeof value === "number" ? value : Number(value);
        if (isNaN(numValue)) {
          errors.push({
            field: `settings.${field.key}`,
            message: `${field.label} must be a valid number`,
          });
        } else {
          if (field.validation?.min !== undefined && numValue < field.validation.min) {
            errors.push({
              field: `settings.${field.key}`,
              message: `${field.label} must be at least ${field.validation.min}`,
            });
          }
          if (field.validation?.max !== undefined && numValue > field.validation.max) {
            errors.push({
              field: `settings.${field.key}`,
              message: `${field.label} must be at most ${field.validation.max}`,
            });
          }
        }
      }

      // Select validation
      if (field.type === "select" && field.options) {
        const validValues = field.options.map((o) => o.value);
        if (!validValues.includes(value as string)) {
          errors.push({
            field: `settings.${field.key}`,
            message: `${field.label} must be one of: ${validValues.join(", ")}`,
          });
        }
      }
    }
  }

  // Validate schedules (if provided)
  if (input.schedules) {
    for (const schedule of input.schedules) {
      const workflow = template.defaultWorkflows.find((w) => w.id === schedule.workflowId);
      if (!workflow) {
        errors.push({
          field: `schedules.${schedule.workflowId}`,
          message: `Unknown workflow ID: ${schedule.workflowId}`,
        });
      }
      if (!schedule.cron || schedule.cron.trim().length === 0) {
        errors.push({
          field: `schedules.${schedule.workflowId}.cron`,
          message: "Cron expression is required",
        });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Configuration Building
// ---------------------------------------------------------------------------

/**
 * Builds the full operator configuration from deployment input.
 * Merges user settings with template defaults.
 */
export function buildOperatorConfiguration(input: DeployOperatorInput): OperatorConfiguration {
  const template = operatorRegistry.get(input.templateId);
  if (!template) {
    throw new Error(`Template "${input.templateId}" not found`);
  }

  // Merge settings with defaults, coercing number fields to actual numbers
  const settings: Record<string, unknown> = {};
  for (const section of template.configSchema.sections) {
    for (const field of section.fields) {
      const raw = input.settings[field.key] ?? field.default;
      if (field.type === "number" && raw !== undefined && raw !== null) {
        const coerced = typeof raw === "number" ? raw : Number(raw);
        settings[field.key] = isNaN(coerced) ? raw : coerced;
      } else {
        settings[field.key] = raw;
      }
    }
  }

  // Build integration configs
  const integrations = input.integrations.map((i) => {
    const isRequired = template.requiredIntegrations.some((r) => r.providers.includes(i.provider));
    const category = findCategory(i.provider, template);
    return {
      provider: i.provider,
      integrationId: i.integrationId,
      required: isRequired,
      category,
    };
  });

  // Build schedule configs
  const schedules =
    input.schedules ??
    template.defaultWorkflows
      .filter((w) => w.defaultCron)
      .map((w) => ({
        workflowId: w.id,
        cron: w.defaultCron!,
        timezone: "UTC",
        enabled: w.enabledByDefault,
      }));

  return {
    type: template.type,
    settings,
    integrations,
    schedules,
    persona: input.persona,
    approvalRequired: input.approvalRequired ?? true,
  };
}

/**
 * Prepares workflow creation data from the template.
 * Returns the workflow definitions that should be created for this operator.
 */
export function prepareWorkflows(input: DeployOperatorInput): Array<{
  templateWorkflow: OperatorWorkflowTemplate;
  cron?: string;
  timezone?: string;
  enabled: boolean;
}> {
  const template = operatorRegistry.get(input.templateId);
  if (!template) return [];

  return template.defaultWorkflows.map((wf) => {
    // Check if user provided a schedule override
    const scheduleOverride = input.schedules?.find((s) => s.workflowId === wf.id);

    return {
      templateWorkflow: wf,
      cron: scheduleOverride?.cron ?? wf.defaultCron,
      timezone: scheduleOverride?.timezone ?? "UTC",
      enabled: scheduleOverride?.enabled ?? wf.enabledByDefault,
    };
  });
}

/**
 * Generates deployment warnings (non-blocking issues).
 */
export function getDeploymentWarnings(input: DeployOperatorInput): string[] {
  const warnings: string[] = [];
  const template = operatorRegistry.get(input.templateId);
  if (!template) return warnings;

  // Warn about missing optional integrations
  for (const opt of template.optionalIntegrations) {
    const connected = input.integrations.filter((i) => opt.providers.includes(i.provider));
    if (connected.length === 0) {
      warnings.push(
        `Optional: Connect a ${opt.category} integration (${opt.providers.join(", ")}) for ${opt.description}`
      );
    }
  }

  // Warn if approval is disabled
  if (input.approvalRequired === false) {
    warnings.push("Approval is disabled — the operator will publish content without human review");
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCategory(
  provider: string,
  template: {
    requiredIntegrations: Array<{ category: string; providers: string[] }>;
    optionalIntegrations: Array<{ category: string; providers: string[] }>;
  }
): string {
  for (const group of [...template.requiredIntegrations, ...template.optionalIntegrations]) {
    if (group.providers.includes(provider)) return group.category;
  }
  return "other";
}
