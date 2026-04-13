import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWebpage } from "./webpage";

const MOCK_JINA_RESPONSE = `Title: Test Article Title

URL Source: https://example.com/post

Published Time: 2026-01-15

Markdown Content:
# Test Article Title

This is the article content.

## Section Two

More content here.`;

const MOCK_JINA_CHINESE = `Title: 中文文章

URL Source: https://example.cn/post

Markdown Content:
# 中文文章标题

这是一篇中文文章，包含很多中文字符来确保语言检测能正确识别为中文。
这段文字的目的是让中文字符占比超过百分之十。`;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWebpage", () => {
  it("fetches and parses Jina Reader output", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(MOCK_JINA_RESPONSE, { status: 200 })
    );

    const { content, markdown } = await fetchWebpage("https://example.com/post");

    expect(content.source).toBe("webpage");
    expect(content.title).toBe("Test Article Title");
    expect(content.authorName).toBe("example.com");
    expect(content.createdAt).toBe("2026-01-15");
    expect(content.language).toBe("en");
    expect(markdown).toContain("# Test Article Title");
    expect(markdown).toContain("## Section Two");
  });

  it("detects Chinese language", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(MOCK_JINA_CHINESE, { status: 200 })
    );

    const { content } = await fetchWebpage("https://example.cn/post");

    expect(content.language).toBe("zh");
  });

  it("uses hostname as fallback title", async () => {
    const noTitle = "Markdown Content:\nSome content without title header.";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(noTitle, { status: 200 })
    );

    const { content } = await fetchWebpage("https://blog.example.org/post");

    expect(content.title).toBe("blog.example.org");
  });

  it("strips www from hostname", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(MOCK_JINA_RESPONSE, { status: 200 })
    );

    const { content } = await fetchWebpage("https://www.example.com/post");

    expect(content.authorHandle).toBe("example.com");
  });

  it("throws on fetch failure when both Jina and direct fail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    await expect(fetchWebpage("https://example.com/404")).rejects.toThrow(
      "Failed to fetch webpage: 404"
    );
  });

  it("falls back to direct HTML fetch when Jina returns 403 warning", async () => {
    const jina403 = `Title: Error

URL Source: https://transformer-circuits.pub/2026/emotions/index.html

Warning: Target URL returned error 403: Forbidden
Warning: This is a cached snapshot of the original page, consider retry with caching opt-out.

Markdown Content:`;

    const directHtml = `<html>
<head><title>Emotion Concepts in LLMs</title></head>
<body>
  <h2>Introduction</h2>
  <p>This paper explores emotion representations.</p>
</body>
</html>`;

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(jina403, { status: 200 }))
      .mockResolvedValueOnce(new Response(directHtml, { status: 200 }));

    const { content, markdown } = await fetchWebpage(
      "https://transformer-circuits.pub/2026/emotions/index.html"
    );

    expect(content.title).toBe("Emotion Concepts in LLMs");
    expect(content.source).toBe("webpage");
    expect(markdown).toContain("## Introduction");
    expect(markdown).toContain("emotion representations");
  });

  it("falls back to direct HTML fetch when Jina returns empty content", async () => {
    const jinaEmpty = `Title: Some Page

URL Source: https://example.com/page

Markdown Content:
`;

    const directHtml = `<html>
<head><title>Real Content</title></head>
<body><h1>Hello</h1><p>World</p></body>
</html>`;

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(jinaEmpty, { status: 200 }))
      .mockResolvedValueOnce(new Response(directHtml, { status: 200 }));

    const { content, markdown } = await fetchWebpage("https://example.com/page");

    expect(content.title).toBe("Real Content");
    expect(markdown).toContain("# Hello");
    expect(markdown).toContain("World");
  });
});
