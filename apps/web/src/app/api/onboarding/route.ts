import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { createHmac } from "crypto";

export const runtime = "nodejs";

type CompanySize = "1-10" | "11-50" | "51-200" | "201-500" | "500+";

type UseCase = "DevRel" | "Content" | "GTM" | "Community" | "Other";

type OnboardingPayload = {
  fullName: string;
  avatarUrl: string;
  companyName: string;
  companySize: CompanySize;
  useCase: UseCase;
  workspaceName: string;
  inviteEmails: string;
};

function parseHttpsUrlOrThrow(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("avatarUrl must be a valid https URL");
  }

  if (u.protocol !== "https:") {
    throw new Error("avatarUrl must use https");
  }

  return raw;
}

function parseInviteEmails(input: unknown) {
  const raw = String(input ?? "");
  const parts = raw
    .split(/[\n,;]+/g)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return { raw, parts };
}

function isLikelyEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

export async function POST(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<OnboardingPayload>;
  try {
    body = (await req.json()) as Partial<OnboardingPayload>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validCompanySizes: CompanySize[] = ["1-10", "11-50", "51-200", "201-500", "500+"];
  const validUseCases: UseCase[] = ["DevRel", "Content", "GTM", "Community", "Other"];

  const fullName = String(body.fullName ?? "").trim();
  const companyName = String(body.companyName ?? "").trim();
  const workspaceName = String(body.workspaceName ?? "").trim();
  let avatarUrl: string;
  try {
    avatarUrl = parseHttpsUrlOrThrow(body.avatarUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid avatarUrl" },
      { status: 400 }
    );
  }
  const invitesParsed = parseInviteEmails(body.inviteEmails);

  if (avatarUrl.length > 2_048) {
    return NextResponse.json({ error: "avatarUrl is too long" }, { status: 400 });
  }

  if (fullName.length > 120) {
    return NextResponse.json({ error: "fullName is too long" }, { status: 400 });
  }
  if (companyName.length > 120) {
    return NextResponse.json({ error: "companyName is too long" }, { status: 400 });
  }
  if (workspaceName.length > 120) {
    return NextResponse.json({ error: "workspaceName is too long" }, { status: 400 });
  }

  if (invitesParsed.raw.length > 5_000) {
    return NextResponse.json({ error: "inviteEmails is too long" }, { status: 400 });
  }

  const invalidInvite = invitesParsed.parts.find((e) => !isLikelyEmail(e));
  if (invalidInvite) {
    return NextResponse.json({ error: "One or more invite emails are invalid" }, { status: 400 });
  }

  if (!validCompanySizes.includes(body.companySize as CompanySize)) {
    return NextResponse.json({ error: "Invalid companySize" }, { status: 400 });
  }

  if (!validUseCases.includes(body.useCase as UseCase)) {
    return NextResponse.json({ error: "Invalid useCase" }, { status: 400 });
  }

  const payload: OnboardingPayload = {
    fullName,
    avatarUrl,
    companyName,
    companySize: body.companySize as CompanySize,
    useCase: body.useCase as UseCase,
    workspaceName,
    inviteEmails: invitesParsed.parts.join("\n"),
  };

  if (!payload.fullName) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }

  if (!payload.workspaceName) {
    return NextResponse.json({ error: "workspaceName is required" }, { status: 400 });
  }

  if (!payload.companyName) {
    return NextResponse.json({ error: "companyName is required" }, { status: 400 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    return NextResponse.json({ error: "Convex is not configured" }, { status: 500 });
  }

  const token = await getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);

  let workspaceId: string;
  try {
    const completeOnboarding = makeFunctionReference<"mutation">("onboarding:completeOnboarding");
    const result = (await convex.mutation(completeOnboarding, payload)) as {
      workspaceId: string;
    };
    workspaceId = result.workspaceId;
  } catch {
    return NextResponse.json({ error: "Failed to save onboarding" }, { status: 500 });
  }

  const client = await clerkClient();

  try {
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        onboardingComplete: true,
      },
      privateMetadata: {
        onboarding: {
          ...payload,
          completedAt: new Date().toISOString(),
          workspaceId,
        },
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Onboarding saved but session could not be updated. Please refresh and try again.",
      },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });

  const secret = process.env.ONBOARDING_COOKIE_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (secret) {
    const issuedAt = Date.now();
    const payloadToSign = `v1|${userId}|${issuedAt}`;
    const signature = createHmac("sha256", secret).update(payloadToSign).digest("base64url");
    const cookieValue = `v1.${issuedAt}.${signature}`;

    res.cookies.set({
      name: `__unimble_onboarding_complete_${userId}`,
      value: cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
  }

  return res;
}
