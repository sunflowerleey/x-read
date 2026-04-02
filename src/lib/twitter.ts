import { TweetData } from "./types";

/**
 * Extract subtitle from preview_text. The first line of preview_text
 * is often a subtitle if it differs from the title.
 */
function extractSubtitle(
  previewText?: string,
  title?: string
): string | undefined {
  if (!previewText) return undefined;
  const firstLine = previewText.split("\n")[0].trim();
  // Only use it if it's different from the title
  if (title && firstLine.toLowerCase() === title.toLowerCase()) return undefined;
  if (firstLine.length === 0) return undefined;
  return firstLine;
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

export async function fetchTweet(tweetId: string): Promise<TweetData> {
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
    id: t.id,
    text: t.text,
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

  // Extract just the markdown content (skip Jina metadata headers)
  const markdownStart = text.indexOf("Markdown Content:");
  let content = markdownStart !== -1
    ? text.slice(markdownStart + "Markdown Content:".length).trim()
    : text;

  // Post-process: promote standalone "Title-like" lines to headings.
  // Jina sometimes loses heading markers. Lines that are short, not starting
  // with markdown syntax, followed by a blank line and body text are likely
  // section headings.
  content = fixCodeBlocks(content);
  content = removeVideoThumbnails(content);
  content = removeVideoTimestamps(content);
  content = injectSectionBreaksBeforeFileLists(content);
  content = restoreMissingSectionHeadings(content);

  return content;
}

/**
 * Remove video thumbnail images (amplify_video_thumb) since we can't
 * embed the actual video. These are just static preview images.
 */
function removeVideoThumbnails(md: string): string {
  return md
    .split("\n")
    .filter((line) => !line.trim().match(/^!\[.*\]\(https:\/\/pbs\.twimg\.com\/amplify_video_thumb\/.+\)$/))
    .join("\n");
}

/**
 * Remove orphaned video timestamps like "0:20" that Jina extracts
 * from embedded video players.
 */
function removeVideoTimestamps(md: string): string {
  return md
    .split("\n")
    .filter((line) => !line.trim().match(/^\d{1,2}:\d{2}$/))
    .join("\n");
}

/**
 * Fix code blocks where Jina puts the language identifier on a separate line
 * before the opening ```, e.g.:
 *   typescript
 *
 *   ```
 * becomes:
 *   ```typescript
 */
function fixCodeBlocks(md: string): string {
  // Pattern: lang identifier line, optional blank line, then ```
  return md.replace(
    /^(typescript|javascript|python|rust|go|java|bash|shell|json|yaml|html|css|markdown|sql|tsx|jsx|ts|js|rb|c|cpp|csharp|swift|kotlin|toml|xml|graphql)\s*\n\s*\n?```\s*$/gm,
    "```$1"
  );
}

/**
 * Detect patterns where a video thumbnail is followed by a "File:" metadata list,
 * which indicates a new major section. Extract a section title from the File path
 * and inject it as a heading.
 */
function injectSectionBreaksBeforeFileLists(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect: "* File: <path>" or "* Files: <path>" pattern followed by "* Cost:" and "* When:"
    // This indicates a new major section (Layer).
    const fileMatch = trimmed.match(/^\*\s+Files?:\s+(.+)/);

    if (fileMatch) {
      // Verify it's a section header by checking for "Cost:" and "When:" in next few lines
      let hasCost = false;
      let hasWhen = false;
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const next = lines[j].trim();
        if (/^\*\s+Cost:/i.test(next)) hasCost = true;
        if (/^\*\s+When:/i.test(next)) hasWhen = true;
      }

      if (hasCost || hasWhen) {
        const filePath = fileMatch[1].trim();
        const sectionTitle = deriveSectionTitle(filePath);
        if (sectionTitle) {
          result.push("");
          result.push(`## ${sectionTitle}`);
          result.push("");
        }
      }
    }

    // Also detect standalone "File: <path>" (without bullet) followed by similar pattern
    const standaloneFileMatch = trimmed.match(/^Files?:\s+(src\/.+)/);
    if (standaloneFileMatch && !trimmed.startsWith("*")) {
      const filePath = standaloneFileMatch[1].trim();
      const sectionTitle = deriveSectionTitle(filePath);
      if (sectionTitle) {
        result.push("");
        result.push(`## ${sectionTitle}`);
        result.push("");
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * Derive a human-readable section title from a source file path.
 */
function deriveSectionTitle(filePath: string): string | null {
  // Known mappings for common patterns
  const mappings: [RegExp, string][] = [
    [/toolResultStorage/i, "Layer 1: Tool Result Storage"],
    [/microCompact/i, "Layer 2: Microcompaction"],
    [/SessionMemory/i, "Layer 3: Session Memory"],
    [/compact\/compact/i, "Layer 4: Full Compaction"],
    [/extractMemories/i, "Layer 5: Auto Memory Extraction"],
    [/autoDream/i, "Layer 6: Dreaming"],
    [/forkedAgent|AgentTool|SendMessage/i, "Layer 7: Forked Agents & Communication"],
  ];

  for (const [pattern, title] of mappings) {
    if (pattern.test(filePath)) return title;
  }

  // Fallback: extract the last meaningful segment from the path
  const segments = filePath.replace(/\.(ts|js|tsx|jsx)$/, "").split("/");
  const last = segments[segments.length - 1];
  if (last) {
    // Convert camelCase/PascalCase to Title Case
    const title = last
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
    return title;
  }

  return null;
}

/**
 * Heuristically restore section headings that Jina may have stripped.
 * Only promotes lines that look like short, title-case or noun-phrase headings.
 */
function restoreMissingSectionHeadings(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const prev = i > 0 ? lines[i - 1].trim() : "";
    const next = i < lines.length - 1 ? lines[i + 1].trim() : "";

    // Skip if already formatted or too long for a heading
    if (
      trimmed.length === 0 ||
      trimmed.length > 80 ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("!") ||
      (trimmed.startsWith("[") && trimmed.includes("](")) ||
      trimmed.startsWith("`") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("---") ||
      trimmed.startsWith("**") ||
      trimmed.startsWith("http") ||
      /^\d+\.?\s/.test(trimmed)
    ) {
      result.push(line);
      continue;
    }

    // Must be surrounded by blank lines
    const prevBlank = i === 0 || prev === "";
    const nextBlank = next === "";
    if (!prevBlank || !nextBlank) {
      result.push(line);
      continue;
    }

    // Must have body content after the blank
    if (i + 2 >= lines.length || lines[i + 2].trim().length === 0) {
      result.push(line);
      continue;
    }

    // Heading heuristics — strict rules to avoid false positives:
    const wordCount = trimmed.split(/\s+/).length;
    const looksLikeTitle =
      /^[A-Z]/.test(trimmed) &&
      !trimmed.endsWith(".") &&
      !trimmed.endsWith(",") &&
      !trimmed.endsWith(":") &&
      !trimmed.includes(", ") &&
      wordCount <= 8 &&
      // Must not look like a sentence (contains common verb patterns)
      !/\b(is|are|was|were|has|have|can|will|do|does|the .+ is)\b/i.test(trimmed);

    if (looksLikeTitle) {
      result.push(`## ${trimmed}`);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}
