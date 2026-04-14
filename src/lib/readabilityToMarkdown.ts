/**
 * Article extraction via Mozilla Readability + conversion via node-html-markdown.
 *
 * Replaces the fallback regex extractor used when Jina Reader fails.
 * Advantages over regex:
 * - Real HTML parser (linkedom) handles nested tags correctly — no more
 *   "Function in" → "Functionin" glue-ups from stripTags
 * - Readability strips nav / ads / boilerplate / comment sections
 * - node-html-markdown handles inline formatting (bold, italic, inline code,
 *   links) that regex can't parse
 *
 * Total install: ~1.3 MB (linkedom 898KB + node-html-markdown 282KB + readability 155KB).
 */

import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { NodeHtmlMarkdown } from "node-html-markdown";

export interface ExtractedArticle {
  title: string | undefined;
  markdown: string;
}

/**
 * Extract article content from raw HTML and convert to markdown.
 * Returns null if Readability can't identify an article (e.g. homepage,
 * index page, pages that need JS rendering).
 *
 * @param html - Raw HTML string
 * @param baseUrl - Base URL for resolving relative image/link URLs
 */
export function extractArticleAsMarkdown(
  html: string,
  baseUrl?: string
): ExtractedArticle | null {
  const { document } = parseHTML(html);

  // Set <base href> so Readability/node-html-markdown resolve relative URLs
  if (baseUrl) {
    try {
      const existingBase = document.querySelector("base");
      if (existingBase) {
        existingBase.setAttribute("href", baseUrl);
      } else if (document.head) {
        const base = document.createElement("base");
        base.setAttribute("href", baseUrl);
        document.head.appendChild(base);
      }
    } catch {
      // Non-fatal — worst case, relative URLs stay relative
    }
  }

  let article: { title?: string | null; content?: string | null } | null = null;
  try {
    // Readability's types expect lib.dom Document; linkedom's Document is
    // structurally compatible enough for Readability's needs.
    const reader = new Readability(document as unknown as Document);
    article = reader.parse();
  } catch {
    return null;
  }

  if (!article || !article.content) {
    return null;
  }

  // Resolve relative image URLs before passing to the markdown converter.
  // node-html-markdown preserves URLs as-is from the HTML input.
  const absoluteContent = resolveRelativeUrls(article.content, baseUrl);

  const nhm = new NodeHtmlMarkdown({
    keepDataImages: false,
  });

  const markdown = nhm.translate(absoluteContent).trim();

  if (!markdown) return null;

  return {
    title: article.title ?? undefined,
    markdown,
  };
}

/**
 * Resolve relative src/href in an HTML fragment against a base URL.
 * node-html-markdown doesn't do this itself; we need to do it up front.
 */
function resolveRelativeUrls(html: string, baseUrl?: string): string {
  if (!baseUrl) return html;

  return html
    .replace(/\b(src|href)=["']([^"']+)["']/gi, (match, attr, url) => {
      if (/^(https?:|data:|mailto:|tel:|#)/i.test(url)) return match;
      try {
        return `${attr}="${new URL(url, baseUrl).href}"`;
      } catch {
        return match;
      }
    });
}
