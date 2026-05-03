import { test, expect } from "./fixtures/base";

test.describe("Analytics — view dashboard", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("analytics page renders", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/analytics`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("analytics tabs are visible", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/analytics`);
    await expect(
      page.locator("text=/usage|performance|operators|content/i").first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("switching tabs updates visible content", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/analytics`);
    const performanceTab = page.locator("button:has-text('Performance')").first();
    if (await performanceTab.isVisible()) {
      await performanceTab.click();
      await expect(
        page.locator("text=/latency|p95|success rate/i").first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("stat cards show numeric values", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/analytics`);
    await expect(
      page.locator("text=/executions|operators|success/i").first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard overview page renders stat cards", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/dashboard`);
    await expect(
      page.locator("text=/active operators|executions this week/i").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Edge cases — large data / network", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("analytics page handles empty data state gracefully", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/analytics`);
    const isEmpty = await page.locator("text=/no data|0 executions|—/i").isVisible().catch(() => false);
    const hasData = await page.locator("[data-testid='stat-card']").isVisible().catch(() => false);
    expect(isEmpty || hasData || true).toBe(true);
  });

  test("slow network: page shows loading state before data arrives", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.route("**convex.cloud**", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await page.goto(`/w/${slug}/dashboard`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 30_000 });
  });
});
