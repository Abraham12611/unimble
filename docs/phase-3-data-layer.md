# Phase 3 — Core Data Layer: Completion Summary

> Phase 3 establishes the data foundation for all Unimble features: schema design, validation, CRUD operations, real-time subscriptions, and comprehensive testing.

**Status**: ✅ Complete
**Duration**: Phase 3.1–3.6
**Branch history**: `feat/UNI-M3-schema-expansion`, `feat/UNI-M3-data-validation`, `feat/UNI-M3-crud-operations`, `feat/UNI-M3-realtime-subscriptions`

---

## Database Schema (13 tables)

| Table              | Purpose                              | Indexes                                                                                               |
| ------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `users`            | Clerk-synced user accounts           | by_clerk_id, by_email                                                                                 |
| `organizations`    | Top-level org containers             | by_slug, by_owner, by_status, by_owner_and_status                                                     |
| `workspaces`       | Isolated environments per team       | by_slug, by_organization, by_owner, by_status, by_owner_and_status                                    |
| `workspaceMembers` | Team membership with roles           | by_workspace, by_user, by_invited_by, by_workspace_and_user                                           |
| `workspaceInvites` | Pending team invitations             | by_workspace, by_invited_by, by_workspace_and_email, by_expires_at                                    |
| `operators`        | AI operator instances                | by_workspace, by_status, by_workspace_and_status                                                      |
| `workflows`        | Workflow definitions with versioning | by_workspace, by_operator, by_workspace_and_operator, by_status, by_workspace_and_status              |
| `workflowVersions` | Immutable version history            | by_workflow, by_workspace, by_workflow_and_version                                                    |
| `executions`       | Workflow execution records           | by_workspace, by_operator, by_workflow, by_status, by_workspace_and_status, by_workspace_and_operator |
| `executionSteps`   | Step-level tracking                  | by_execution, by_status, by_execution_and_status                                                      |
| `integrations`     | External service connections         | by_workspace, by_provider, by_status, by_workspace_and_provider                                       |
| `approvals`        | Human approval gates                 | by_execution, by_status, by_requested_at, by_execution_and_status                                     |
| `events`           | Audit log                            | by_workspace, by_user, by_timestamp, by_workspace_and_type, by_workspace_and_resource                 |
| `learnings`        | Autonomous learning observations     | by_workspace, by_type, by_status                                                                      |

---

## API Functions

### Users (`users.ts`)

| Function           | Type              | Auth          | Description                            |
| ------------------ | ----------------- | ------------- | -------------------------------------- |
| `upsertFromClerk`  | internal mutation | —             | Create/update user from Clerk webhook  |
| `deleteByClerkId`  | internal mutation | —             | Cascade delete user + owned workspaces |
| `getCurrentUser`   | query             | authenticated | Get current user                       |
| `listUsers`        | query             | creator       | Paginated user list                    |
| `getUserById`      | internal query    | —             | Lookup by Convex ID                    |
| `getUserByClerkId` | internal query    | —             | Lookup by Clerk ID                     |
| `updateUser`       | mutation          | authenticated | Update own profile                     |
| `setPlatformRole`  | mutation          | creator       | Assign platform roles                  |

### Organizations (`organizations.ts`)

| Function                | Type     | Auth          | Description                         |
| ----------------------- | -------- | ------------- | ----------------------------------- |
| `createOrganization`    | mutation | authenticated | Create org with auto-slug           |
| `getOrganization`       | query    | owner/creator | Get by ID                           |
| `getOrganizationBySlug` | query    | owner/creator | Get by slug                         |
| `listOrganizations`     | query    | owner/creator | List user's orgs (creator sees all) |
| `updateOrganization`    | mutation | owner/creator | Update org fields                   |
| `deleteOrganization`    | mutation | owner/creator | Delete org, unlink workspaces       |

### Workspaces (`workspaces.ts`)

| Function                | Type     | Auth          | Description                     |
| ----------------------- | -------- | ------------- | ------------------------------- |
| `createWorkspace`       | mutation | authenticated | Create workspace with auto-slug |
| `getWorkspace`          | query    | member+       | Get by ID                       |
| `listWorkspaces`        | query    | member+       | List accessible workspaces      |
| `updateWorkspace`       | mutation | owner/creator | Update workspace fields         |
| `deleteWorkspace`       | mutation | owner/creator | Cascade delete all children     |
| `inviteWorkspaceMember` | mutation | owner/creator | Send invite by email            |
| `acceptWorkspaceInvite` | mutation | authenticated | Accept pending invite           |
| `listWorkspaceInvites`  | query    | owner/creator | List pending invites            |
| `listWorkspaceMembers`  | query    | member+       | List team members               |
| `removeWorkspaceMember` | mutation | owner/creator | Remove member (not owner)       |

### Operators (`operators.ts`)

| Function         | Type     | Auth          | Description                         |
| ---------------- | -------- | ------------- | ----------------------------------- |
| `createOperator` | mutation | owner/creator | Create operator with validation     |
| `getOperator`    | query    | member+       | Get by ID                           |
| `listOperators`  | query    | member+       | List workspace operators            |
| `updateOperator` | mutation | owner/creator | Update operator fields              |
| `pauseOperator`  | mutation | owner/creator | Set status to paused                |
| `resumeOperator` | mutation | owner/creator | Set status to active                |
| `deleteOperator` | mutation | owner/creator | Delete, unlink workflows/executions |

### Workflows (`workflows.ts`)

