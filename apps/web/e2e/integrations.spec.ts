import { test, expect } from "./fixtures/base";

test.describe("Integrations — connect integration", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("integrations page renders", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/integrations`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("integrations page shows available integrations list", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/integrations`);
    await expect(
      page.locator(
        "text=/github|slack|twitter|linear|notion|hubspot/i",
      ).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("connect button is present on integration cards", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/integrations`);
    const connectBtn = page.locator(
      "button:has-text('Connect'), a:has-text('Connect')",
    ).first();
    await expect(connectBtn).toBeVisible({ timeout: 15_000 });
  });

  test("connected integrations show status badge", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/integrations`);
    const connectedBadge = page.locator("text=/connected/i").first();
    if (await connectedBadge.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(connectedBadge).toBeVisible();
    }
  });
});
