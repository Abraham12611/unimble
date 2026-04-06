import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";

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

  const payload: OnboardingPayload = {
    fullName: String(body.fullName ?? "").trim(),
    avatarUrl: String(body.avatarUrl ?? "").trim(),
    companyName: String(body.companyName ?? "").trim(),
    companySize: validCompanySizes.includes(body.companySize as CompanySize)
      ? (body.companySize as CompanySize)
      : "1-10",
    useCase: validUseCases.includes(body.useCase as UseCase) ? (body.useCase as UseCase) : "DevRel",
    workspaceName: String(body.workspaceName ?? "").trim(),
    inviteEmails: String(body.inviteEmails ?? ""),
  };

  if (!payload.fullName) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }

  if (!payload.workspaceName) {
    return NextResponse.json({ error: "workspaceName is required" }, { status: 400 });
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
  res.cookies.set({
    name: "__unimble_onboarding_complete",
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return res;
}
