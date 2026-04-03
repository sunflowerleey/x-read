import { test, expect } from "@playwright/test";

test.describe("Page load", () => {
  test("renders heading and input", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("X-Read");
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await expect(page.locator('button:has-text("Fetch")')).toBeDisabled();
  });

  test("enables Fetch button when URL is entered", async ({ page }) => {
    await page.goto("/");
    await page.fill('input[type="text"]', "https://x.com/user/status/123");
    await expect(page.locator('button:has-text("Fetch")')).toBeEnabled();
  });
});
