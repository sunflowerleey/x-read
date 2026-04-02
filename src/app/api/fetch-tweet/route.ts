import { NextRequest, NextResponse } from "next/server";
import {
  parseTweetUrl,
  fetchTweet,
  fetchArticleContent,
} from "@/lib/twitter";
import { tweetToMarkdown, articleToMarkdown } from "@/lib/markdown";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const parsed = parseTweetUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid Twitter/X URL" },
        { status: 400 }
      );
    }

    const tweet = await fetchTweet(parsed.tweetId);

    let markdown: string;

    // If it's an article or the tweet has article data, fetch full article content
    if (parsed.isArticle || tweet.isArticle) {
      // Reconstruct canonical URL from parsed data instead of forwarding user input
      const canonicalUrl = `https://x.com/${parsed.screenName}/article/${parsed.tweetId}`;
      const articleContent = await fetchArticleContent(canonicalUrl);
      markdown = articleToMarkdown(articleContent, tweet);
      // Detect language from content for articles (FxTwitter may return null lang)
      if (!tweet.language || tweet.language === "unknown") {
        const sample = articleContent.slice(0, 500);
        const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
        tweet.language = chineseChars > sample.length * 0.1 ? "zh" : "en";
      }
    } else {
      markdown = tweetToMarkdown(tweet);
    }

    return NextResponse.json({ tweet, markdown });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch tweet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
