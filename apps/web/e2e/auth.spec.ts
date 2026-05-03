import { test, expect } from "@playwright/test";

test.describe("Authentication — Sign-up", () => {
  test("renders the sign-up page", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.locator("form")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/sign-up/);
  });

  test("shows error for duplicate email", async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL ?? "test@example.com";
    await page.goto("/sign-up");
    await page.waitForSelector("input[name='emailAddress']", { timeout: 15_000 });
    await page.fill("input[name='emailAddress']", email);
    await page.click("button[type='submit']");
    await expect(
      page.locator("text=/already|exists|taken/i"),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Authentication — Sign-in", () => {
  test("renders the sign-in page", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("form")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/sign-in/);
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/sign-in");
    await page.waitForSelector("input[name='identifier']", { timeout: 15_000 });
    await page.fill("input[name='identifier']", "nobody@invalid.test");
    await page.click("button[type='submit']");
    await page.waitForSelector("input[name='password']", { timeout: 10_000 });
    await page.fill("input[name='password']", "wrongpassword");
    await page.click("button[type='submit']");
    await expect(
      page.locator("text=/invalid|incorrect|not found/i"),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test("redirects to dashboard after successful sign-in", async ({ page }) => {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    if (!email || !password) {
      test.skip();
      return;
    }
    await page.goto("/sign-in");
    await page.waitForSelector("input[name='identifier']", { timeout: 15_000 });
    await page.fill("input[name='identifier']", email);
    await page.click("button[type='submit']");
    await page.waitForSelector("input[name='password']", { timeout: 10_000 });
    await page.fill("input[name='password']", password);
    await page.click("button[type='submit']");
    await page.waitForURL(/\/(dashboard|onboarding|w\/)/, { timeout: 20_000 });
    await expect(page).not.toHaveURL(/sign-in/);
  });
});
