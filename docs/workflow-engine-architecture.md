# Workflow Engine Architecture

> Internal durable execution engine for AI operators. This document
> defines the execution model, state management, step types, and
> error handling strategies.
>
> **Key principle**: Workflows are internal. Users never see, build,
> or interact with workflows directly. Operators create and execute
> workflows behind the scenes to achieve user-defined goals.

---

## 1. Execution Model

### Overview

The workflow engine is built entirely on Convex primitives:

- **Mutations** for state transitions (transactional, durable)
- **Actions** for step execution (Node.js runtime, external calls)
- **Crons** for scheduled triggers
- **Internal functions** for the event bus
- **DB tables** for state persistence

No external orchestration service (Inngest, Temporal) is used.

### Execution Flow

```
Trigger (cron/event/manual)
  │
  ▼
Create Execution record (status: "queued")
  │
  ▼
Engine picks up execution → status: "running"
  │
  ▼
For each step in workflow definition:
  │
  ├─ Create ExecutionStep record (status: "queued")
  ├─ Resolve step inputs from previous outputs
  ├─ Execute step handler (action)
  ├─ Update step status + output
  │
  ├─ If step fails:
  │   ├─ Check retry policy
  │   ├─ If retries remaining → re-queue step
  │   └─ If exhausted → fail execution or skip
  │
  ├─ If step is approval gate:
  │   ├─ Create Approval record (status: "pending")
  │   ├─ Pause execution (status: "waiting_approval")
  │   └─ Resume when approval is responded to
  │
  └─ If step is conditional:
      └─ Evaluate condition → select branch
  │
  ▼
All steps complete → status: "completed"
```

### Why Convex-Native (No Inngest)

| Concern           | Convex Solution                       |
| ----------------- | ------------------------------------- |
| Durable execution | Mutations are transactional           |
| Retries           | Action retry + DB-tracked retry count |
| Scheduling        | Convex crons                          |
| State persistence | Convex DB (executions, steps)         |
| Event-driven      | Internal functions + mutations        |
| Observability     | DB records = full audit trail         |
| Cost              | No extra service billing              |

---

## 2. State Machine

### Execution States

```
queued → running → completed
                 → failed
                 → canceled
         running → waiting_approval → running (resumed)
                                    → canceled (timeout)
```

| State              | Description                           | Transitions To                                        |
| ------------------ | ------------------------------------- | ----------------------------------------------------- |
| `queued`           | Created, waiting to start             | `running`, `canceled`                                 |
| `running`          | Actively executing steps              | `completed`, `failed`, `canceled`, `waiting_approval` |
| `waiting_approval` | Paused at approval gate               | `running`, `canceled`                                 |
| `completed`        | All steps finished successfully       | (terminal)                                            |
| `failed`           | A step failed after retries exhausted | (terminal)                                            |
| `canceled`         | Manually or timeout canceled          | (terminal)                                            |

### Step States

```
queued → running → completed
                 → failed
                 → skipped
```

| State       | Description                  | Transitions To        |
| ----------- | ---------------------------- | --------------------- |
| `queued`    | Waiting to execute           | `running`, `skipped`  |
| `running`   | Currently executing          | `completed`, `failed` |
| `completed` | Finished successfully        | (terminal)            |
| `failed`    | Failed after retries         | (terminal)            |
| `skipped`   | Skipped (conditional branch) | (terminal)            |

---

## 3. Step Types

| Type          | Description                       | Runtime                     |
| ------------- | --------------------------------- | --------------------------- |
| `agent`       | LLM call with tools and memory    | Action (Node.js)            |
| `tool`        | Direct tool/integration call      | Action (Node.js)            |
| `conditional` | Evaluate condition, select branch | Mutation (V8)               |
| `loop`        | Iterate over a collection         | Mutation (V8)               |
| `parallel`    | Fan-out, execute concurrently     | Action (Node.js)            |
| `wait`        | Pause for duration or event       | Mutation + Cron             |
| `approval`    | Human approval gate               | Mutation (creates approval) |
| `transform`   | Data transformation               | Mutation (V8)               |

### Step Input Resolution

