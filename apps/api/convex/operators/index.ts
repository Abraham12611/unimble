/**
 * Operator Framework — Module Exports
 *
 * Phase 8.1 — Operator Framework
 */

export { OperatorBase } from "./operatorBase";
export { operatorRegistry, OperatorRegistry } from "./registry";
export {
  validateDeployment,
  buildOperatorConfiguration,
  prepareWorkflows,
  getDeploymentWarnings,
} from "./deployment";
export type {
  OperatorType,
  OperatorStatus,
  OperatorTemplate,
  OperatorConfiguration,
  OperatorConfigSchema,
  OperatorSettingField,
  OperatorIntegrationConfig,
  OperatorScheduleConfig,
  OperatorWorkflowTemplate,
  OperatorMetricDefinition,
  OperatorMetrics,
  OperatorMemoryState,
  DeployOperatorInput,
  DeployOperatorResult,
  DeploymentValidationError,
  WorkflowTriggerType,
} from "./types";