| Function               | Type     | Auth          | Description                                        |
| ---------------------- | -------- | ------------- | -------------------------------------------------- |
| `createWorkflow`       | mutation | owner/creator | Create with version 1                              |
| `getWorkflow`          | query    | member+       | Get by ID                                          |
| `listWorkflows`        | query    | member+       | List workspace workflows                           |
| `updateWorkflow`       | mutation | owner/creator | Update + auto-increment version                    |
| `duplicateWorkflow`    | mutation | owner/creator | Clone workflow                                     |
| `deleteWorkflow`       | mutation | owner/creator | Cascade delete versions/executions/steps/approvals |
| `listWorkflowVersions` | query    | member+       | Version history                                    |

### Executions (`executions.ts`)

| Function                    | Type     | Auth          | Description                                |
| --------------------------- | -------- | ------------- | ------------------------------------------ |
| `createExecution`           | mutation | owner/creator | Create execution record                    |
| `getExecution`              | query    | member+       | Get by ID                                  |
| `listExecutions`            | query    | member+       | List by workspace, optional status filter  |
| `updateExecutionStatus`     | mutation | owner/creator | Transition status (guards terminal states) |
| `cancelExecution`           | mutation | owner/creator | Cancel queued/running only                 |
| `retryExecution`            | mutation | owner/creator | Retry terminal, clears steps + approvals   |
| `createExecutionStep`       | mutation | owner/creator | Add step (guards terminal)                 |
| `getExecutionStep`          | query    | member+       | Get step by ID                             |
| `listExecutionSteps`        | query    | member+       | List steps, optional status filter         |
| `updateExecutionStepStatus` | mutation | owner/creator | Update step status (guards terminal)       |
| `createExecutionApproval`   | mutation | owner/creator | Create approval (guards terminal)          |
| `respondExecutionApproval`  | mutation | owner/creator | Approve/reject (validated, idempotent)     |
| `listExecutionApprovals`    | query    | member+       | List approvals, optional status filter     |

### Onboarding (`onboarding.ts`)

| Function             | Type     | Auth          | Description                                                 |
| -------------------- | -------- | ------------- | ----------------------------------------------------------- |
| `completeOnboarding` | mutation | authenticated | 5-step wizard: creates user, workspace, membership, invites |

---

## Validation Layer

### Zod Validators (`convex/validators/`)

- `organization.ts` — name (1-120 chars), slug, plan, status, settings
- `workspace.ts` — name (1-120 chars), slug, description, plan, status, settings
- `operator.ts` — workspaceId, type, name (1-120 chars), description, config, status
- `workflow.ts` — workspaceId, operatorId, name (1-120 chars), trigger, steps, status, version
- `execution.ts` — workspaceId, workflowId, operatorId, status, input
- `integration.ts` — workspaceId, provider, name, config, status

### Convex Argument Validators (`argValidators.ts`)

Reusable validators for common field types: `stringField`, `optionalString`, `optionalNullableString`, `workspaceId`, `operatorId`, `workflowId`, `executionId`, `organizationId`, `userId`, `platformRole`, `paginationOpts`.

---

## Real-time Subscriptions

### React Hooks (`convexHooks.ts`)

| Hook                                         | Subscription              |
| -------------------------------------------- | ------------------------- |
| `useWorkspaces()`                            | All accessible workspaces |
| `useOperators(workspaceId)`                  | Operators in workspace    |
| `useWorkflows(workspaceId)`                  | Workflows in workspace    |
| `useExecutions(workspaceId)`                 | Executions in workspace   |
| `useExecutionSteps(executionId)`             | Steps in execution        |
| `useExecutionApprovals(executionId, status)` | Approvals by status       |

All hooks return `undefined` while loading and skip queries when IDs are not provided.

---

## Authorization Model

### Platform Roles

| Role      | Permissions                                                       |
| --------- | ----------------------------------------------------------------- |
| `user`    | Standard access, scoped to owned/member workspaces                |
| `creator` | Platform admin — sees all workspaces, all users, can assign roles |

### Workspace Access Levels

| Level              | Can Read | Can Mutate | Can Delete |
| ------------------ | -------- | ---------- | ---------- |
| Owner              | ✅       | ✅         | ✅         |
| Member             | ✅       | ❌         | ❌         |
| Stranger           | ❌       | ❌         | ❌         |
| Creator (platform) | ✅       | ✅         | ✅         |

---

## Test Coverage

**37 tests passing** across all modules:

| Module           | Tests  | Coverage             |
| ---------------- | ------ | -------------------- |
| RBAC             | 5      | 100% statements      |
| Validators (Zod) | 9      | 100% statements      |
| Arg Validators   | 2      | 100% statements      |
| Organizations    | 2      | 75.6% statements     |
| Workspaces       | 3      | 77.3% statements     |
| Operators        | 2      | 80.5% statements     |
| Workflows        | 3      | 81.7% statements     |
| Executions       | 11     | 80.7% statements     |
| **Overall**      | **37** | **66.5% statements** |

Coverage gap is from untested integration files (`users.ts`, `webhooks.ts`, `onboarding.ts`, `auth.config.ts`, `http.ts`) which depend on Clerk's runtime context. All unit-testable code exceeds 75%.

---

## Key Design Decisions

1. **Terminal state guards**: All state-mutating functions reject operations on completed/failed/canceled executions. Only `retryExecution` can leave a terminal state (and it clears orphaned steps + approvals).
2. **Automatic versioning**: Every workflow update creates an immutable `workflowVersions` entry.
3. **Cascade deletes**: Deleting a workspace cascades to members, invites, operators, workflows (+ versions + executions + steps + approvals), integrations, events, and learnings.
4. **Idempotent approval responses**: Responding with the same status is a no-op; responding with a different status after already responded throws an error.
5. **Auto-slug generation**: Workspaces and organizations generate URL-safe slugs with collision handling (up to 25 attempts).
