import { expect, test } from "@playwright/test";

/**
 * Phase 9 page-structure smoke tests.
 *
 * These tests verify that each Phase 9 page correctly redirects
 * unauthenticated visitors, confirming the pages exist and the auth
 * middleware is wired. Full authenticated flows require a seeded test
 * account and are covered in creator.spec.ts and org-management.spec.ts.
 *
 * Steps covered: 9.7.1.1–9.7.1.6 (page existence + auth guard)
 */

// ---------------------------------------------------------------------------
// Learning & Insights (Phase 9.10)
// ---------------------------------------------------------------------------

test("learning page is auth-guarded", async ({ page }) => {
  // The workspace slug is dynamic; test the generic path pattern
  await page.goto("/w/test-workspace/learning", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});

// ---------------------------------------------------------------------------
// Analytics pages (Phase 9.9)
// ---------------------------------------------------------------------------

test("analytics page is auth-guarded", async ({ page }) => {
  await page.goto("/w/test-workspace/analytics", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});

test("analytics costs page is auth-guarded", async ({ page }) => {
  await page.goto("/w/test-workspace/analytics/costs", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});

// ---------------------------------------------------------------------------
// Settings pages (Phase 9.7)
// ---------------------------------------------------------------------------

const SETTINGS_ROUTES = [
  "/w/test-workspace/settings",
  "/w/test-workspace/settings/general",
  "/w/test-workspace/settings/team",
  "/w/test-workspace/settings/roles",
  "/w/test-workspace/settings/notifications",
  "/w/test-workspace/settings/billing",
  "/w/test-workspace/settings/api",
  "/w/test-workspace/settings/danger",
];

for (const route of SETTINGS_ROUTES) {
  test(`${route} is auth-guarded`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

// ---------------------------------------------------------------------------
// Account pages (Phase 9.8)
// ---------------------------------------------------------------------------

const ACCOUNT_ROUTES = [
  "/account/profile",
  "/account/security",
  "/account/notifications",
  "/account/preferences",
];

for (const route of ACCOUNT_ROUTES) {
  test(`${route} is auth-guarded`, async ({ page }) => {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

// ---------------------------------------------------------------------------
// Creator dashboard (Phase 9.11)
// ---------------------------------------------------------------------------

test("creator dashboard is auth-guarded", async ({ page }) => {
  await page.goto("/creator", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});

test("creator organizations list is auth-guarded", async ({ page }) => {
  await page.goto("/creator/organizations", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});

test("creator organization detail is auth-guarded", async ({ page }) => {
  await page.goto("/creator/organizations/org1", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});
