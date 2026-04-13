/**
 * Lightweight HTML-to-Markdown converter for fallback when Jina Reader fails.
 * No external dependencies — uses regex-based extraction for common HTML elements.
 * Targets article-style pages (research papers, blog posts).
 */

/** Max length for a single extracted block — anything longer is likely embedded data, not prose. */
const MAX_BLOCK_LENGTH = 10_000;

/** Convert <img> tags to markdown image syntax before stripping other tags. */
function imgTagsToMarkdown(html: string, baseUrl?: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    const altMatch = tag.match(/alt=["']([^"']*?)["']/i);
    if (!srcMatch) return "";
    const rawSrc = srcMatch[1];
    // Skip data URIs — they're often multi-MB base64 blobs that bloat the output
    if (rawSrc.startsWith("data:")) return "";
    const src = resolveUrl(rawSrc, baseUrl);
    const alt = altMatch?.[1] || "";
    return `![${alt}](${src})`;
  });
}

/** Resolve a potentially relative URL against a base URL. */
function resolveUrl(src: string, baseUrl?: string): string {
  if (!baseUrl || /^https?:\/\//i.test(src) || src.startsWith("data:")) {
    return src;
  }
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

/** Remove HTML tags, decode common entities, and trim. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Extract inner HTML from a tag match (handles nested tags). */
function innerHtml(match: string, tagName: string): string {
  const openPattern = new RegExp(`^<${tagName}[^>]*>`, "i");
  const closePattern = new RegExp(`</${tagName}>$`, "i");
  return match.replace(openPattern, "").replace(closePattern, "");
}

interface ExtractedBlock {
  type: "heading" | "paragraph" | "list-item" | "blockquote" | "code" | "image";
  level?: number;
  text: string;
}

/**
 * Parse HTML into ordered content blocks.
 * Processes elements in document order by finding them sequentially.
 */
export function extractBlocks(html: string, baseUrl?: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];

  // Combined pattern: block-level elements + standalone/figure images
  const pattern =
    /<(h[1-6]|p|li|blockquote|pre|figcaption|figure|img)\b[^>]*(?:>[\s\S]*?<\/\1>|\/?>)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const [fullMatch, tagName] = match;
    const tag = tagName.toLowerCase();

    // Standalone <img> (not inside <p> or <figure>)
    if (tag === "img") {
      const md = imgTagsToMarkdown(fullMatch, baseUrl);
      if (md) blocks.push({ type: "image", text: md });
      continue;
    }

    // <figure> — extract only <img> tags, ignore other content (figcaption handled separately)
    if (tag === "figure") {
      const inner = innerHtml(fullMatch, tag);
      const imgTags = inner.match(/<img\b[^>]*\/?>/gi);
      if (imgTags) {
        const imgMd = imgTags.map((t) => imgTagsToMarkdown(t, baseUrl)).join("\n").trim();
        if (imgMd) blocks.push({ type: "image", text: imgMd });
      }
      continue;
    }

    const inner = innerHtml(fullMatch, tag);

    if (tag === "pre") {
      const text = stripTags(inner);
      if (text && text.length < MAX_BLOCK_LENGTH) blocks.push({ type: "code", text });
      continue;
    }

    // For other tags, convert inline <img> to markdown before stripping
    const withImages = imgTagsToMarkdown(inner, baseUrl);
    const text = stripTags(withImages);

    // Skip empty blocks or blocks with excessive length (likely embedded data)
    if (!text || text.length > MAX_BLOCK_LENGTH) continue;

    if (tag.startsWith("h") && tag.length === 2) {
      const level = parseInt(tag[1], 10);
      blocks.push({ type: "heading", level, text });
    } else if (tag === "li") {
      blocks.push({ type: "list-item", text });
    } else if (tag === "blockquote") {
      blocks.push({ type: "blockquote", text });
    } else {
      // p, figcaption
      blocks.push({ type: "paragraph", text });
    }
  }

  return blocks;
}

/** Convert extracted blocks to markdown string. */
export function blocksToMarkdown(blocks: ExtractedBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        lines.push(`${"#".repeat(block.level ?? 2)} ${block.text}`);
        lines.push("");
        break;
      case "paragraph":
        lines.push(block.text);
        lines.push("");
        break;
      case "list-item":
        lines.push(`- ${block.text}`);
        break;
      case "blockquote":
        lines.push(`> ${block.text}`);
        lines.push("");
        break;
      case "code":
        lines.push("```");
        lines.push(block.text);
        lines.push("```");
        lines.push("");
        break;
      case "image":
        lines.push(block.text);
        lines.push("");
        break;
    }
  }

  return lines.join("\n").trim();
}

/** Extract title from HTML <title> or <meta> tags. */
export function extractTitle(html: string): string | undefined {
  // Try <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const text = stripTags(titleMatch[1]);
    if (text) return text;
  }

  // Try og:title
  const ogMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
  );
  if (ogMatch) return ogMatch[1].trim();

  return undefined;
}

/**
 * Remove non-content elements (scripts, styles, SVGs, interactive widgets)
 * that would pollute the extracted text.
 */
export function stripNonContent(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<canvas\b[^>]*>[\s\S]*?<\/canvas>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "");
}

/**
 * Convert raw HTML to markdown.
 * @param html - Raw HTML string
 * @param baseUrl - Base URL for resolving relative image paths
 * Returns { title, markdown } where title is extracted from metadata.
 */
export function htmlToMarkdown(html: string, baseUrl?: string): { title: string | undefined; markdown: string } {
  const title = extractTitle(html);
  const cleaned = stripNonContent(html);
  const blocks = extractBlocks(cleaned, baseUrl);
  const markdown = blocksToMarkdown(blocks);
  return { title, markdown };
}
