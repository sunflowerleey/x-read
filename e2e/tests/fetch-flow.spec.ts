import { test, expect } from "@playwright/test";

const MOCK_TWITTER_RESPONSE = {
  content: {
    source: "twitter",
    title: "Tweet by @testuser",
    url: "https://x.com/testuser/status/123",
    authorName: "Test User",
    authorHandle: "testuser",
    authorAvatar: "",
    createdAt: "2026-01-01",
    language: "en",
    likes: 42,
    retweets: 10,
    replies: 5,
    media: [],
    isArticle: false,
  },
  markdown:
    "# Tweet by @testuser\n\nHello world from test!\n\n---\n\n**Author:** Test User (@testuser)",
};

const MOCK_WEBPAGE_RESPONSE = {
  content: {
    source: "webpage",
    title: "Example Blog Post",
    url: "https://example.com/post",
    authorName: "example.com",
    authorHandle: "example.com",
    authorAvatar: "",
    createdAt: "2026-01-01",
    language: "en",
  },
  markdown:
    "# Example Blog Post\n\nThis is a blog post.\n\n---\n\n**Source:** example.com",
};

const MOCK_SSE_STREAM =
  'data: {"text":"# @testuser 的推文\\n\\n"}\n\ndata: {"text":"来自测试的你好世界！"}\n\ndata: [DONE]\n\n';

test.describe("Fetch and translate flow", () => {
  test("fetches tweet and displays content with translation", async ({
    page,
  }) => {
    await page.route("**/api/fetch-content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TWITTER_RESPONSE),
      });
    });

    await page.route("**/api/translate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: MOCK_SSE_STREAM,
      });
    });

    await page.goto("/");

    await page.fill(
      'input[type="text"]',
      "https://x.com/testuser/status/123"
    );
    await page.click('button:has-text("Fetch")');

    await expect(page.getByText("Test User @testuser")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.locator("text=Hello world from test!")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.locator("text=来自测试的你好世界")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("fetches generic webpage content", async ({ page }) => {
    await page.route("**/api/fetch-content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_WEBPAGE_RESPONSE),
      });
    });

    await page.route("**/api/translate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"text":"# 示例博客文章"}\n\ndata: [DONE]\n\n',
      });
    });

    await page.goto("/");

    await page.fill('input[type="text"]', "https://example.com/post");
    await page.click('button:has-text("Fetch")');

    await expect(page.getByRole("heading", { name: "Example Blog Post" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/example\.com \·/)).toBeVisible();
  });

  test("skips translation API call when translate toggle is off", async ({
    page,
  }) => {
    await page.route("**/api/fetch-content", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TWITTER_RESPONSE),
      });
    });

    // If the translate toggle is working, /api/translate MUST NOT be called
    let translateCalled = false;
    await page.route("**/api/translate", async (route) => {
      translateCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: MOCK_SSE_STREAM,
      });
    });

    await page.goto("/");

    // Uncheck the translate toggle
    const toggle = page.getByRole("checkbox", { name: /翻译/ });
    await expect(toggle).toBeChecked(); // defaults to true
    await toggle.uncheck();

    await page.fill(
      'input[type="text"]',
      "https://x.com/testuser/status/123"
    );
    await page.click('button:has-text("Fetch")');

    // Original English content appears
    await expect(page.locator("text=Hello world from test!")).toBeVisible({
      timeout: 10_000,
    });

    // Give any pending translate request time to fire
    await page.waitForTimeout(500);
    expect(translateCalled).toBe(false);

    // Translated text should NOT appear
    await expect(page.locator("text=来自测试的你好世界")).not.toBeVisible();
  });

  test("shows error for invalid URL", async ({ page }) => {
    await page.route("**/api/fetch-content", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Please enter a valid URL (starting with https://)",
        }),
      });
    });

    await page.goto("/");
    await page.fill('input[type="text"]', "not a url");
    await page.click('button:has-text("Fetch")');

    await expect(
      page.locator("text=Please enter a valid URL")
    ).toBeVisible({ timeout: 10_000 });
  });
});
