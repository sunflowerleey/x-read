import { describe, it, expect } from "vitest";
import { tweetToMarkdown, articleToMarkdown, webpageToMarkdown } from "./markdown";
import { ContentData } from "./types";

const baseTweet: ContentData = {
  source: "twitter",
  title: "Tweet by @testuser",
  url: "https://x.com/testuser/status/123",
  authorName: "Test User",
  authorHandle: "testuser",
  authorAvatar: "https://example.com/avatar.jpg",
  createdAt: "Mon Jan 01 00:00:00 +0000 2026",
  language: "en",
  text: "Hello world from the tweet body!",
  likes: 100,
  retweets: 50,
  replies: 10,
  media: [],
  isArticle: false,
};

const baseWebpage: ContentData = {
  source: "webpage",
  title: "Some Blog Post",
  url: "https://example.com/post",
  authorName: "example.com",
  authorHandle: "example.com",
  authorAvatar: "",
  createdAt: "2026-01-01",
  language: "en",
};

describe("tweetToMarkdown", () => {
  it("generates basic tweet markdown with footer", () => {
    const md = tweetToMarkdown(baseTweet);
    expect(md).toContain("# Tweet by @testuser");
    expect(md).toContain("**Author:** Test User (@testuser)");
    expect(md).toContain("**Likes:** 100");
    expect(md).toContain("[View Original](https://x.com/testuser/status/123)");
  });

  it("includes the tweet text body", () => {
    const md = tweetToMarkdown(baseTweet);
    expect(md).toContain("Hello world from the tweet body!");
  });

  it("handles multiline tweet text", () => {
    const tweet: ContentData = {
      ...baseTweet,
      text: "Line one.\n\nLine two.\n\nLine three.",
    };
    const md = tweetToMarkdown(tweet);
    expect(md).toContain("Line one.");
    expect(md).toContain("Line two.");
    expect(md).toContain("Line three.");
  });

  it("includes quoted tweet as blockquote", () => {
    const tweet: ContentData = {
      ...baseTweet,
      quotedTweet: {
        text: "Original thought",
        authorName: "Quotee",
        authorHandle: "quotee",
      },
    };
    const md = tweetToMarkdown(tweet);
    expect(md).toContain("> **@quotee** (Quotee):");
    expect(md).toContain("> Original thought");
  });

  it("includes media as images/links", () => {
    const tweet: ContentData = {
      ...baseTweet,
      media: [
        { type: "photo", url: "https://img.com/1.jpg" },
        { type: "video", url: "https://vid.com/1.mp4" },
      ],
    };
    const md = tweetToMarkdown(tweet);
    expect(md).toContain("## Media");
    expect(md).toContain("![image](https://img.com/1.jpg)");
    expect(md).toContain("[video](https://vid.com/1.mp4)");
  });

  it("formats numbers with locale", () => {
    const tweet: ContentData = { ...baseTweet, likes: 1234567 };
    const md = tweetToMarkdown(tweet);
    expect(md).toContain("1,234,567");
  });
});

describe("articleToMarkdown", () => {
  it("prepends article title when missing from content", () => {
    const tweet: ContentData = {
      ...baseTweet,
      isArticle: true,
      articleTitle: "My Article Title",
    };
    const md = articleToMarkdown("Some content here.", tweet);
    expect(md).toContain("# My Article Title");
    expect(md).toContain("Some content here.");
  });

  it("does not duplicate title if already in content", () => {
    const tweet: ContentData = {
      ...baseTweet,
      isArticle: true,
      articleTitle: "My Article Title",
    };
    const md = articleToMarkdown("# My Article Title\n\nContent.", tweet);
    const titleCount = (md.match(/# My Article Title/g) || []).length;
    expect(titleCount).toBe(1);
  });

  it("adds subtitle when available", () => {
    const tweet: ContentData = {
      ...baseTweet,
      isArticle: true,
      articleTitle: "Title",
      articleSubtitle: "A deep dive",
    };
    const md = articleToMarkdown("Content.", tweet);
    expect(md).toContain("### A deep dive");
  });

  it("includes footer with author and stats", () => {
    const md = articleToMarkdown("Content.", baseTweet);
    expect(md).toContain("---");
    expect(md).toContain("**Author:** Test User (@testuser)");
    expect(md).toContain("[View Original]");
  });
});

describe("webpageToMarkdown", () => {
  it("adds title if not present in content", () => {
    const md = webpageToMarkdown("Some content.", baseWebpage);
    expect(md).toContain("# Some Blog Post");
    expect(md).toContain("Some content.");
  });

  it("does not duplicate title if already in content", () => {
    const md = webpageToMarkdown("# Some Blog Post\n\nContent.", baseWebpage);
    const titleCount = (md.match(/# Some Blog Post/g) || []).length;
    expect(titleCount).toBe(1);
  });

  it("uses Source instead of Author for webpages", () => {
    const md = webpageToMarkdown("Content.", baseWebpage);
    expect(md).toContain("**Source:** example.com");
    expect(md).not.toContain("**Author:**");
  });

  it("includes View Original link", () => {
    const md = webpageToMarkdown("Content.", baseWebpage);
    expect(md).toContain("[View Original](https://example.com/post)");
  });
});
