import { NextRequest, NextResponse } from "next/server";
import {
  isTwitterUrl,
  parseTweetUrl,
  fetchTweet,
  fetchArticleContent,
} from "@/lib/twitter";
import { fetchWebpage } from "@/lib/webpage";
import {
  tweetToMarkdown,
  articleToMarkdown,
  webpageToMarkdown,
} from "@/lib/markdown";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate it looks like a URL
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !isTwitterUrl(trimmed)) {
      return NextResponse.json(
        { error: "Please enter a valid URL (starting with https://)" },
        { status: 400 }
      );
    }

    // Twitter/X URLs get special handling with FxTwitter + Jina
    if (isTwitterUrl(trimmed)) {
      return handleTwitter(trimmed);
    }

    // All other URLs: generic Jina Reader fetch
    return handleWebpage(trimmed);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to fetch content";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleTwitter(url: string) {
  const parsed = parseTweetUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid Twitter/X URL" },
      { status: 400 }
    );
  }

  const canonicalUrl = `https://x.com/${parsed.screenName}/article/${parsed.tweetId}`;

  // Article URL — parallel fetch
  if (parsed.isArticle) {
    const [content, articleBody] = await Promise.all([
      fetchTweet(parsed.tweetId),
      fetchArticleContent(canonicalUrl),
    ]);
    const markdown = articleToMarkdown(articleBody, content);
    if (!content.language || content.language === "unknown") {
      const sample = articleBody.slice(0, 500);
      const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
      content.language = chineseChars > sample.length * 0.1 ? "zh" : "en";
    }
    return NextResponse.json({ content, markdown });
  }

  // Regular tweet — may discover it's an article
  const content = await fetchTweet(parsed.tweetId);
  if (content.isArticle) {
    const articleBody = await fetchArticleContent(canonicalUrl);
    const markdown = articleToMarkdown(articleBody, content);
    if (!content.language || content.language === "unknown") {
      const sample = articleBody.slice(0, 500);
      const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
      content.language = chineseChars > sample.length * 0.1 ? "zh" : "en";
    }
    return NextResponse.json({ content, markdown });
  }

  const markdown = tweetToMarkdown(content);
  return NextResponse.json({ content, markdown });
}

async function handleWebpage(url: string) {
  const { content, markdown: rawMarkdown } = await fetchWebpage(url);
  const markdown = webpageToMarkdown(rawMarkdown, content);
  return NextResponse.json({ content, markdown });
}
