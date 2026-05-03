import { test as base, type Page } from "@playwright/test";

export type AuthFixtures = {
  authedPage: Page;
};

async function signIn(page: Page): Promise<void> {
  const email = process.env.E2E_USER_EMAIL ?? "test@example.com";
  const password = process.env.E2E_USER_PASSWORD ?? "TestPassword123!";

  await page.goto("/sign-in");
  await page.waitForSelector("input[name='identifier']", { timeout: 15_000 });
  await page.fill("input[name='identifier']", email);
  await page.click("button[type='submit']");
  await page.waitForSelector("input[name='password']", { timeout: 10_000 });
  await page.fill("input[name='password']", password);
  await page.click("button[type='submit']");
  await page.waitForURL(/\/(dashboard|onboarding|w\/)/, { timeout: 20_000 });
}

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await signIn(page);
    await use(page);
  },
});

export { expect } from "@playwright/test";
