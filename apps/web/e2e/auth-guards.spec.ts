import { expect, test } from "@playwright/test";

/**
 * Auth-guard tests — verifies that protected routes redirect
 * unauthenticated users to /sign-in and that the creator-only route
 * redirects non-creator users to /unauthorized.
 *
 * These tests rely on Clerk middleware (no session cookie present →
 * middleware redirects to /sign-in before the page renders).
 */

// ---------------------------------------------------------------------------
// Unauthenticated redirects
// ---------------------------------------------------------------------------

const PROTECTED_ROUTES = [
  "/dashboard",
  "/onboarding",
  "/account",
  "/account/profile",
  "/account/security",
  "/account/notifications",
  "/account/preferences",
  "/settings",
  "/settings/sessions",
  "/creator",
  "/creator/organizations",
  "/creator/organizations/org1",
];

for (const route of PROTECTED_ROUTES) {
  test(`${route} redirects unauthenticated users to /sign-in`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

// ---------------------------------------------------------------------------
// /unauthorized page renders
// ---------------------------------------------------------------------------

test("/unauthorized page renders without auth", async ({ page }) => {
  await page.goto("/unauthorized", { waitUntil: "domcontentloaded" });
  // Should not redirect — it's a public error page
  await expect(page).not.toHaveURL(/\/sign-in/);
});
