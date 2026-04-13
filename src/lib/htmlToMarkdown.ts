/**
 * Lightweight HTML-to-Markdown converter for fallback when Jina Reader fails.
 * No external dependencies — uses regex-based extraction for common HTML elements.
 * Targets article-style pages (research papers, blog posts).
 */

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
  type: "heading" | "paragraph" | "list-item" | "blockquote" | "code";
  level?: number;
  text: string;
}

/**
 * Parse HTML into ordered content blocks.
 * Processes elements in document order by finding them sequentially.
 */
export function extractBlocks(html: string): ExtractedBlock[] {
  const blocks: ExtractedBlock[] = [];

  // Combined pattern for all block-level elements we care about
  const pattern =
    /<(h[1-6]|p|li|blockquote|pre|figcaption)\b[^>]*>[\s\S]*?<\/\1>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const [fullMatch, tagName] = match;
    const tag = tagName.toLowerCase();
    const inner = innerHtml(fullMatch, tag);
    const text = stripTags(inner);

    if (!text) continue;

    if (tag.startsWith("h") && tag.length === 2) {
      const level = parseInt(tag[1], 10);
      blocks.push({ type: "heading", level, text });
    } else if (tag === "li") {
      blocks.push({ type: "list-item", text });
    } else if (tag === "blockquote") {
      blocks.push({ type: "blockquote", text });
    } else if (tag === "pre") {
      blocks.push({ type: "code", text });
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
 * Convert raw HTML to markdown.
 * Returns { title, markdown } where title is extracted from metadata.
 */
export function htmlToMarkdown(html: string): { title: string | undefined; markdown: string } {
  const title = extractTitle(html);
  const blocks = extractBlocks(html);
  const markdown = blocksToMarkdown(blocks);
  return { title, markdown };
}
