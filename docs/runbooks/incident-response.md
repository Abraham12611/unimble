# Incident Response Playbook

## Severity levels

| Severity | Definition | Response time |
|----------|-----------|---------------|
| P0 | Production down — all users affected | 15 minutes |
| P1 | Critical feature broken — major user impact | 1 hour |
| P2 | Degraded experience — partial functionality | 4 hours |
| P3 | Minor issue — no user impact | Next business day |

---

## First response checklist

1. **Acknowledge** the alert in Slack (`#incidents` channel)
2. **Assign** an incident commander (IC) and note the time
3. **Assess** severity using the table above
4. **Create** a dedicated Slack thread for the incident
5. **Communicate** to stakeholders within the SLA for the severity level

---

## Diagnosing the issue

### Check Vercel deployment status
```
https://vercel.com/dashboard → Deployments
```

### Check Convex backend health
```
https://dashboard.convex.dev → Functions → Recent errors
```

### Check Sentry for error spikes
```
https://sentry.io → Issues (filter: last 1 hour)
```

### Check PostHog for session issues
```
https://app.posthog.com → Session replay (filter: errors)
```

### Check Clerk authentication status
```
https://clerk.com → Status page
```

---

## Common incidents and fixes

### Convex functions returning errors
**Symptoms:** API calls fail, dashboard shows no data
**Steps:**
1. Check Convex dashboard for function errors
2. Check recent deployments — did a bad deploy go out?
3. If caused by bad deploy, rollback (see [rollback runbook](./rollback.md))

### Clerk authentication broken
**Symptoms:** Users can not sign in, redirects looping
**Steps:**
1. Check [status.clerk.com](https://status.clerk.com)
2. Verify `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are set correctly in Vercel
3. Check Clerk webhook is receiving events

### High memory / CPU on Convex
**Symptoms:** Slow queries, timeouts
**Steps:**
1. Check Convex dashboard for slow function logs
2. Look for runaway scheduled jobs in the Convex cron dashboard
3. Pause any operator that is running excessively in the Unimble UI

### Operator stuck in running state
**Symptoms:** Execution shows `running` for > 10 minutes
**Steps:**
1. Navigate to the execution in the Unimble dashboard
2. Check the step log for the last completed step
3. If circuit breaker should have triggered, check `circuitBreakers.ts` logic
4. Manually cancel the execution via the Convex dashboard if needed

---

## Post-incident review

After every P0 or P1 incident, schedule a post-mortem within 48 hours.

Post-mortem template:
```
## Incident: <title>
Date: YYYY-MM-DD
Duration: X hours Y minutes
Severity: P0 / P1

## Timeline
- HH:MM — first alert
- HH:MM — IC assigned
- HH:MM — root cause identified
- HH:MM — fix deployed
- HH:MM — incident resolved

## Root cause
...

## Impact
...

## Remediation items
- [ ] Action 1 (owner, due date)
- [ ] Action 2 (owner, due date)
```
