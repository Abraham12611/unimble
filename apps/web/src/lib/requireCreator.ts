import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { redirect } from "next/navigation";

type CurrentUser = {
  role?: string;
} | null;

export async function requireCreator() {
  const { userId, getToken } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!convexUrl) {
    throw new Error("Convex is not configured");
  }

  const token = await getToken({ template: "convex" });
  if (!token) {
    redirect("/sign-in");
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);

  const getCurrentUser = makeFunctionReference<"query">("users:getCurrentUser");
  let currentUser: CurrentUser;
  try {
    currentUser = (await convex.query(getCurrentUser, {})) as CurrentUser;
  } catch {
    redirect("/sign-in");
  }

  if (currentUser?.role !== "creator") {
    redirect("/unauthorized");
  }

  return {
    userId,
    convex,
  };
}
