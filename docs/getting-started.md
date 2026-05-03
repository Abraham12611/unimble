# Getting Started with Unimble

> Unimble is an AI-powered content strategy platform that deploys autonomous operators to handle DevRel, GTM, and content operations 24/7.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20.0.0 |
| pnpm | ≥ 9.0.0 |
| Git | any |

## 1 — Clone the repository

```bash
git clone https://github.com/Abraham12611/unimble-branch.git
cd unimble-branch
pnpm install
```

## 2 — Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the following required values:

| Variable | Where to get it |
|----------|----------------|
| `CONVEX_DEPLOYMENT` | Convex dashboard → Project settings |
| `NEXT_PUBLIC_CONVEX_URL` | Convex dashboard → Project settings |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk dashboard → Webhooks → Signing secret |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys |
| `COMPOSIO_API_KEY` | app.composio.dev → Settings |

## 3 — Start development

```bash
pnpm dev
```

This starts all apps in parallel:

- **Web** — `http://localhost:3000`
- **API** (Convex dev server) — starts automatically

## 4 — Create your first workspace

1. Open `http://localhost:3000` in your browser
2. Sign up with your email or a social provider
3. Follow the onboarding wizard to create your workspace
4. You will land on the workspace dashboard at `/w/<slug>/dashboard`

## 5 — Deploy your first operator

1. Navigate to **Operators** in the sidebar
2. Click **Deploy operator**
3. Choose an operator type (see [Operator Guides](./operators/))
4. Fill in the configuration form and click **Deploy**
5. Your operator will appear in the list with status `active`

## Next steps

- [Content Operator Guide](./operators/content-operator.md)
- [Integrations Overview](./integrations/overview.md)
- [API Reference](./api/reference.md)
- [FAQ](./faq.md)

## Running the full test suite

```bash
pnpm test              # Unit + integration tests (Vitest)
pnpm --filter @unimble/web test:e2e   # Playwright E2E tests
```

## Useful commands

```bash
pnpm lint              # ESLint across all packages
pnpm typecheck         # TypeScript across all packages
pnpm build             # Production build
pnpm format            # Prettier format
```
