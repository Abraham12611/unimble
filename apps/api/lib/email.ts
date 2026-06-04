/**
 * Email service using Resend for sending transactional emails.
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInviteEmailParams {
  to: string;
  workspaceName: string;
  inviterName: string;
  inviteUrl: string;
}

export async function sendInviteEmail({
  to,
  workspaceName,
  inviterName,
  inviteUrl,
}: SendInviteEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email send");
    return null;
  }

  const { error } = await resend.emails.send({
    from: "invitations@unimble.ai",
    to: [to],
    subject: `Invitation to join ${workspaceName} on Unimble`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Workspace Invitation</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #090909;
            color: #f0f0f0;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #111111;
            border: 1px solid #2a2a2a;
            border-radius: 12px;
            overflow: hidden;
          }
          .header {
            padding: 32px;
            text-align: center;
            border-bottom: 1px solid #2a2a2a;
          }
          .content {
            padding: 32px;
          }
          .button {
            display: inline-block;
            background-color: #f0f0f0;
            color: #090909;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            margin: 24px 0;
          }
          .footer {
            padding: 24px 32px;
            background-color: #0a0a0a;
            font-size: 12px;
            color: #888888;
            text-align: center;
          }
          .logo {
            font-size: 24px;
            font-weight: 700;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="logo">🤖 Unimble</h1>
          </div>
          <div class="content">
            <h2>You're invited to join ${workspaceName}</h2>
            <p>${inviterName} has invited you to join their workspace on Unimble, the AI-powered DevRel/GTM automation platform.</p>
            <p>Click the button below to accept the invitation and get access to the workspace.</p>
            <div style="text-align: center;">
              <a href="${inviteUrl}" class="button">Accept Invitation</a>
            </div>
            <p style="color: #888888; font-size: 14px;">
              This invitation expires in 7 days. If you don't have an account yet, you'll be prompted to create one.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from Unimble. If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error("Failed to send invite email:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return { success: true };
}

interface SendNotificationEmailParams {
  to: string;
  subject: string;
  content: string;
  workspaceName?: string;
}

export async function sendNotificationEmail({
  to,
  subject,
  content,
  workspaceName,
}: SendNotificationEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email send");
    return null;
  }

  const { error } = await resend.emails.send({
    from: workspaceName
      ? `${workspaceName} <notifications@unimble.ai>`
      : "notifications@unimble.ai",
    to: [to],
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #090909;
            color: #f0f0f0;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #111111;
            border: 1px solid #2a2a2a;
            border-radius: 12px;
            overflow: hidden;
          }
          .header {
            padding: 24px;
            text-align: center;
            border-bottom: 1px solid #2a2a2a;
          }
          .content {
            padding: 32px;
          }
          .footer {
            padding: 24px 32px;
            background-color: #0a0a0a;
            font-size: 12px;
            color: #888888;
            text-align: center;
          }
          .logo {
            font-size: 20px;
            font-weight: 700;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 class="logo">🤖 Unimble</h1>
            ${workspaceName ? `<p style="margin: 8px 0 0 0; color: #888888; font-size: 14px;">${workspaceName}</p>` : ""}
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>This is an automated message from Unimble.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error("Failed to send notification email:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  return { success: true };
}
