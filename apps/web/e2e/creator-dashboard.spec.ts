import { expect, test } from "@playwright/test";

/**
 * Creator Dashboard UI tests (Phase 9.11).
 *
 * These tests cover the client-side behaviour of the creator pages by
 * loading them directly in the browser. Because Clerk auth is present,
 * unauthenticated visits redirect to /sign-in — tested in auth-guards.
 *
 * The "authenticated creator" tests below are skipped until a seeded
 * test account is wired in; they document the expected flows for
 * future CI integration.
 *
 * Steps covered: 9.7.1.1–9.7.1.6, 9.7.2.1–9.7.2.6
 */

// ---------------------------------------------------------------------------
// Auth guard (unauthenticated) — functional now
// ---------------------------------------------------------------------------

test.describe("Creator dashboard — unauthenticated", () => {
  test("redirects /creator to /sign-in", async ({ page }) => {
    await page.goto("/creator", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("redirects /creator/organizations to /sign-in", async ({ page }) => {
    await page.goto("/creator/organizations", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("redirects /creator/organizations/[id] to /sign-in", async ({ page }) => {
    await page.goto("/creator/organizations/org1", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ---------------------------------------------------------------------------
// Creator Overview — authenticated flow (skipped until test account seeded)
// ---------------------------------------------------------------------------

test.describe("Creator dashboard — authenticated creator", () => {
  test.skip(true, "Requires seeded creator test account — TODO: wire Clerk test session");

  test("renders platform stats section", async ({ page }) => {
    await page.goto("/creator");
    await expect(page.getByText("Platform Stats")).toBeVisible();
    await expect(page.getByText("Total Orgs")).toBeVisible();
    await expect(page.getByText("Total MRR")).toBeVisible();
  });

  test("renders revenue metrics section", async ({ page }) => {
    await page.goto("/creator");
    await expect(page.getByText("Revenue Metrics")).toBeVisible();
  });

  test("renders system health section", async ({ page }) => {
    await page.goto("/creator");
    await expect(page.getByText("System Health")).toBeVisible();
  });

  test("renders recent activity section", async ({ page }) => {
    await page.goto("/creator");
    await expect(page.getByText("Recent Activity")).toBeVisible();
  });

  test("Manage Orgs button navigates to /creator/organizations", async ({ page }) => {
    await page.goto("/creator");
    await page.getByRole("link", { name: /manage orgs/i }).click();
    await expect(page).toHaveURL("/creator/organizations");
  });
});

// ---------------------------------------------------------------------------
// Org Management — authenticated flow (skipped until test account seeded)
// ---------------------------------------------------------------------------

test.describe("Org Management list — authenticated creator", () => {
  test.skip(true, "Requires seeded creator test account — TODO: wire Clerk test session");

  test("renders org list with search input", async ({ page }) => {
    await page.goto("/creator/organizations");
    await expect(page.getByPlaceholder(/search orgs/i)).toBeVisible();
  });

  test("status filter narrows the list", async ({ page }) => {
    await page.goto("/creator/organizations");
    const select = page.getByRole("combobox").first();
    await select.selectOption("blocked");
    // After filter: only blocked orgs remain
    const rows = page.locator("text=blocked");
    await expect(rows.first()).toBeVisible();
  });

  test("plan filter narrows the list", async ({ page }) => {
    await page.goto("/creator/organizations");
    const planSelect = page.getByRole("combobox").nth(1);
    await planSelect.selectOption("Enterprise");
    await expect(page.getByText("Enterprise")).toBeVisible();
  });

  test("Block button shows confirmation step", async ({ page }) => {
    await page.goto("/creator/organizations");
    await page
      .getByRole("button", { name: /^block$/i })
      .first()
      .click();
    await expect(page.getByRole("button", { name: /confirm block/i })).toBeVisible();
  });

  test("Cancel on block confirm dismisses confirmation", async ({ page }) => {
    await page.goto("/creator/organizations");
    await page
      .getByRole("button", { name: /^block$/i })
      .first()
      .click();
    await page
      .getByRole("button", { name: /cancel/i })
      .first()
      .click();
    await expect(page.getByRole("button", { name: /^block$/i })).toBeVisible();
  });

  test("Details link navigates to org detail page", async ({ page }) => {
    await page.goto("/creator/organizations");
    await page
      .getByRole("link", { name: /details/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/creator\/organizations\/.+/);
  });
});

// ---------------------------------------------------------------------------
// Org Detail — authenticated flow (skipped until test account seeded)
// ---------------------------------------------------------------------------

test.describe("Org Detail page — authenticated creator", () => {
  test.skip(true, "Requires seeded creator test account — TODO: wire Clerk test session");

  test("renders org name in header", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("renders all six tabs", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    for (const label of ["Overview", "Users", "Usage", "Billing", "Activity", "Settings"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("Overview tab: org info table is visible", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await expect(page.getByText("Organisation Info")).toBeVisible();
  });

  test("Users tab: renders team members list", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: "Users" }).click();
    await expect(page.getByText("Team Members")).toBeVisible();
  });

  test("Usage tab: shows usage vs limits progress bars", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: "Usage" }).click();
    await expect(page.getByText("Usage vs Limits")).toBeVisible();
  });

  test("Usage tab: Override Limits form applies values", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: "Usage" }).click();
    await page.getByRole("button", { name: /override limits/i }).click();
    await page.getByLabel("Max Operators").fill("50");
    await page.getByRole("button", { name: /save overrides/i }).click();
    // Panel should close after save
    await expect(page.getByLabel("Max Operators")).not.toBeVisible();
    // New limit reflected in progress bar label
    await expect(page.getByText("50")).toBeVisible();
  });

  test("Billing tab: renders billing history table", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: "Billing" }).click();
    await expect(page.getByText("Billing History")).toBeVisible();
  });

  test("Activity tab: renders org activity log", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByText("Org Activity Log")).toBeVisible();
  });

  test("Settings tab: Danger Zone delete has confirm step", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /delete organisation/i }).click();
    await expect(page.getByRole("button", { name: /confirm delete/i })).toBeVisible();
  });

  test("Block org shows confirmation banner", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: /block organisation/i }).click();
    await expect(page.getByText(/are you sure you want to block/i)).toBeVisible();
  });

  test("Cancel block dismisses confirmation banner", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: /block organisation/i }).click();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.getByText(/are you sure you want to block/i)).not.toBeVisible();
  });

  test("Notes: add note saves it to the list", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("button", { name: /add note/i }).click();
    await page.getByPlaceholder(/add an internal note/i).fill("Test note from Playwright");
    await page.getByRole("button", { name: /save note/i }).click();
    await expect(page.getByText("Test note from Playwright")).toBeVisible();
  });

  test("breadcrumb Organisations link navigates back to list", async ({ page }) => {
    await page.goto("/creator/organizations/org1");
    await page.getByRole("link", { name: /organisations/i }).click();
    await expect(page).toHaveURL("/creator/organizations");
  });
});
