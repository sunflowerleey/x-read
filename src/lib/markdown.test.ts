import { describe, it, expect } from "vitest";
import { tweetToMarkdown, articleToMarkdown } from "./markdown";
import { TweetData } from "./types";

const baseTweet: TweetData = {
  id: "123",
  text: "Hello world!",
  authorName: "Test User",
  authorHandle: "testuser",
  authorAvatar: "https://example.com/avatar.jpg",
  createdAt: "Mon Jan 01 00:00:00 +0000 2026",
  language: "en",
  likes: 100,
  retweets: 50,
  replies: 10,
  media: [],
  isArticle: false,
};

describe("tweetToMarkdown", () => {
  it("generates basic tweet markdown", () => {
    const md = tweetToMarkdown(baseTweet);
    expect(md).toContain("# Tweet by @testuser");
    expect(md).toContain("Hello world!");
    expect(md).toContain("**Author:** Test User (@testuser)");
    expect(md).toContain("**Likes:** 100");
    expect(md).toContain("[View Original](https://x.com/testuser/status/123)");
  });

  it("includes quoted tweet as blockquote", () => {
    const tweet: TweetData = {
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
    const tweet: TweetData = {
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
    const tweet: TweetData = { ...baseTweet, likes: 1234567 };
    const md = tweetToMarkdown(tweet);
    expect(md).toContain("1,234,567");
  });
});

describe("articleToMarkdown", () => {
  it("prepends article title when missing from content", () => {
    const tweet: TweetData = {
      ...baseTweet,
      isArticle: true,
      articleTitle: "My Article Title",
    };
    const md = articleToMarkdown("Some content here.", tweet);
    expect(md).toContain("# My Article Title");
    expect(md).toContain("Some content here.");
  });

  it("does not duplicate title if already in content", () => {
    const tweet: TweetData = {
      ...baseTweet,
      isArticle: true,
      articleTitle: "My Article Title",
    };
    const md = articleToMarkdown("# My Article Title\n\nContent.", tweet);
    const titleCount = (md.match(/# My Article Title/g) || []).length;
    expect(titleCount).toBe(1);
  });

  it("adds subtitle when available", () => {
    const tweet: TweetData = {
      ...baseTweet,
      isArticle: true,
      articleTitle: "Title",
      articleSubtitle: "A deep dive",
    };
    const md = articleToMarkdown("Content.", tweet);
    expect(md).toContain("### A deep dive");
  });

  it("does not duplicate subtitle if in content", () => {
    const tweet: TweetData = {
      ...baseTweet,
      isArticle: true,
      articleSubtitle: "A deep dive",
    };
    const md = articleToMarkdown("A deep dive into the topic.\n\nMore.", tweet);
    expect(md).not.toContain("### A deep dive");
  });

  it("includes footer with author and stats", () => {
    const md = articleToMarkdown("Content.", baseTweet);
    expect(md).toContain("---");
    expect(md).toContain("**Author:** Test User (@testuser)");
    expect(md).toContain("[View Original]");
  });
});
