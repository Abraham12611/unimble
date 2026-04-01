# Contributing to Unimble

Thank you for your interest in contributing to Unimble! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/unimble.git
   cd unimble
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feat/your-feature-name
   ```

## Development Workflow

### Branch Naming

Use the following prefixes:
- `feat/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions or modifications
- `chore/` - Maintenance tasks

### Running the Development Server

```bash
pnpm dev
```

### Running Tests

```bash
pnpm test
```

### Linting and Formatting

```bash
pnpm lint      # Run ESLint
pnpm format    # Run Prettier
```

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should follow this format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Test additions or modifications
- `chore` - Maintenance tasks
- `perf` - Performance improvements
- `ci` - CI/CD changes
- `build` - Build system changes

### Examples

```
feat(auth): add OAuth2 login support

fix(api): resolve race condition in data fetching

docs: update README with new setup instructions
```

## Pull Request Process

1. Ensure your code follows our style guidelines
2. Update documentation if needed
3. Add tests for new functionality
4. Ensure all tests pass
5. Fill out the PR template completely
6. Request review from maintainers

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No new warnings
- [ ] All CI checks pass

## Code Style

### TypeScript

- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` - use `unknown` if type is truly unknown

### React

- Use functional components with hooks
- Prefer named exports
- Use descriptive component names
- Keep components focused and small

### File Organization

```
src/
├── components/     # React components
├── hooks/          # Custom hooks
├── lib/            # Utility functions
├── types/          # TypeScript types
└── app/            # Next.js app router pages
```

## Questions?

If you have questions, feel free to:
- Open a GitHub issue
- Reach out to the maintainers

Thank you for contributing! 🎉
