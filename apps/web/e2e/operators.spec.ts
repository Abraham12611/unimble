import { test, expect } from "./fixtures/base";

test.describe("Operators — deploy wizard", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("operators list page renders", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/operators`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("deploy button opens wizard", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/operators`);
    const deployBtn = page.locator(
      "a[href*='deploy'], button:has-text('Deploy'), button:has-text('New operator')",
    ).first();
    if (await deployBtn.isVisible()) {
      await deployBtn.click();
      await expect(page).toHaveURL(/operators.*deploy/, { timeout: 10_000 });
    }
  });

  test("deploy wizard shows operator type selector", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/operators/deploy`);
    await expect(
      page.locator("text=/content|growth|community|feedback|documentation/i").first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("operator detail page renders for existing operator", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/operators`);

    const operatorLink = page.locator("a[href*='/operators/']").first();
    if (await operatorLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await operatorLink.click();
      await expect(page).toHaveURL(/\/operators\//, { timeout: 10_000 });
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
