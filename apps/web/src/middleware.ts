import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);
const isPasswordResetRoute = createRouteMatcher(["/forgot-password(.*)", "/reset-password(.*)"]);

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

  const onboardingComplete =
    claimComplete != null ? Boolean(claimComplete) : onboardingCookie === "1";

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
