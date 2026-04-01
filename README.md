# Unimble

> AI-powered DevRel automation platform for developer tools companies.

## Overview

Unimble deploys autonomous AI operators that handle DevRel, GTM, and content operations 24/7. Think of it as hiring a tireless DevRel team that learns, adapts, and executes continuously.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Convex (real-time database + serverless functions)
- **Auth**: Clerk
- **AI/LLM**: OpenRouter (multi-model), LangGraph patterns
- **Integrations**: Composio
- **Deployment**: Vercel

## Project Structure

```
unimble/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # Convex backend
├── packages/
│   ├── ui/           # Shared UI components
│   ├── shared/       # Shared utilities and types
│   └── config/       # Shared configuration
├── .github/          # GitHub Actions workflows
└── docs/             # Documentation
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/Abraham12611/unimble.git
cd unimble

# Install dependencies
pnpm install

# Setup environment variables
cp .env.example .env.local

# Start development
pnpm dev
```

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

### Commands

```bash
pnpm dev        # Start all apps in development mode
pnpm build      # Build all apps
pnpm lint       # Lint all apps
pnpm format     # Format code with Prettier
pnpm typecheck  # Run TypeScript type checking
pnpm test       # Run tests
```

## Documentation

- [Build Plan](./docs/build-plan/) - Detailed development phases
- [Architecture](./docs/architecture/) - System design
- [API Reference](./docs/api/) - API documentation

## License

MIT © Abraham Dahunsi
