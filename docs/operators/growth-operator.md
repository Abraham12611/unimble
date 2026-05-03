# Growth Operator

The Growth Operator monitors developer signals across the web and automatically engages with communities, handles developer relations outreach, and surfaces growth opportunities.

## What it does

- Monitors Reddit, Hacker News, Twitter/X, and Stack Overflow for mentions
- Drafts and posts replies to relevant conversations
- Identifies and reaches out to potential early adopters
- Creates weekly growth reports summarising community sentiment
- Tracks GitHub stars, forks, and issue trends

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keywords` | `string[]` | Yes | Product name, competitor names, or topic keywords to monitor |
| `channels` | `string[]` | Yes | Platforms to monitor: `reddit`, `hackernews`, `twitter`, `stackoverflow` |
| `engagementMode` | `string` | Yes | `monitor` (read only), `draft` (creates drafts), `auto` (posts directly) |
| `cadence` | `string` | Yes | Cron expression for monitoring runs |
| `requireApproval` | `boolean` | No | Require review before any outreach is sent (default: `true`) |
| `replyTone` | `string` | No | `helpful`, `promotional`, `neutral` (default: `helpful`) |

## Deploy steps

1. Go to **Operators → Deploy operator**
2. Select **Growth** from the operator type list
3. Enter the keywords relevant to your product
4. Connect the social/community integrations you want monitored
5. Choose your engagement mode — start with `draft` to review before going live
6. Click **Deploy**

## Safety note

Always start with `requireApproval: true` and `engagementMode: draft` when deploying for the first time. This lets you review every reply before it goes out.

## Required integrations

- At least one social channel (Twitter/X, Reddit, or Hacker News)
- Optional: GitHub (for repo metric tracking)

## Example configuration

```json
{
  "keywords": ["unimble", "devrel automation", "ai content"],
  "channels": ["twitter", "reddit", "hackernews"],
  "engagementMode": "draft",
  "cadence": "0 */6 * * *",
  "requireApproval": true,
  "replyTone": "helpful"
}
```
