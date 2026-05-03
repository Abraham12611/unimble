import { test, expect } from "./fixtures/base";

test.describe("Learning hub", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("learning page renders", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/learning`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("learning resources are categorised", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/learning`);
    await expect(
      page.locator("text=/guide|tutorial|video|article/i").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
