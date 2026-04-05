import { test } from "@playwright/test";

test("/dashboard redirects unauthenticated users to /sign-in", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/sign-in/);
});

test("/creator redirects unauthenticated users to /sign-in", async ({ page }) => {
  await page.goto("/creator", { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/sign-in/);
});
