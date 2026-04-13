import { ContentData } from "./types";
import { fixBrokenTables } from "./cleanJinaMarkdown";
import { htmlToMarkdown } from "./htmlToMarkdown";

/**
 * Fetch any webpage content via Jina Reader and return ContentData + markdown.
 * Falls back to direct HTTP fetch with HTML-to-markdown conversion when Jina
 * returns a target-site error (e.g. 403 Forbidden).
 */
export async function fetchWebpage(url: string): Promise<{
  content: ContentData;
  markdown: string;
}> {
  const jinaResult = await tryJinaReader(url);

  if (jinaResult) {
    return jinaResult;
  }

  // Fallback: direct HTTP fetch + HTML-to-markdown
  return fetchDirectHtml(url);
}

/** Attempt to fetch via Jina Reader. Returns null if Jina reports a target-site error. */
async function tryJinaReader(url: string): Promise<{
  content: ContentData;
  markdown: string;
} | null> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, {
    headers: {
      Accept: "text/markdown",
      "User-Agent": "X-Read/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    return null;
  }

  const text = await res.text();

  // Detect Jina's embedded target-site errors (e.g. "Warning: Target URL returned error 403")
  if (/Warning:.*Target URL returned error/i.test(text)) {
    return null;
  }

  const title = extractHeader(text, "Title") || new URL(url).hostname;
  const publishedTime = extractHeader(text, "Published Time");

  const markdownStart = text.indexOf("Markdown Content:");
  const raw = markdownStart !== -1
    ? text.slice(markdownStart + "Markdown Content:".length).trim()
    : text;

  // Empty markdown body means Jina couldn't extract content
  if (!raw) {
    return null;
  }

  const markdown = fixBrokenTables(raw);
  const hostname = new URL(url).hostname.replace(/^www\./, "");

  return {
    content: {
      source: "webpage",
      title,
      url,
      language: detectLanguage(markdown),
      authorName: hostname,
      authorHandle: hostname,
      authorAvatar: "",
      createdAt: publishedTime || "",
    },
    markdown,
  };
}

/** Fallback: fetch HTML directly with browser UA and convert to markdown. */
async function fetchDirectHtml(url: string): Promise<{
  content: ContentData;
  markdown: string;
}> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch webpage: ${res.status}`);
  }

  const html = await res.text();
  const { title: extractedTitle, markdown } = htmlToMarkdown(html);

  if (!markdown) {
    throw new Error(
      "Could not extract content from this page. The site may require JavaScript rendering."
    );
  }

  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const title = extractedTitle || hostname;

  return {
    content: {
      source: "webpage",
      title,
      url,
      language: detectLanguage(markdown),
      authorName: hostname,
      authorHandle: hostname,
      authorAvatar: "",
      createdAt: "",
    },
    markdown,
  };
}

function detectLanguage(text: string): string {
  const sample = text.slice(0, 500);
  const chineseChars = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
  return chineseChars > sample.length * 0.1 ? "zh" : "en";
}

function extractHeader(text: string, name: string): string | undefined {
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, "m");
  const match = text.match(pattern);
  return match?.[1]?.trim();
}
