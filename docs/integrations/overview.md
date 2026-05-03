# Integrations Overview

Unimble connects to your existing tools via Composio-managed integrations. Connections are workspace-scoped and never shared across workspaces.

## Connecting an integration

1. Go to **Integrations** in your workspace sidebar
2. Find the service you want to connect
3. Click **Connect**
4. Authorise via OAuth or enter an API key
5. The integration card updates to show **Connected**

## Available integrations

### Publishing & content
| Service | Auth type | Used by |
|---------|-----------|---------|
| dev.to | API key | Content Operator |
| Hashnode | API key | Content Operator |
| Ghost | API key + URL | Content Operator |
| Medium | OAuth | Content Operator |
| Notion | OAuth | Documentation Operator, Feedback Operator |
| Gitbook | API key | Documentation Operator |

### Community & social
| Service | Auth type | Used by |
|---------|-----------|---------|
| Discord | Bot token | Community Operator |
| Slack | OAuth | Community Operator, Feedback Operator |
| Twitter / X | OAuth 2.0 | Growth Operator |
| Reddit | OAuth 2.0 | Growth Operator |

### Development
| Service | Auth type | Used by |
|---------|-----------|---------|
| GitHub | OAuth | All operators |
| Linear | OAuth | Feedback Operator |
| Jira | OAuth | Feedback Operator |

### CRM & support
| Service | Auth type | Used by |
|---------|-----------|---------|
| Intercom | API key | Feedback Operator |
| Zendesk | OAuth | Feedback Operator |
| HubSpot | OAuth | Growth Operator |

## Revoking a connection

1. Go to **Integrations**
2. Click the **…** menu on the connected integration card
3. Select **Disconnect**

Revoking a connection immediately stops operators that depend on it. They will enter an error state and appear in **Executions** with a `failed` status.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Integration shows as disconnected after a while | OAuth token expired | Reconnect |
| Operator failing with `integration_error` | API key rotated on the third-party | Update the key in Integrations |
| Content not publishing | Rate limit on the publishing platform | Check usage limits on the platform dashboard |