Steps can reference outputs from previous steps:

```json
{
  "input": {
    "topics": "{{steps.research.output.topics}}",
    "style": "{{workflow.config.contentStyle}}"
  }
}
```

The engine resolves `{{...}}` references before executing each step.

---

## 4. Retry Strategy

Each step can define its own retry policy:

```json
{
  "retry": {
    "maxAttempts": 3,
    "backoff": "exponential",
    "initialDelayMs": 1000,
    "maxDelayMs": 60000,
    "retryOn": ["rate_limit", "timeout", "server_error"],
    "failOn": ["auth_error", "validation_error"]
  }
}
```

### Backoff Strategies

| Strategy      | Formula                              |
| ------------- | ------------------------------------ |
| `fixed`       | `delay = initialDelayMs`             |
| `linear`      | `delay = initialDelayMs * attempt`   |
| `exponential` | `delay = initialDelayMs * 2^attempt` |

All strategies add random jitter (±20%) to prevent thundering herd.

---

## 5. Error Classification

| Category           | Retryable | Examples                      |
| ------------------ | --------- | ----------------------------- |
| `rate_limit`       | Yes       | 429 from APIs                 |
| `timeout`          | Yes       | Request timeout               |
| `server_error`     | Yes       | 500/502/503                   |
| `network_error`    | Yes       | DNS failure, connection reset |
| `auth_error`       | No        | 401/403, expired token        |
| `validation_error` | No        | Bad input, schema mismatch    |
| `not_found`        | No        | 404, resource deleted         |
| `budget_exceeded`  | No        | Cost limit reached            |

---

## 6. Scheduling

### Convex Crons

Operators register scheduled workflows via Convex cron jobs:

```typescript
// crons.ts
import { cronJobs } from "convex/server";

const crons = cronJobs();

// Check for due scheduled workflows every minute
crons.interval("workflow-scheduler", { minutes: 1 }, internal.engine.checkScheduledWorkflows);

export default crons;
```

### Schedule Storage

The `workflows` table already has a `trigger` field. For scheduled
workflows, this contains:

```json
{
  "type": "schedule",
  "cron": "0 9 * * MON",
  "timezone": "America/New_York",
  "nextRunAt": 1714384800000,
  "enabled": true
}
```

---

## 7. Event Bus

Internal events trigger workflows:

```json
{
  "type": "operator.goal_set",
  "workspaceId": "ws_123",
  "operatorId": "op_456",
  "data": { "goal": "20 social posts per day" }
}
```

The event bus is a Convex mutation that:

1. Writes the event to the `events` table
2. Queries workflows with matching event triggers
3. Creates execution records for each matched workflow

---

## 8. Human-in-the-Loop

### Approval Gates

When a step has `type: "approval"`:

1. Engine creates an `approvals` record with `status: "pending"`
2. Execution transitions to `waiting_approval`
3. (Future: notification sent via Slack/email)
4. User responds via dashboard → `approved` or `rejected`
5. Engine resumes execution from the approval step

### Timeout

Approval gates have a configurable timeout (default: 24h).
A Convex cron checks for expired approvals and either:

- Cancels the execution
- Skips the step (if configured)
- Auto-approves (if configured)

---

## 9. Cost Tracking

Every step execution tracks:

- Token usage (prompt + completion)
- Estimated cost (from LLM pricing map)
- Tool call count
- Duration

Aggregated at the execution level and rolled up to the operator.

---

## 10. File Structure

```
convex/
├── engine/
│   ├── types.ts          — Workflow/step/trigger type definitions
│   ├── schema.ts         — Zod validators for workflow definitions
│   ├── stateMachine.ts   — State transition logic
│   ├── executor.ts       — Main execution loop
│   ├── stepRunner.ts     — Step type handlers
│   ├── inputResolver.ts  — Template variable resolution
│   ├── retryPolicy.ts    — Retry/backoff logic
│   ├── errorClassifier.ts — Error categorization
│   ├── scheduler.ts      — Cron-based schedule management
│   └── eventBus.ts       — Internal event routing
├── crons.ts              — Convex cron job definitions
└── ...existing files
```
