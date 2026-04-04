import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "svix";

type ClerkWebhookEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: any;
};

function extractPrimaryEmail(data: any): string | undefined {
  const primaryId = data?.primary_email_address_id;
  const emails: any[] = Array.isArray(data?.email_addresses) ? data.email_addresses : [];

  const primary = emails.find((e) => e?.id === primaryId) ?? emails[0];
  return primary?.email_address;
}

function buildUserPayload(data: any) {
  const clerkId = String(data?.id ?? "");
  const email = extractPrimaryEmail(data);

  const firstName = data?.first_name ? String(data.first_name) : undefined;
  const lastName = data?.last_name ? String(data.last_name) : undefined;
  const name = data?.full_name
    ? String(data.full_name)
    : firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(" ")
      : undefined;

  const imageUrl = data?.image_url ? String(data.image_url) : undefined;
  const avatarUrl = imageUrl;

  return {
    clerkId,
    email,
    name,
    firstName,
    lastName,
    avatarUrl,
    imageUrl,
  };
}

export const clerkWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const payload = await request.text();

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  let evt: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  if (evt.type === "user.deleted") {
    const clerkId = String(evt.data?.id ?? "");
    if (!clerkId) {
      return new Response("Missing user id", { status: 400 });
    }

    await ctx.runMutation(internal.users.deleteByClerkId, { clerkId });

    return new Response(null, { status: 200 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const user = buildUserPayload(evt.data);

    if (!user.clerkId) {
      return new Response("Missing user id", { status: 400 });
    }

    if (!user.email) {
      return new Response("Missing email", { status: 400 });
    }

    await ctx.runMutation(internal.users.upsertFromClerk, {
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      imageUrl: user.imageUrl,
    });

    return new Response(null, { status: 200 });
  }

  return new Response(null, { status: 200 });
});
