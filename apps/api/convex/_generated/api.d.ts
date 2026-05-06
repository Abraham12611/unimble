/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as argValidators from "../argValidators.js";
import type * as executions from "../executions.js";
import type * as http from "../http.js";
import type * as integrationActions from "../integrationActions.js";
import type * as integrations from "../integrations.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_composio from "../lib/composio.js";
import type * as lib_integrationRegistry from "../lib/integrationRegistry.js";
import type * as onboarding from "../onboarding.js";
import type * as operators from "../operators.js";
import type * as organizations from "../organizations.js";
import type * as rbac from "../rbac.js";
import type * as users from "../users.js";
import type * as validators_execution from "../validators/execution.js";
import type * as validators_index from "../validators/index.js";
import type * as validators_integration from "../validators/integration.js";
import type * as validators_operator from "../validators/operator.js";
import type * as validators_organization from "../validators/organization.js";
import type * as validators_workflow from "../validators/workflow.js";
import type * as validators_workspace from "../validators/workspace.js";
import type * as webhooks from "../webhooks.js";
import type * as workflows from "../workflows.js";
import type * as workspaces from "../workspaces.js";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  argValidators: typeof argValidators;
  executions: typeof executions;
  http: typeof http;
  integrationActions: typeof integrationActions;
  integrations: typeof integrations;
  "lib/auth": typeof lib_auth;
  "lib/composio": typeof lib_composio;
  "lib/integrationRegistry": typeof lib_integrationRegistry;
  onboarding: typeof onboarding;
  operators: typeof operators;
  organizations: typeof organizations;
  rbac: typeof rbac;
  users: typeof users;
  "validators/execution": typeof validators_execution;
  "validators/index": typeof validators_index;
  "validators/integration": typeof validators_integration;
  "validators/operator": typeof validators_operator;
  "validators/organization": typeof validators_organization;
  "validators/workflow": typeof validators_workflow;
  "validators/workspace": typeof validators_workspace;
  webhooks: typeof webhooks;
  workflows: typeof workflows;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {};
