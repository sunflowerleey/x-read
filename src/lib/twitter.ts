import { ContentData } from "./types";
import { cleanJinaMarkdown } from "./cleanJinaMarkdown";

function extractSubtitle(
  previewText?: string,
  title?: string
): string | undefined {
  if (!previewText) return undefined;
  const firstLine = previewText.split("\n")[0].trim();
  if (title && firstLine.toLowerCase() === title.toLowerCase()) return undefined;
  if (firstLine.length === 0) return undefined;
  return firstLine;
}

export function isTwitterUrl(url: string): boolean {
  return /(?:twitter\.com|x\.com)\/[^/]+\/(?:status|article)\/\d+/i.test(
    url.trim()
  );
}

export function parseTweetUrl(
  url: string
): { tweetId: string; screenName: string; isArticle: boolean } | null {
  const trimmed = url.trim();
  const pattern =
    /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^/]+)\/(?:status|article)\/(\d+)/i;
  const match = trimmed.match(pattern);
  if (!match) return null;
  const isArticle = /\/article\//i.test(trimmed);
  return { screenName: match[1], tweetId: match[2], isArticle };
}

export async function fetchTweet(tweetId: string): Promise<ContentData> {
  const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`, {
    headers: { "User-Agent": "X-Read/1.0" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch tweet: ${res.status}`);
  }

  const data = await res.json();
  if (data.code !== 200 || !data.tweet) {
    throw new Error(data.message || "Tweet not found");
  }

  const t = data.tweet;
  const media: { type: string; url: string }[] = [];
  if (t.media?.all) {
    for (const m of t.media.all) {
      media.push({
        type: m.type || "photo",
        url: m.url || m.thumbnail_url || "",
      });
    }
  }

  return {
    source: "twitter",
    title: t.article?.title || `Tweet by @${t.author?.screen_name || "unknown"}`,
    url: `https://x.com/${t.author?.screen_name || "unknown"}/status/${t.id}`,
    authorName: t.author?.name || "Unknown",
    authorHandle: t.author?.screen_name || "unknown",
    authorAvatar: t.author?.avatar_url || "",
    createdAt: t.created_at || "",
    language: t.lang || "unknown",
    likes: t.likes || 0,
    retweets: t.retweets || 0,
    replies: t.replies || 0,
    media,
    quotedTweet: t.quote
      ? {
          text: t.quote.text,
          authorName: t.quote.author?.name || "",
          authorHandle: t.quote.author?.screen_name || "",
        }
      : undefined,
    isArticle: !!t.article,
    articleTitle: t.article?.title || undefined,
    articleSubtitle: extractSubtitle(t.article?.preview_text, t.article?.title),
  };
}

export async function fetchArticleContent(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: {
      Accept: "text/markdown",
      "User-Agent": "X-Read/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch article content: ${res.status}`);
  }

  const text = await res.text();

  const markdownStart = text.indexOf("Markdown Content:");
  const raw = markdownStart !== -1
    ? text.slice(markdownStart + "Markdown Content:".length).trim()
    : text;

  return cleanJinaMarkdown(raw);
}
