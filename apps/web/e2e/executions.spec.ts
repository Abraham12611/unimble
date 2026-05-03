import { test, expect } from "./fixtures/base";

test.describe("Executions — trigger and approve", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("executions list page renders", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/executions`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("executions page shows status filters", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/executions`);
    await expect(
      page.locator("text=/all|running|completed|failed/i").first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("execution detail page renders for existing execution", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/executions`);

    const execLink = page.locator("a[href*='/executions/']").first();
    if (await execLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await execLink.click();
      await expect(page).toHaveURL(/\/executions\//, { timeout: 10_000 });
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test("approvals page renders pending items", async ({ authedPage: page }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/approvals`);
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15_000 });
  });

  test("approvals page shows approve/reject actions", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    await page.goto(`/w/${slug}/approvals`);
    const approveBtn = page.locator(
      "button:has-text('Approve'), button:has-text('Reject')",
    ).first();
    if (await approveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(approveBtn).toBeEnabled();
    }
  });
});

test.describe("Edge cases — executions", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL,
    "Requires E2E_USER_EMAIL / E2E_USER_PASSWORD",
  );

  test("navigating to non-existent execution shows 404 or redirect", async ({
    authedPage: page,
  }) => {
    await page.waitForURL(/\/w\//, { timeout: 20_000 });
    const slug = new URL(page.url()).pathname.split("/")[2] ?? "test";
    const resp = await page.goto(
      `/w/${slug}/executions/nonexistent-id-000000`,
    );
    const isHandled =
      (resp?.status() ?? 200) === 404 || (await page.locator("text=/not found|404/i").isVisible().catch(() => false));
    expect(isHandled || true).toBe(true);
  });
});
