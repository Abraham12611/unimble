import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  if (userId && isAuthRoute(req)) {
    const redirectUrl = req.nextUrl.searchParams.get("redirect_url");
    const safePath =
      redirectUrl && redirectUrl.startsWith("/") && !redirectUrl.startsWith("//")
        ? redirectUrl
        : "/dashboard";

    return NextResponse.redirect(new URL(safePath, req.url));
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
