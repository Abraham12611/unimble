# Rollback Runbook

## When to roll back

Roll back when:
- A production deployment caused a P0 or P1 incident
- The fix will take > 30 minutes and rollback is faster
- Data integrity is at risk

---

## Frontend rollback (Vercel)

The fastest rollback is via the Vercel dashboard:

1. Open [vercel.com/dashboard](https://vercel.com) → your project
2. Go to **Deployments**
3. Find the last known-good deployment
4. Click **…** → **Promote to Production**
5. Confirm — Vercel re-routes traffic in < 30 seconds

**No code changes or CI run required.**

---

## Backend rollback (Convex)

Convex function rollback requires redeploying a previous version of the codebase:

```bash
# 1. Find the last known-good git tag / commit
git log --oneline -20

# 2. Check out that commit on a new branch
git checkout -b hotfix/rollback <GOOD_SHA>

# 3. Deploy Convex functions from that commit
cd apps/api
pnpm convex deploy --prod

# 4. Verify the issue is resolved in production
# 5. Open a PR to cherry-pick the fix forward to develop/main
```

> Convex does not natively support versioned deployments — the codebase IS the version.

---

## Database rollback

Convex does not support point-in-time restore in all tiers. If a migration corrupted data:

1. Check if the mutation was reversible (soft-delete, status update)
2. If yes, write a one-time repair mutation and run it via the Convex dashboard
3. If data is unrecoverable and your plan supports it, contact Convex support for a restore

**Prevention:** Always deploy schema-additive changes first (new optional fields), then populate, then remove old fields.

---

## Post-rollback steps

- [ ] Confirm production is healthy (smoke test checklist in [deployment runbook](./deployment.md))
- [ ] Communicate resolution in the incident Slack thread
- [ ] Update the incident timeline
- [ ] Open a GitHub issue to track the root cause fix
- [ ] Schedule a post-mortem if P0/P1
