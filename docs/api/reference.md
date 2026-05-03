# API Reference

Unimble's backend is built on [Convex](https://convex.dev). All data operations are performed through real-time Convex queries and mutations. There is no traditional REST API — clients use the Convex client SDK or the HTTP endpoint for server-side access.

## Authentication

All requests require a valid Clerk session token or a Convex service-level access token for server-to-server calls.

```typescript
import { ConvexHttpClient } from "convex/browser";
import { api } from "@unimble/api/_generated/api";

const client = new ConvexHttpClient(process.env.CONVEX_URL!);
client.setAuth(clerkToken);
```

---

## Workspaces

### `workspaces.getWorkspace`
Returns workspace by ID.

**Args:** `{ workspaceId: Id<"workspaces"> }`
**Returns:** `Workspace | null`

### `workspaces.getWorkspaceBySlug`
Returns workspace by URL slug.

**Args:** `{ slug: string }`
**Returns:** `Workspace | null`

### `workspaces.createWorkspace`
Creates a new workspace for the calling user.

**Args:** `{ name: string, slug: string, description?: string }`
**Returns:** `Id<"workspaces">`

---

## Operators

### `operators.listOperators`
Lists all operators in a workspace.

**Args:** `{ workspaceId: Id<"workspaces"> }`
**Returns:** `Operator[]`

### `operators.getOperator`
Returns a single operator.

**Args:** `{ id: Id<"operators"> }`
**Returns:** `Operator | null`

### `operators.deployOperator`
Deploys a new operator.

**Args:** `{ workspaceId: Id<"workspaces">, type: OperatorType, config: Record<string, unknown> }`
**Returns:** `Id<"operators">`

### `operators.pauseOperator` / `operators.resumeOperator`
Toggles operator active state.

**Args:** `{ id: Id<"operators"> }`
**Returns:** `null`

---

## Executions

### `executions.listExecutions`
Lists executions for a workspace with optional filters.

**Args:** `{ workspaceId: Id<"workspaces">, status?: string, limit?: number }`
**Returns:** `Execution[]`

### `executions.getExecution`
Returns execution with all steps.

**Args:** `{ id: Id<"executions"> }`
**Returns:** `ExecutionWithSteps | null`

### `executions.listExecutionApprovals`
Lists pending approval requests for a given execution.

**Args:** `{ executionId: Id<"executions">, status?: "pending" | "approved" | "rejected" }`
**Returns:** `ExecutionApproval[]`

---

## Workflows

### `workflows.listWorkflows`
Lists all workflows in a workspace.

**Args:** `{ workspaceId: Id<"workspaces"> }`
**Returns:** `Workflow[]`

### `workflows.createWorkflow`
Creates a new workflow.

**Args:** `{ workspaceId: Id<"workspaces">, name: string, trigger: WorkflowTrigger, steps: WorkflowStep[] }`
**Returns:** `Id<"workflows">`

---

## Organizations

### `organizations.getOrganization`
Returns organisation details.

**Args:** `{ organizationId: Id<"organizations"> }`
**Returns:** `Organization | null`

### `organizations.inviteMember`
Sends a workspace invitation.

**Args:** `{ workspaceId: Id<"workspaces">, email: string, role: "admin" | "member" | "viewer" }`
**Returns:** `Id<"invitations">`

---

## Rate limits

| Tier | Queries / minute | Mutations / minute |
|------|----------------|--------------------|
| Free | 100 | 50 |
| Pro | 1 000 | 500 |
| Enterprise | Unlimited | Unlimited |

Exceeding the limit returns a `rate_limited` error. Implement exponential back-off with jitter for retry logic.

---

## Error codes

| Code | Meaning |
|------|---------|
| `unauthorized` | Missing or invalid session token |
| `forbidden` | Valid token but insufficient workspace permissions |
| `not_found` | Requested resource does not exist |
| `rate_limited` | Too many requests — back off and retry |
| `integration_error` | Third-party integration failure |
| `validation_error` | Invalid argument shape |
