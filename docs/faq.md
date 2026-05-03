# Frequently Asked Questions

## General

**What is Unimble?**
Unimble is an AI-powered content strategy platform that deploys autonomous operators — specialised AI agents — to handle DevRel, GTM, and content operations for developer tools companies.

**What are operators?**
Operators are autonomous AI agents configured for a specific role: Content, Growth, Community, Feedback, or Documentation. Each operator runs on a schedule, uses your integrations, and can pause for human approval before taking action.

**Do operators post content without my review?**
By default, no. All operators ship with `requireApproval: true`, meaning every piece of content or action lands in the **Approvals** queue first. You can turn this off per operator once you trust its output.

**What AI models does Unimble use?**
Unimble routes through [OpenRouter](https://openrouter.ai), which gives access to GPT-4o, Claude 3.5, Gemini 1.5, and others. You configure the model preference per operator type (coming soon — currently uses a sensible default).

---

## Workspaces & teams

**Can I have multiple workspaces?**
Yes. A workspace maps to a product or brand. You can create as many as you need from the dashboard.

**What roles are available?**
- **Owner** — full access, billing, delete workspace
- **Admin** — all access except billing and workspace deletion
- **Member** — can view and run operators, cannot change settings
- **Viewer** — read-only access

**How do I invite a team member?**
Go to **Settings → Team** and enter their email. They will receive an invitation link valid for 7 days.

---

## Integrations

**Is my API key stored securely?**
Yes. All integration credentials are encrypted at rest in Convex and are never exposed in API responses or logs.

**What if an integration disconnects?**
Any operator that depends on a disconnected integration will fail its next execution and appear in **Executions** with a `failed` status. Re-connect the integration and the operator will resume on its next scheduled run.

**Can I connect the same integration to multiple workspaces?**
Yes, but each connection is independent per workspace. A token revoked in one workspace does not affect others.

---

## Billing & limits

**Is there a free tier?**
Yes — the free tier includes 1 workspace, 2 operators, and 100 API calls per minute.

**How are executions counted?**
Each operator run is one execution, regardless of how many steps it contains.

**Where do I manage my subscription?**
Go to **Settings → Billing** in your workspace.

---

## Troubleshooting

**An operator is stuck in the `running` state.**
Wait 10 minutes — the circuit breaker should automatically fail the execution. If it does not, check **Executions** for step-level errors and contact support.

**Content was published before I approved it.**
Check that `requireApproval` is set to `true` in the operator configuration. If it was set to `false`, change it and re-deploy the operator.

**My Convex queries are slow.**
This is usually caused by a missing index on a frequently-queried field. Check the Convex dashboard for slow function logs and open a GitHub issue with the query details.
