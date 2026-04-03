import { test, expect } from "@playwright/test";

const MOCK_TWEET_RESPONSE = {
  tweet: {
    id: "123",
    text: "Hello world from test!",
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
  markdown: "# Tweet by @testuser\n\nHello world from test!\n\n---\n\n**Author:** Test User (@testuser)",
};

const MOCK_SSE_STREAM =
  'data: {"text":"# @testuser 的推文\\n\\n"}\n\ndata: {"text":"来自测试的你好世界！"}\n\ndata: [DONE]\n\n';

test.describe("Fetch and translate flow", () => {
  test("fetches tweet and displays content with translation", async ({
    page,
  }) => {
    // Mock API routes
    await page.route("**/api/fetch-tweet", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TWEET_RESPONSE),
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

    // Type URL and submit
    await page.fill(
      'input[type="text"]',
      "https://x.com/testuser/status/123"
    );
    await page.click('button:has-text("Fetch")');

    // Wait for tweet author info card
    await expect(page.getByText("Test User @testuser")).toBeVisible({
      timeout: 10_000,
    });

    // Wait for original content to render
    await expect(page.locator("text=Hello world from test!")).toBeVisible({
      timeout: 10_000,
    });

    // Wait for translated content
    await expect(page.locator("text=来自测试的你好世界")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows error for invalid URL", async ({ page }) => {
    await page.route("**/api/fetch-tweet", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Invalid Twitter/X URL" }),
      });
    });

    await page.goto("/");
    await page.fill('input[type="text"]', "https://google.com");
    await page.click('button:has-text("Fetch")');

    await expect(page.locator("text=Invalid Twitter/X URL")).toBeVisible({
      timeout: 10_000,
    });
  });
});
