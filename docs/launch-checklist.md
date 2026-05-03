# Pre-Launch Checklist — v1.0.0

> Work through each section before tagging the v1.0.0 release. Check off items as they are verified.

---

## Security

- [ ] Snyk scan returns 0 critical, 0 high vulnerabilities (`pnpm snyk test --all-projects`)
- [ ] All secrets stored in Vercel environment variables — no plaintext in code
- [ ] Clerk session expiry configured (recommended: 1 hour idle, 7 days max)
- [ ] Clerk 2FA enforcement enabled for admin users
- [ ] All Convex mutations enforce workspace-scoped authorisation (reviewed in `rbac.ts`)
- [ ] No PII logged in Sentry (scrubber configured in `sentry.server.config.ts`)
- [ ] CORS settings reviewed — only expected origins allowed
- [ ] Webhook endpoints verify `svix` signatures (`webhooks.ts`)

## Performance

- [ ] Lighthouse desktop score ≥ 90 on `/w/<slug>/dashboard`
- [ ] k6 baseline: P95 latency < 500ms at 10 VUs (`pnpm --filter @unimble/load test`)
- [ ] k6 stress: P95 latency < 500ms at 100 VUs
- [ ] No N+1 queries — all list queries use Convex indexes
- [ ] Images served with `next/image` (automatic WebP + lazy loading)
- [ ] Bundle size checked with `next build && next bundle-analyzer`

## Testing

- [ ] Vitest unit + integration tests pass (`pnpm test`)
- [ ] TypeScript has 0 errors across all packages (`pnpm typecheck`)
- [ ] ESLint has 0 errors (`pnpm lint`)
- [ ] Playwright E2E tests pass on Chromium (`pnpm --filter @unimble/web test:e2e`)
- [ ] Cross-browser: Chrome, Firefox, Safari, Edge tested manually or via BrowserStack
- [ ] Edge cases tested: network timeout, invalid inputs, concurrent execution

## Documentation

- [ ] `docs/getting-started.md` complete and accurate
- [ ] Operator guides written for all 5 operators (Content, Growth, Community, Feedback, Documentation)
- [ ] `docs/integrations/overview.md` lists all available integrations
- [ ] `docs/api/reference.md` covers all public queries and mutations
- [ ] `docs/runbooks/deployment.md` reviewed by at least one engineer
- [ ] `docs/runbooks/incident-response.md` reviewed by on-call team
- [ ] `docs/runbooks/rollback.md` tested in staging environment
- [ ] `docs/faq.md` addresses top 10 support questions
- [ ] `README.md` updated with production URLs

## Production environment

- [ ] Convex production project created and deployed (`pnpm convex deploy --prod`)
- [ ] Clerk production application created (separate from development)
- [ ] Vercel project configured with all production env vars
- [ ] Custom domain configured and SSL certificate issued
- [ ] CDN headers set for static assets (`Cache-Control: public, max-age=31536000`)
- [ ] Sentry pointing to production project (not development)
- [ ] PostHog pointing to production project
- [ ] Uptime monitoring configured (e.g. Better Uptime or Checkly)

## Monitoring & alerting

- [ ] Sentry alert rules: notify on first occurrence of new error
- [ ] Convex dashboard: set up function error alerts
- [ ] Vercel: deployment failure notifications to Slack
- [ ] Uptime monitor: alert if production is down for > 2 minutes

## Final smoke test

- [ ] Sign up with a fresh email on production
- [ ] Complete onboarding wizard
- [ ] Create a workspace
- [ ] Deploy one operator
- [ ] Trigger a manual execution
- [ ] Approve content in the Approvals queue
- [ ] Connect one integration
- [ ] View analytics dashboard
- [ ] Invite a team member

## Release

- [ ] All checklist items above are checked
- [ ] PR from `develop` → `main` merged
- [ ] Production deployment successful
- [ ] Tag `v1.0.0` created on GitHub
- [ ] Release notes published on GitHub Releases
