# Content Operator

The Content Operator autonomously generates, schedules, and distributes technical content across your chosen channels.

## What it does

- Drafts blog posts, changelogs, and release notes based on your product data
- Publishes to connected platforms (dev.to, Hashnode, Ghost, Medium)
- Schedules posts for optimal engagement times
- Sends content for human approval before publishing (configurable)
- Tracks performance and feeds results back into future content decisions

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentTypes` | `string[]` | Yes | Types to generate: `blog`, `changelog`, `release-notes`, `tutorial` |
| `channels` | `string[]` | Yes | Target platforms: `devto`, `hashnode`, `ghost`, `medium` |
| `cadence` | `string` | Yes | Cron expression — e.g. `0 9 * * 1` (every Monday 9 AM) |
| `tone` | `string` | No | Writing style: `technical`, `casual`, `educational` (default: `technical`) |
| `requireApproval` | `boolean` | No | Pause for human review before publishing (default: `true`) |
| `maxPostsPerRun` | `number` | No | Cap on pieces generated per execution (default: `1`) |

## Deploy steps

1. Go to **Operators → Deploy operator**
2. Select **Content** from the operator type list
3. Fill in the configuration form
4. Connect at least one publishing channel integration
5. Click **Deploy**

## Approval workflow

When `requireApproval: true` (default), each piece of content will appear in the **Approvals** page before it is published. You can:

- **Approve** — publishes immediately to the configured channels
- **Reject** — discards the draft and logs the reason
- **Edit** — modify the content inline, then approve

## Example configuration

```json
{
  "contentTypes": ["blog", "changelog"],
  "channels": ["devto", "hashnode"],
  "cadence": "0 9 * * 1",
  "tone": "technical",
  "requireApproval": true,
  "maxPostsPerRun": 2
}
```

## Required integrations

- At least one publishing channel (dev.to, Hashnode, Ghost, or Medium)
- GitHub (optional — to pull recent commits for changelog generation)

## Monitoring

Track content operator runs in **Executions**. Each execution shows:
- Steps: outline → draft → review → publish
- Token usage per step
- Published URLs after successful runs
