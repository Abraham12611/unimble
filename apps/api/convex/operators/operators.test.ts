import { describe, it, expect, beforeEach } from "vitest";
import { operatorRegistry } from "./registry";
import {
  validateDeployment,
  buildOperatorConfiguration,
  prepareWorkflows,
  getDeploymentWarnings,
} from "./deployment";
import type { DeployOperatorInput, OperatorConfiguration, OperatorTemplate } from "./types";
import { OperatorBase } from "./operatorBase";
import type { OperatorType } from "./types";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createValidDeployInput(overrides?: Partial<DeployOperatorInput>): DeployOperatorInput {
  return {
    workspaceId: "ws_test_123",
    templateId: "content-operator",
    name: "My Content Operator",
    settings: {
      content_style: "technical",
      target_audience: "intermediate",
      weekly_content_target: 2,
      approval_required: true,
    },
    integrations: [{ provider: "wordpress", integrationId: "int_wp_123" }],
    approvalRequired: true,
    ...overrides,
  };
}

// Concrete implementation for testing
class TestOperator extends OperatorBase {
  private template: OperatorTemplate;

  constructor(config: OperatorConfiguration, template: OperatorTemplate) {
    super(config);
    this.template = template;
  }

  getTemplate(): OperatorTemplate {
    return this.template;
  }

  getType(): OperatorType {
    return this.template.type;
  }
}

// ---------------------------------------------------------------------------
// Phase 8.1.2 — Operator Registry Tests
// ---------------------------------------------------------------------------

