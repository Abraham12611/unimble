# Documentation Operator

The Documentation Operator keeps your developer documentation up to date by monitoring code changes and automatically generating or updating documentation.

## What it does

- Monitors GitHub for merged PRs and new releases
- Generates or updates API reference docs from OpenAPI specs or code comments
- Creates migration guides for breaking changes
- Updates getting-started guides when onboarding flows change
- Publishes changes to Notion, Gitbook, or your static docs site

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repository` | `string` | Yes | GitHub repo in `owner/repo` format |
| `docsPlatform` | `string` | Yes | Publishing target: `notion`, `gitbook`, `markdown-pr`, `custom-webhook` |
| `triggers` | `string[]` | Yes | Events to react to: `release`, `merged-pr`, `openapi-change` |
| `requireApproval` | `boolean` | No | Review docs before publishing (default: `true`) |
| `sections` | `string[]` | No | Which sections to auto-update: `api-reference`, `getting-started`, `changelog`, `migration-guide` |
| `openApiPath` | `string` | No | Path to OpenAPI spec file in the repository (e.g. `openapi.yaml`) |

## Deploy steps

1. Go to **Operators → Deploy operator**
2. Select **Documentation** from the operator type list
3. Connect your GitHub integration
4. Set the target docs platform
5. Choose which triggers should initiate a docs update run
6. Click **Deploy**

## Required integrations

- GitHub (required)
- Notion, Gitbook, or your custom docs webhook (at least one)

## Example configuration

```json
{
  "repository": "yourorg/yourproduct",
  "docsPlatform": "notion",
  "triggers": ["release", "merged-pr"],
  "requireApproval": true,
  "sections": ["api-reference", "changelog"],
  "openApiPath": "openapi.yaml"
}
```
