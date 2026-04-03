import { test, expect } from "@playwright/test";

test.describe("Dark mode toggle", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure consistent starting state
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("x-read-theme"));
    await page.reload();
  });

  test("toggles dark class on <html> and changes background color", async ({
    page,
  }) => {
    // Initial state: light mode
    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);

    const lightBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );

    // Click toggle to switch to dark mode
    await page.click('button[title="Switch to dark mode"]');

    await expect(html).toHaveClass(/dark/);

    const darkBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );

    // The two background colors must be different
    expect(darkBg).not.toBe(lightBg);

    // Click again to switch back to light
    await page.click('button[title="Switch to light mode"]');

    await expect(html).not.toHaveClass(/dark/);

    const revertedBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );
    expect(revertedBg).toBe(lightBg);
  });

  test("persists dark mode preference across page reload", async ({
    page,
  }) => {
    await page.click('button[title="Switch to dark mode"]');
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();

    // After reload, dark mode should still be active
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
