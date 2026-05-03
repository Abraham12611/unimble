# Deployment Runbook

## Overview

Unimble uses Vercel for the Next.js frontend and Convex for the backend. Each merge to `main` triggers an automatic deployment.

## Environments

| Environment | Branch | URL pattern |
|-------------|--------|-------------|
| Production | `main` | `https://unimble.vercel.app` |
| Preview | `develop` | `https://unimble-develop.vercel.app` |
| Local dev | `*` | `http://localhost:3000` |

---

## Standard deployment (merge to main)

1. Ensure all CI checks pass on `develop`
2. Open a PR from `develop` → `main`
3. Get at least one approval
4. Squash-merge the PR
5. Vercel auto-deployment starts within 60 seconds
6. Monitor deployment in the [Vercel dashboard](https://vercel.com)
7. Once deployed, run the smoke test checklist (see below)

---

## Environment variables

All production environment variables must be set in the Vercel project dashboard under **Settings → Environment Variables**.

| Variable | Scope | Notes |
|----------|-------|-------|
| `CONVEX_DEPLOY_KEY` | Production only | From Convex dashboard |
| `NEXT_PUBLIC_CONVEX_URL` | All | Production Convex URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | All | Clerk production key |
| `CLERK_SECRET_KEY` | Production only | Never expose client-side |
| `CLERK_WEBHOOK_SECRET` | Production only | |
| `OPENROUTER_API_KEY` | Production only | |
| `COMPOSIO_API_KEY` | Production only | |
| `NEXT_PUBLIC_SENTRY_DSN` | All | |
| `SENTRY_AUTH_TOKEN` | Production only | |
| `NEXT_PUBLIC_POSTHOG_KEY` | All | |

---

## Convex backend deployment

```bash
# Deploy Convex functions to production
cd apps/api
pnpm convex deploy --prod
```

> This is run automatically by the CI pipeline on merges to `main`.

---

## Smoke test checklist

After every production deployment, verify:

- [ ] Home page (`/`) loads and redirects to sign-in
- [ ] Sign-in page renders without errors
- [ ] Sign-up flow completes and redirects to onboarding
- [ ] Onboarding wizard creates a workspace
- [ ] Workspace dashboard loads with Convex data
- [ ] Operators page lists operators (or shows empty state)
- [ ] Sentry is receiving events (trigger a test error if needed)
- [ ] PostHog is recording sessions

---

## Rollback

See [rollback runbook](./rollback.md).