describe("Operator Registry", () => {
  it("should have built-in templates registered", () => {
    expect(operatorRegistry.count()).toBeGreaterThanOrEqual(5);
  });

  it("should get content operator template", () => {
    const template = operatorRegistry.get("content-operator");
    expect(template).toBeDefined();
    expect(template!.type).toBe("content");
    expect(template!.name).toBe("Content Operator");
  });

  it("should get all built-in templates", () => {
    const templates = operatorRegistry.list();
    expect(templates.length).toBeGreaterThanOrEqual(5);

    const types = templates.map((t) => t.type);
    expect(types).toContain("content");
    expect(types).toContain("growth");
    expect(types).toContain("community");
    expect(types).toContain("feedback");
    expect(types).toContain("documentation");
  });

  it("should filter templates by type", () => {
    const contentTemplates = operatorRegistry.listByType("content");
    expect(contentTemplates).toHaveLength(1);
    expect(contentTemplates[0].id).toBe("content-operator");
  });

  it("should list featured templates", () => {
    const featured = operatorRegistry.listFeatured();
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((t) => t.featured)).toBe(true);
  });

  it("should check template existence", () => {
    expect(operatorRegistry.has("content-operator")).toBe(true);
    expect(operatorRegistry.has("nonexistent")).toBe(false);
  });

  it("should return undefined for unknown template", () => {
    expect(operatorRegistry.get("nonexistent")).toBeUndefined();
  });

  it("should register custom templates", () => {
    const custom: OperatorTemplate = {
      id: "test-custom-operator",
      type: "custom",
      name: "Test Custom",
      description: "A test operator",
      icon: "test",
      version: "1.0.0",
      capabilities: ["testing"],
      requiredIntegrations: [],
      optionalIntegrations: [],
      configSchema: { sections: [] },
      defaultSystemPrompt: "You are a test agent.",
      defaultTools: [],
      defaultWorkflows: [],
      metrics: [],
    };

    operatorRegistry.register(custom, "custom");
    expect(operatorRegistry.get("test-custom-operator")).toBeDefined();

    // Cleanup
    operatorRegistry.unregister("test-custom-operator");
    expect(operatorRegistry.get("test-custom-operator")).toBeUndefined();
  });

  it("should not unregister built-in templates", () => {
    const result = operatorRegistry.unregister("content-operator");
    expect(result).toBe(false);
    expect(operatorRegistry.has("content-operator")).toBe(true);
  });

  it("should have valid template structure", () => {
    const templates = operatorRegistry.list();
    for (const t of templates) {
      expect(t.id).toBeDefined();
      expect(t.type).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.description).toBeDefined();
      expect(t.version).toBeDefined();
      expect(t.configSchema).toBeDefined();
      expect(t.defaultSystemPrompt.length).toBeGreaterThan(0);
      expect(t.defaultWorkflows.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 8.1.3 — Operator Deployment Tests
// ---------------------------------------------------------------------------

describe("Operator Deployment", () => {
  describe("validateDeployment", () => {
    it("should pass for valid input", () => {
      const errors = validateDeployment(createValidDeployInput());
      expect(errors).toHaveLength(0);
    });

    it("should fail for unknown template", () => {
      const errors = validateDeployment(createValidDeployInput({ templateId: "nonexistent" }));
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("templateId");
    });

    it("should fail for missing required integration", () => {
      const errors = validateDeployment(createValidDeployInput({ integrations: [] }));
      expect(errors.some((e) => e.field.includes("integrations"))).toBe(true);
    });

    it("should fail for empty workspace ID", () => {
      const errors = validateDeployment(createValidDeployInput({ workspaceId: "" }));
      expect(errors.some((e) => e.field === "workspaceId")).toBe(true);
    });

    it("should fail for empty operator name", () => {
      const errors = validateDeployment(createValidDeployInput({ name: "" }));
      expect(errors.some((e) => e.field === "name")).toBe(true);
    });

    it("should fail for invalid number setting", () => {
      const errors = validateDeployment(
        createValidDeployInput({ settings: { weekly_content_target: 99 } })
      );
      expect(errors.some((e) => e.field === "settings.weekly_content_target")).toBe(true);
    });

    it("should fail for invalid select setting", () => {
      const errors = validateDeployment(
        createValidDeployInput({ settings: { content_style: "invalid_style" } })
      );
      expect(errors.some((e) => e.field === "settings.content_style")).toBe(true);
    });

    it("should fail for missing integration ID", () => {
      const errors = validateDeployment(
        createValidDeployInput({
          integrations: [{ provider: "wordpress", integrationId: "" }],
        })
      );
      expect(errors.some((e) => e.field.includes("integrations.wordpress"))).toBe(true);
    });

    it("should fail for unknown workflow in schedules", () => {
      const errors = validateDeployment(
        createValidDeployInput({
          schedules: [
            { workflowId: "nonexistent", cron: "0 9 * * *", timezone: "UTC", enabled: true },
          ],
        })
      );
      expect(errors.some((e) => e.field.includes("schedules"))).toBe(true);
    });
  });

  describe("buildOperatorConfiguration", () => {
    it("should build configuration with user settings", () => {
      const config = buildOperatorConfiguration(createValidDeployInput());

      expect(config.type).toBe("content");
      expect(config.settings.content_style).toBe("technical");
      expect(config.settings.weekly_content_target).toBe(2);
      expect(config.approvalRequired).toBe(true);
    });

    it("should use defaults for missing settings", () => {
      const config = buildOperatorConfiguration(createValidDeployInput({ settings: {} }));

      expect(config.settings.content_style).toBe("technical"); // default
      expect(config.settings.target_audience).toBe("intermediate"); // default
      expect(config.settings.weekly_content_target).toBe(2); // default
    });

    it("should include integration configs", () => {
      const config = buildOperatorConfiguration(createValidDeployInput());

      expect(config.integrations).toHaveLength(1);
      expect(config.integrations[0].provider).toBe("wordpress");
      expect(config.integrations[0].required).toBe(true);
      expect(config.integrations[0].category).toBe("cms");
    });

    it("should include default schedules", () => {
      const config = buildOperatorConfiguration(createValidDeployInput());

      expect(config.schedules.length).toBeGreaterThan(0);
      expect(config.schedules[0].workflowId).toBe("weekly-content-pipeline");
      expect(config.schedules[0].cron).toBe("0 9 * * MON");
    });

    it("should use schedule overrides when provided", () => {
      const config = buildOperatorConfiguration(
        createValidDeployInput({
          schedules: [
            {
              workflowId: "weekly-content-pipeline",
              cron: "0 10 * * TUE",
              timezone: "America/New_York",
              enabled: true,
            },
          ],
        })
      );

      expect(config.schedules[0].cron).toBe("0 10 * * TUE");
      expect(config.schedules[0].timezone).toBe("America/New_York");
    });

    it("should include persona when provided", () => {
      const config = buildOperatorConfiguration(
        createValidDeployInput({ persona: "Write like a senior engineer" })
      );

      expect(config.persona).toBe("Write like a senior engineer");
    });

    it("should throw for unknown template", () => {
      expect(() =>
        buildOperatorConfiguration(createValidDeployInput({ templateId: "nonexistent" }))
      ).toThrow();
    });
  });

  describe("prepareWorkflows", () => {
    it("should return workflow templates for the operator", () => {
      const workflows = prepareWorkflows(createValidDeployInput());

      expect(workflows.length).toBeGreaterThan(0);
      expect(workflows[0].templateWorkflow.id).toBe("weekly-content-pipeline");
      expect(workflows[0].cron).toBe("0 9 * * MON");
      expect(workflows[0].enabled).toBe(true);
    });

    it("should apply schedule overrides", () => {
      const workflows = prepareWorkflows(
        createValidDeployInput({
          schedules: [
            {
              workflowId: "weekly-content-pipeline",
              cron: "0 8 * * WED",
              timezone: "Europe/London",
              enabled: false,
            },
          ],
        })
      );

      const pipeline = workflows.find((w) => w.templateWorkflow.id === "weekly-content-pipeline");
      expect(pipeline!.cron).toBe("0 8 * * WED");
      expect(pipeline!.timezone).toBe("Europe/London");
      expect(pipeline!.enabled).toBe(false);
    });

    it("should return empty for unknown template", () => {
      const workflows = prepareWorkflows(createValidDeployInput({ templateId: "nonexistent" }));
      expect(workflows).toHaveLength(0);
    });
  });

  describe("getDeploymentWarnings", () => {
    it("should warn about missing optional integrations", () => {
      const warnings = getDeploymentWarnings(createValidDeployInput());

      // Content operator has optional social and analytics
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes("social"))).toBe(true);
    });

    it("should warn when approval is disabled", () => {
      const warnings = getDeploymentWarnings(createValidDeployInput({ approvalRequired: false }));

      expect(warnings.some((w) => w.includes("Approval is disabled"))).toBe(true);
    });

    it("should have no warnings when fully configured", () => {
      const warnings = getDeploymentWarnings(
        createValidDeployInput({
          integrations: [
            { provider: "wordpress", integrationId: "int_1" },
            { provider: "twitter", integrationId: "int_2" },
            { provider: "google_analytics", integrationId: "int_3" },
          ],
          approvalRequired: true,
        })
      );

      expect(warnings).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 8.1.1 — Operator Base Class Tests
// ---------------------------------------------------------------------------

describe("Operator Base Class", () => {
  let operator: TestOperator;
  let template: OperatorTemplate;

  beforeEach(() => {
    template = operatorRegistry.get("content-operator")!;
    const config: OperatorConfiguration = {
      type: "content",
      settings: { content_style: "technical", weekly_content_target: 2 },
      integrations: [
        { provider: "wordpress", integrationId: "int_1", required: true, category: "cms" },
      ],
      schedules: [
        {
          workflowId: "weekly-content-pipeline",
          cron: "0 9 * * MON",
          timezone: "UTC",
          enabled: true,
        },
      ],
      approvalRequired: true,
    };
    operator = new TestOperator(config, template);
  });

  describe("Configuration", () => {
    it("should return the template", () => {
      expect(operator.getTemplate().id).toBe("content-operator");
    });

    it("should return the type", () => {
      expect(operator.getType()).toBe("content");
    });

    it("should return the configuration", () => {
      const config = operator.getConfiguration();
      expect(config.type).toBe("content");
      expect(config.settings.content_style).toBe("technical");
    });

    it("should update settings", () => {
      operator.updateSettings({ content_style: "conversational" });
      expect(operator.getConfiguration().settings.content_style).toBe("conversational");
    });

    it("should validate deployment input", () => {
      const errors = operator.validateDeployment(createValidDeployInput());
      expect(errors).toHaveLength(0);
    });

    it("should catch invalid deployment input", () => {
      const errors = operator.validateDeployment(createValidDeployInput({ integrations: [] }));
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Agent Config", () => {
    it("should build agent config", () => {
      const agentConfig = operator.buildAgentConfig("op_123");

      expect(agentConfig.id).toBe("agent_op_123");
      expect(agentConfig.name).toContain("Content Operator");
      expect(agentConfig.systemPrompt).toContain("technical content creator");
      expect(agentConfig.mode).toBe("plan_execute");
      expect(agentConfig.tools.length).toBeGreaterThan(0);
    });

    it("should include custom persona in system prompt", () => {
      const config: OperatorConfiguration = {
        type: "content",
        settings: {},
        integrations: [],
        schedules: [],
        persona: "Always include Rust examples",
        approvalRequired: true,
      };
      const op = new TestOperator(config, template);
      const agentConfig = op.buildAgentConfig("op_456");

      expect(agentConfig.systemPrompt).toContain("Always include Rust examples");
    });
  });

  describe("Metrics", () => {
    it("should start with zero metrics", () => {
      const metrics = operator.getMetrics();
      expect(metrics.totalExecutions).toBe(0);
      expect(metrics.successfulExecutions).toBe(0);
      expect(metrics.totalCost).toBe(0);
    });

    it("should record successful executions", () => {
      operator.recordExecution(0.05, 3000);
      operator.recordExecution(0.03, 2000);

      const metrics = operator.getMetrics();
      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.successfulExecutions).toBe(2);
      expect(metrics.totalCost).toBeCloseTo(0.08);
    });

    it("should record failures", () => {
      operator.recordExecution(0.05, 3000);
      operator.recordFailure(0.01);

      const metrics = operator.getMetrics();
      expect(metrics.totalExecutions).toBe(2);
      expect(metrics.failedExecutions).toBe(1);
      expect(operator.getSuccessRate()).toBe(0.5);
    });

    it("should track custom metrics", () => {
      operator.updateCustomMetric("articles_published", 5);
      operator.incrementCustomMetric("articles_published", 2);

      expect(operator.getMetrics().custom.articles_published).toBe(7);
    });

    it("should return 0 success rate with no executions", () => {
      expect(operator.getSuccessRate()).toBe(0);
    });
  });

  describe("Memory", () => {
    it("should start with empty memory", () => {
      expect(operator.getMemory().learnings).toHaveLength(0);
    });

    it("should add learnings", () => {
      operator.addLearning("best_time", "Tuesday 10am EST");

      const memory = operator.getMemory();
      expect(memory.learnings).toHaveLength(1);
      expect(memory.learnings[0].key).toBe("best_time");
      expect(memory.learnings[0].value).toBe("Tuesday 10am EST");
      expect(memory.learnings[0].source).toBe("learned");
    });

    it("should update existing learnings", () => {
      operator.addLearning("best_time", "Tuesday 10am");
      operator.addLearning("best_time", "Wednesday 9am");

      const memory = operator.getMemory();
      expect(memory.learnings).toHaveLength(1);
      expect(memory.learnings[0].value).toBe("Wednesday 9am");
    });

    it("should remove learnings", () => {
      operator.addLearning("key1", "value1");
      operator.addLearning("key2", "value2");

      expect(operator.removeLearning("key1")).toBe(true);
      expect(operator.getMemory().learnings).toHaveLength(1);
      expect(operator.removeLearning("nonexistent")).toBe(false);
    });

    it("should get specific learnings", () => {
      operator.addLearning("best_format", "threads");

      expect(operator.getLearning("best_format")).toBe("threads");
      expect(operator.getLearning("nonexistent")).toBeUndefined();
    });

    it("should support different sources", () => {
      operator.addLearning("auto", "learned value", "learned");
      operator.addLearning("manual", "manual value", "manual");
      operator.addLearning("imported", "imported value", "imported");

      const memory = operator.getMemory();
      expect(memory.learnings.find((l) => l.key === "auto")!.source).toBe("learned");
      expect(memory.learnings.find((l) => l.key === "manual")!.source).toBe("manual");
      expect(memory.learnings.find((l) => l.key === "imported")!.source).toBe("imported");
    });
  });
});
