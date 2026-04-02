import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)", "/trpc(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const session = await auth();
  const { userId, sessionClaims } = session;

  const claims: any = sessionClaims as any;
  const onboardingCookie = req.cookies.get("__unimble_onboarding_complete")?.value;
  const onboardingComplete = onboardingCookie
    ? onboardingCookie === "1"
    : Boolean(
        claims?.publicMetadata?.onboardingComplete ??
        claims?.public_metadata?.onboardingComplete ??
        claims?.metadata?.onboardingComplete ??
        claims?.public_metadata?.onboarding_complete ??
        claims?.publicMetadata?.onboarding_complete
      );

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
    !isApiRoute(req)
  ) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (userId && onboardingComplete && isOnboardingRoute(req)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (!userId && !isPublicRoute(req)) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", `${req.nextUrl.pathname}${req.nextUrl.search}`);

    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
