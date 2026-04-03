import { ContentData } from "./types";

/**
 * Fetch any webpage content via Jina Reader and return ContentData + markdown.
 */
export async function fetchWebpage(url: string): Promise<{
  content: ContentData;
  markdown: string;
}> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: {
      Accept: "text/markdown",
      "User-Agent": "X-Read/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch webpage: ${res.status}`);
  }

  const text = await res.text();

  // Parse Jina metadata headers
  const title = extractHeader(text, "Title") || new URL(url).hostname;
  const publishedTime = extractHeader(text, "Published Time");

  // Extract markdown body
  const markdownStart = text.indexOf("Markdown Content:");
  const markdown = markdownStart !== -1
    ? text.slice(markdownStart + "Markdown Content:".length).trim()
    : text;

  // Detect language
  const sample = markdown.slice(0, 500);
  const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  const language = chineseChars > sample.length * 0.1 ? "zh" : "en";

  const hostname = new URL(url).hostname.replace(/^www\./, "");

  return {
    content: {
      source: "webpage",
      title,
      url,
      language,
      authorName: hostname,
      authorHandle: hostname,
      authorAvatar: "",
      createdAt: publishedTime || "",
    },
    markdown,
  };
}

function extractHeader(text: string, name: string): string | undefined {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, "m");
  const match = text.match(pattern);
  return match?.[1]?.trim();
}
