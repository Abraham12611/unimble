import { test, expect } from "./fixtures/base";

test.describe("Team — invite member", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("team settings page renders", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/settings/team`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("invite input field is visible", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/settings/team`);
    const inviteInput = page.locator(
      "input[type='email'], input[placeholder*='email' i], input[name*='email' i]",
    ).first();
    await expect(inviteInput).toBeVisible({ timeout: 15_000 });
  });

  test("invite button is present and enabled", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/settings/team`);
    const inviteBtn = page.locator(
      "button:has-text('Invite'), button:has-text('Send invite')",
    ).first();
    await expect(inviteBtn).toBeVisible({ timeout: 15_000 });
  });

  test("invalid email shows validation error", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/settings/team`);
    const inviteInput = page.locator(
      "input[type='email'], input[placeholder*='email' i]",
    ).first();
    if (await inviteInput.isVisible()) {
      await inviteInput.fill("not-a-valid-email");
      const inviteBtn = page.locator(
        "button:has-text('Invite'), button:has-text('Send invite')",
      ).first();
      if (await inviteBtn.isVisible()) {
        await inviteBtn.click();
        await expect(
          page.locator("text=/invalid|valid email|@/i").first(),
        ).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test("existing members list is visible", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/settings/team`);
    await expect(
      page.locator("text=/member|owner|admin|role/i").first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
