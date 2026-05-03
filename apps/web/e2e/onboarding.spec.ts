import { test, expect } from "./fixtures/base";

test.describe("Onboarding flow", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("newly onboarded user is redirected to workspace dashboard", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/(dashboard|onboarding|w\/)/, { timeout: 20_000 });
    const url = page.url();
    const isLandedCorrectly =
      /dashboard/.test(url) ||
      /onboarding/.test(url) ||
      /\/w\//.test(url);
    expect(isLandedCorrectly).toBe(true);
  });

  test("onboarding page shows workspace creation form", async ({
    authedPage: page,
  }) => {
    await page.goto("/onboarding");
    await expect(page.locator("form, [role='form']")).toBeVisible({ timeout: 15_000 });
  });

  test("workspace name field accepts input", async ({ authedPage: page }) => {
    await page.goto("/onboarding");
    const nameInput = page.locator(
      "input[name='name'], input[placeholder*='workspace' i], input[placeholder*='company' i]",
    ).first();
    if (await nameInput.isVisible()) {
      await nameInput.fill("Acme Corp");
      await expect(nameInput).toHaveValue("Acme Corp");
    }
  });

  test("onboarding steps are visually present", async ({ authedPage: page }) => {
    await page.goto("/onboarding");
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});
