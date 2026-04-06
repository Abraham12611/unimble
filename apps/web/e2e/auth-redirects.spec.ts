import { expect, test } from "@playwright/test";

test("/dashboard redirects unauthenticated users to /sign-in", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});

test("/settings redirects unauthenticated users to /sign-in", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in/);
});
