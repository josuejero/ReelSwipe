import { test, expect } from "@playwright/test";

test("metrics page loads", async ({ page }) => {
  await page.goto("/metrics");
  await expect(page.getByRole("heading", { name: /metrics/i })).toBeVisible();
});

test("metrics page shows helpful message when token missing", async ({ page }) => {
  await page.goto("/metrics");
  await expect(page.getByText(/Missing/i)).toBeVisible();
});
