# Feedback Operator

The Feedback Operator collects, categorises, and synthesises user feedback from multiple channels into actionable product insights.

## What it does

- Ingests feedback from Intercom, Zendesk, GitHub Issues, and email
- Automatically tags feedback by theme (performance, UX, feature request, bug)
- Generates weekly product insight reports for the team
- Surfaces high-priority feedback patterns before they become blockers
- Routes critical feedback to the right team member via Slack/email

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sources` | `string[]` | Yes | Feedback sources: `intercom`, `zendesk`, `github-issues`, `email` |
| `reportCadence` | `string` | Yes | Cron for report generation — e.g. `0 9 * * 1` (weekly) |
| `reportRecipients` | `string[]` | Yes | Email addresses to receive weekly reports |
| `priorityThreshold` | `number` | No | Number of mentions needed to flag a theme as high-priority (default: `5`) |
| `requireApproval` | `boolean` | No | Review reports before sending (default: `true`) |
| `slackChannel` | `string` | No | Slack channel ID for critical feedback alerts |

## Deploy steps

1. Go to **Operators → Deploy operator**
2. Select **Feedback** from the operator type list
3. Connect your feedback source integrations
4. Add email addresses for report recipients
5. Optionally connect Slack for real-time critical feedback alerts
6. Click **Deploy**

## Required integrations

- At least one feedback source (Intercom, Zendesk, GitHub, or email)
- Slack (optional, for alerts)

## Example configuration

```json
{
  "sources": ["intercom", "github-issues"],
  "reportCadence": "0 9 * * 1",
  "reportRecipients": ["product@yourcompany.com", "cto@yourcompany.com"],
  "priorityThreshold": 5,
  "requireApproval": true,
  "slackChannel": "C0123456789"
}
```
