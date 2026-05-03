/**
 * Unimble k6 load test — 5 most-used Convex API paths.
 *
 * Usage:
 *   k6 run tests/load/api-paths.js
 *   k6 run --vus 100 --duration 60s tests/load/api-paths.js  # stress test
 *
 * Required env vars (pass via -e flag or .env):
 *   BASE_URL   — e.g. https://your-project.vercel.app
 *   API_TOKEN  — Convex HTTP action bearer token (if applicable)
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// ─── Custom metrics ───────────────────────────────────────────────────────────
const errorRate = new Rate("errors");
const listOperatorsLatency = new Trend("list_operators_p95");
const listExecutionsLatency = new Trend("list_executions_p95");
const getWorkspaceLatency = new Trend("get_workspace_p95");
const listApprovalsLatency = new Trend("list_approvals_p95");
const listWorkflowsLatency = new Trend("list_workflows_p95");

// ─── Scenarios ────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    baseline: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
      tags: { scenario: "baseline" },
    },
    ramp_up: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 50 },
        { duration: "60s", target: 100 },
        { duration: "30s", target: 0 },
      ],
      tags: { scenario: "stress" },
      startTime: "35s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500"],
    errors: ["rate<0.01"],
    list_operators_p95: ["p(95)<500"],
    list_executions_p95: ["p(95)<500"],
    get_workspace_p95: ["p(95)<500"],
    list_approvals_p95: ["p(95)<500"],
    list_workflows_p95: ["p(95)<500"],
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const TOKEN = __ENV.API_TOKEN || "";

const headers = {
  "Content-Type": "application/json",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

// ─── Helper ───────────────────────────────────────────────────────────────────
function convexQuery(functionName, args = {}) {
  const url = `${BASE_URL}/api/convex-query`;
  return http.post(url, JSON.stringify({ function: functionName, args }), {
    headers,
    tags: { name: functionName },
  });
}

// ─── Test ─────────────────────────────────────────────────────────────────────
export default function () {
  const workspaceId = __ENV.WORKSPACE_ID || "test-workspace";

  // 1 — List operators
  const t1Start = Date.now();
  const opsRes = convexQuery("operators:listOperators", { workspaceId });
  listOperatorsLatency.add(Date.now() - t1Start);
  check(opsRes, { "operators: status 200": (r) => r.status === 200 });
  errorRate.add(opsRes.status !== 200);

  sleep(0.5);

  // 2 — List executions
  const t2Start = Date.now();
  const execRes = convexQuery("executions:listExecutions", { workspaceId });
  listExecutionsLatency.add(Date.now() - t2Start);
  check(execRes, { "executions: status 200": (r) => r.status === 200 });
  errorRate.add(execRes.status !== 200);

  sleep(0.5);

  // 3 — Get workspace
  const t3Start = Date.now();
  const wsRes = convexQuery("workspaces:getWorkspaceBySlug", {
    slug: __ENV.WORKSPACE_SLUG || "test",
  });
  getWorkspaceLatency.add(Date.now() - t3Start);
  check(wsRes, { "workspace: status 200": (r) => r.status === 200 });
  errorRate.add(wsRes.status !== 200);

  sleep(0.5);

  // 4 — List pending approvals
  const t4Start = Date.now();
  const appRes = convexQuery("executions:listExecutionApprovals", {
    executionId: workspaceId,
    status: "pending",
  });
  listApprovalsLatency.add(Date.now() - t4Start);
  check(appRes, { "approvals: status 200": (r) => r.status === 200 });
  errorRate.add(appRes.status !== 200);

  sleep(0.5);

  // 5 — List workflows
  const t5Start = Date.now();
  const wfRes = convexQuery("workflows:listWorkflows", { workspaceId });
  listWorkflowsLatency.add(Date.now() - t5Start);
  check(wfRes, { "workflows: status 200": (r) => r.status === 200 });
  errorRate.add(wfRes.status !== 200);

  sleep(1);
}
