import { describe, it, expect } from "vitest";
import { parseTweetUrl } from "./twitter";

describe("parseTweetUrl", () => {
  it("parses standard x.com status URL", () => {
    const result = parseTweetUrl("https://x.com/elonmusk/status/123456789");
    expect(result).toEqual({
      screenName: "elonmusk",
      tweetId: "123456789",
      isArticle: false,
    });
  });

  it("parses twitter.com status URL", () => {
    const result = parseTweetUrl(
      "https://twitter.com/user/status/987654321"
    );
    expect(result).toEqual({
      screenName: "user",
      tweetId: "987654321",
      isArticle: false,
    });
  });

  it("parses x.com article URL", () => {
    const result = parseTweetUrl(
      "https://x.com/troyhua/article/2039052328070734102"
    );
    expect(result).toEqual({
      screenName: "troyhua",
      tweetId: "2039052328070734102",
      isArticle: true,
    });
  });

  it("handles URL with query params", () => {
    const result = parseTweetUrl(
      "https://x.com/user/status/111?s=20&t=abc"
    );
    expect(result).not.toBeNull();
    expect(result!.tweetId).toBe("111");
  });

  it("handles URL with www prefix", () => {
    const result = parseTweetUrl(
      "https://www.twitter.com/user/status/222"
    );
    expect(result).not.toBeNull();
    expect(result!.tweetId).toBe("222");
  });

  it("handles URL without https", () => {
    const result = parseTweetUrl("x.com/user/status/333");
    expect(result).not.toBeNull();
    expect(result!.tweetId).toBe("333");
  });

  it("trims whitespace", () => {
    const result = parseTweetUrl(
      "  https://x.com/user/status/444  "
    );
    expect(result).not.toBeNull();
    expect(result!.tweetId).toBe("444");
  });

  it("returns null for invalid URLs", () => {
    expect(parseTweetUrl("https://google.com")).toBeNull();
    expect(parseTweetUrl("not a url")).toBeNull();
    expect(parseTweetUrl("")).toBeNull();
    expect(parseTweetUrl("https://x.com/user")).toBeNull();
  });
});
