import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);
const isPasswordResetRoute = createRouteMatcher(["/forgot-password(.*)", "/reset-password(.*)"]);

function base64UrlToBytes(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyOnboardingCookie(
  cookieValue: string | undefined,
  userId: string | null | undefined
) {
  if (!cookieValue || !userId) return false;

  const secret = process.env.ONBOARDING_COOKIE_SECRET ?? process.env.CLERK_SECRET_KEY;
  if (!secret) return false;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;

  const [version, issuedAtRaw, signatureRaw] = parts;
  if (version !== "v1") return false;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;

  if (Date.now() - issuedAt > 10 * 60 * 1000) return false;

  const payloadToSign = `v1|${userId}|${issuedAt}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadToSign));
  const expected = new Uint8Array(signature);
  const provided = base64UrlToBytes(signatureRaw);
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected[i] ^ provided[i];
  }
  return diff === 0;
}

type OnboardingClaims = {
  publicMetadata?: {
    onboardingComplete?: boolean;
    onboarding_complete?: boolean;
  };
  public_metadata?: {
    onboardingComplete?: boolean;
    onboarding_complete?: boolean;
  };
  metadata?: {
    onboardingComplete?: boolean;
  };
};

export default clerkMiddleware(async (auth, req) => {
  const session = await auth();
  const { userId, sessionClaims } = session;

  const claims = sessionClaims as OnboardingClaims | null | undefined;
  const onboardingCookieName = userId ? `__unimble_onboarding_complete_${userId}` : null;
  const onboardingCookie = onboardingCookieName
    ? req.cookies.get(onboardingCookieName)?.value
    : undefined;
  const claimComplete =
    claims?.publicMetadata?.onboardingComplete ??
    claims?.public_metadata?.onboardingComplete ??
    claims?.metadata?.onboardingComplete ??
    claims?.public_metadata?.onboarding_complete ??
    claims?.publicMetadata?.onboarding_complete;

  const cookieComplete = await verifyOnboardingCookie(onboardingCookie, userId);
  const onboardingComplete = claimComplete != null ? Boolean(claimComplete) : cookieComplete;

  if (userId && isAuthRoute(req)) {
    const redirectUrl = req.nextUrl.searchParams.get("redirect_url");
    const safePath =
      redirectUrl && redirectUrl.startsWith("/") && !redirectUrl.startsWith("//")
        ? redirectUrl
        : "/dashboard";

    return NextResponse.redirect(new URL(safePath, req.url));
  }

  if (
    userId &&
    !onboardingComplete &&
    !isOnboardingRoute(req) &&
    !isAuthRoute(req) &&
    !isApiRoute(req) &&
    !isPasswordResetRoute(req)
  ) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (userId && onboardingComplete && isOnboardingRoute(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (!userId && !isPublicRoute(req) && !isPasswordResetRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", `${req.nextUrl.pathname}${req.nextUrl.search}`);

    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
