# Community Operator

The Community Operator manages your developer community by monitoring Discord, Slack, and GitHub Discussions — answering questions, triaging issues, and surfacing insights to your team.

## What it does

- Answers common questions in Discord and Slack using your documentation as context
- Triages new GitHub issues and suggests labels/assignees
- Generates weekly community health reports
- Flags unanswered questions older than a configurable threshold
- Identifies power users and community champions

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channels` | `string[]` | Yes | Platforms: `discord`, `slack`, `github-discussions` |
| `knowledgeBase` | `string[]` | No | URLs of documentation pages to use as context |
| `responseDelay` | `number` | No | Seconds to wait before auto-responding (default: `300`) — gives humans a chance to reply first |
| `requireApproval` | `boolean` | No | Review responses before posting (default: `true`) |
| `cadence` | `string` | Yes | Cron expression for monitoring runs |
| `escalationKeywords` | `string[]` | No | Keywords that should always escalate to a human (e.g. `["billing", "refund", "legal"]`) |

## Deploy steps

1. Go to **Operators → Deploy operator**
2. Select **Community** from the operator type list
3. Connect your Discord and/or Slack integration
4. Optionally add documentation URLs to the knowledge base
5. Set `responseDelay` to give humans first-reply priority
6. Click **Deploy**

## Required integrations

- Discord and/or Slack
- GitHub (for issue triage features)

## Example configuration

```json
{
  "channels": ["discord", "slack"],
  "knowledgeBase": [
    "https://docs.yourproduct.com",
    "https://yourproduct.com/faq"
  ],
  "responseDelay": 300,
  "requireApproval": false,
  "cadence": "*/15 * * * *",
  "escalationKeywords": ["billing", "refund", "data loss", "security"]
}
```
