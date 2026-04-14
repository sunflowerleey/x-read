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

  // Normalize custom elements (Distill / Google Docs / Anthropic blog style)
  // BEFORE Readability runs — so it sees clean figure/pre elements.
  preprocessCustomElements(document);

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
 * Normalize custom elements that Readability + node-html-markdown don't
 * handle well by default. Called on the parsed document before Readability
 * runs its article-extraction pass.
 *
 * Two common patterns from Distill.pub / Anthropic research papers:
 *
 * 1. `<figure class="gdoc-image">`
 *    - Usually contains `<img>` + `<figcaption>` — merge caption into alt
 *    - Sometimes contains embedded `<html>` widgets with no `<img>` —
 *      strip entirely (interactive widgets can't render in markdown)
 *    - Always strip any nested <html>/<head>/<body>/DOCTYPE that confuse
 *      the DOM parser
 *
 * 2. `<div class="prompt-block">`
 *    - LLM prompt examples like "Human: {prompt}\nAssistant:"
 *    - Convert to `<pre><code>` so the markdown converter emits a fenced
 *      code block, which our translation pipeline then skips entirely
 *      (code blocks bypass Gemini — see splitAroundCodeBlocks).
 */
// Using `any` here because linkedom's Element type doesn't perfectly match
// lib.dom's Element type — querySelector/createElement work at runtime but
// the structural typing diverges. This function only uses standard DOM APIs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function preprocessCustomElements(document: any): void {
  // 1. prompt-block → <pre><code>...</code></pre>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document.querySelectorAll(".prompt-block").forEach((el: any) => {
    const text = (el.textContent || "").trim();
    if (!text) {
      el.remove();
      return;
    }
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = text;
    pre.appendChild(code);
    el.replaceWith(pre);
  });

  // 2. gdoc-image normalization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document.querySelectorAll("figure.gdoc-image").forEach((fig: any) => {
    const img = fig.querySelector("img");
    if (!img) {
      // Interactive widget (embedded <html>...</html>) with no image —
      // can't render as markdown, drop entirely
      fig.remove();
      return;
    }
    const caption = fig.querySelector("figcaption");
    if (caption && !img.getAttribute("alt")) {
      img.setAttribute("alt", (caption.textContent || "").trim());
    }
    // Strip any embedded DOCTYPE/html/head/body/script/style noise left
    // inside the figure. Only keep the img (and optionally figcaption).
    const newFig = document.createElement("figure");
    newFig.appendChild(img);
    if (caption) newFig.appendChild(caption);
    fig.replaceWith(newFig);
  });
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
