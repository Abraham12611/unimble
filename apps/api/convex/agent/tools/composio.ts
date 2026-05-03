/**
 * Phase 7 — Agent Runtime: Composio tool bridge.
 *
 * Maps Composio managed actions into the unified Tool interface, passing
 * workspace OAuth credentials and handling rate-limit responses.
 *
 * Design:
 *   - ComposioClient is injected (interface), making the bridge testable.
 *   - fetchActions() retrieves the action catalogue from Composio.
 *   - buildRegistry() wraps each action as a Tool and returns a ToolRegistry.
 *   - OAuth credentials are passed per-call via AgentContext.integrations.
 */

import type { AgentContext, JSONSchema, ToolResult } from "../types";
import { Tool, ToolRegistry } from "./index";

// ---------------------------------------------------------------------------
// Composio client interface
// ---------------------------------------------------------------------------

export interface ComposioAction {
  name: string;
  displayName: string;
  description: string;
  appName: string;
  parameters: JSONSchema;
}

export interface ComposioExecuteResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ComposioClient {
  /** List available actions, optionally filtered by app. */
  listActions(appNames?: string[]): Promise<ComposioAction[]>;
  /** Execute an action with given parameters and OAuth credentials. */
  executeAction(
    actionName: string,
    params: Record<string, unknown>,
    entityId: string,
    authCredentials?: Record<string, string>
  ): Promise<ComposioExecuteResult>;
}

// ---------------------------------------------------------------------------
// ComposioTool — wraps a single Composio action
// ---------------------------------------------------------------------------

export class ComposioTool extends Tool {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly schema: JSONSchema;
  private readonly appName: string;

  constructor(
    private readonly action: ComposioAction,
    private readonly client: ComposioClient
  ) {
    super();
    this.name = `composio_${action.name}`;
    this.description = `[${action.appName}] ${action.description}`;
    this.category = `composio:${action.appName.toLowerCase()}`;
    this.schema = action.parameters;
    this.appName = action.appName;
  }

  async execute(params: unknown, ctx: AgentContext): Promise<ToolResult> {
    // Extract OAuth credentials for this app from the execution context
    const integration = ctx.integrations.find(
      (i) => i.provider.toLowerCase() === this.appName.toLowerCase()
    );

    const credentials = integration?.credentialsRef
      ? { credentialsRef: integration.credentialsRef }
      : {};

    let result: ComposioExecuteResult;
    try {
      result = await this.client.executeAction(
        this.action.name,
        params as Record<string, unknown>,
        ctx.workspaceId,
        credentials as Record<string, string> | undefined
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
        return {
          success: false,
          output: null,
          error: "Rate limit reached for this integration. Retry after a short wait.",
          metadata: { rateLimited: true, app: this.appName },
        };
      }
      throw err;
    }

    if (!result.success) {
      return {
        success: false,
        output: null,
        error: result.error ?? "Composio action failed",
        metadata: { app: this.appName, action: this.action.name },
      };
    }

    return {
      success: true,
      output: result.data,
      metadata: { app: this.appName, action: this.action.name },
    };
  }
}

// ---------------------------------------------------------------------------
// ComposioToolBridge
// ---------------------------------------------------------------------------

export interface ComposioToolBridgeConfig {
  /** Only load actions for these apps (e.g. ["github", "notion"]). All apps if omitted. */
  apps?: string[];
  /** Prefix added to every tool name. Default: "composio_" */
  prefix?: string;
  /** Max number of actions to load. Default: 100 */
  maxActions?: number;
}

export class ComposioToolBridge {
  constructor(
    private readonly client: ComposioClient,
    private readonly config: ComposioToolBridgeConfig = {}
  ) {}

  /**
   * Fetch available Composio actions and return a ToolRegistry populated
   * with a ComposioTool for each action.
   */
  async buildRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry();
    const max = this.config.maxActions ?? 100;

    let actions = await this.client.listActions(this.config.apps);
    if (actions.length > max) {
      actions = actions.slice(0, max);
    }

    for (const action of actions) {
      registry.register(new ComposioTool(action, this.client));
    }

    return registry;
  }

  /**
   * Merge Composio tools into an existing ToolRegistry (non-destructive).
   * Composio tools use the `composio_*` name prefix and do not overwrite
   * existing tools with plain names.
   */
  async mergeInto(existing: ToolRegistry): Promise<ToolRegistry> {
    const composio = await this.buildRegistry();
    for (const tool of composio.list()) {
      existing.register(tool);
    }
    return existing;
  }
}
