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

  // Extract "hero figures" (figures inside <d-title> blocks) BEFORE
  // preprocessing unwraps <d-title>. Readability strips standalone
  // figures with no surrounding text as low-content, so we capture
  // these and prepend them to the markdown after extraction.
  const heroFigures = extractHeroFigures(document);

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
  // Also resolve URLs in the captured hero figures.
  const absoluteContent = resolveRelativeUrls(article.content, baseUrl);
  const absoluteHeroes = heroFigures.map((h) => resolveRelativeUrls(h, baseUrl));

  const nhm = new NodeHtmlMarkdown({
    keepDataImages: false,
  });

  const heroMarkdown = absoluteHeroes
    .map((h) => nhm.translate(h).trim())
    .filter(Boolean)
    .join("\n\n");
  const bodyMarkdown = nhm.translate(absoluteContent).trim();

  // Prepend hero figures to the article body
  const markdown = heroMarkdown
    ? `${heroMarkdown}\n\n${bodyMarkdown}`
    : bodyMarkdown;

  if (!markdown) return null;

  return {
    title: article.title ?? undefined,
    markdown,
  };
}

/**
 * Extract <figure> elements that are inside <d-title> blocks (Distill
 * "hero figures"). These are removed from the DOM so Readability won't
 * even see them; we re-insert them into the markdown after extraction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHeroFigures(document: any): string[] {
  const heroes: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document.querySelectorAll("d-title figure").forEach((fig: any) => {
    heroes.push(fig.outerHTML);
    fig.remove();
  });
  return heroes;
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
  // 0. Unwrap Distill custom elements (<d-title>, <d-byline>, <d-article>,
  //     <d-front-matter>, <d-bibliography>) to plain <div>s. Readability
  //     treats unknown <d-*> elements as titles/metadata and may strip
  //     their non-text contents.
  const distillTags = [
    "d-title",
    "d-byline",
    "d-article",
    "d-front-matter",
    "d-bibliography",
    "d-appendix",
    "d-footnote",
  ];
  for (const tag of distillTags) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    document.querySelectorAll(tag).forEach((el: any) => {
      const div = document.createElement("div");
      // Move children rather than copying innerHTML to preserve event
      // listeners, attributes, and avoid re-parsing
      while (el.firstChild) {
        div.appendChild(el.firstChild);
      }
      el.replaceWith(div);
    });
  }

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
      // No image — might be an embedded HTML widget that contains
      // structured text content (e.g. labeled prompts, data tables).
      // Strip <style>/<script>/<head> noise and convert to a div so
      // Readability extracts the visible text.
      const salvaged = salvageWidgetContent(fig, document);
      if (salvaged) {
        fig.replaceWith(salvaged);
      } else {
        // Truly no content (just chart canvas / interactive UI) — drop
        fig.remove();
      }
      return;
    }
    const caption = fig.querySelector("figcaption");
    if (caption && !img.getAttribute("alt")) {
      img.setAttribute("alt", (caption.textContent || "").trim());
    }
    // Fallback alt from filename when no caption — helps Readability
    // recognize the image as content rather than decoration
    if (!img.getAttribute("alt")) {
      const src = img.getAttribute("src") || "";
      const filename = src.split("/").pop()?.replace(/\.[^.]+$/, "")?.replace(/[-_]/g, " ") || "Figure";
      img.setAttribute("alt", filename);
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
 * For figures with no <img> (embedded HTML widgets), try to salvage
 * the visible text content. Strips style/script/head noise. Returns
 * a new element wrapping the cleaned content, or null if nothing
 * meaningful remains.
 *
 * Structured widgets (e.g. .prompts-container with labeled rows) are
 * formatted as a callout: <blockquote> with heading + bulleted list.
 * Generic widgets are wrapped in <blockquote> for visual distinction.
 */
function salvageWidgetContent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fig: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  // Remove non-content elements from inside the figure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fig.querySelectorAll("style, script, link, meta, head").forEach((el: any) =>
    el.remove()
  );

  const text = (fig.textContent || "").trim();
  if (text.length < 50) {
    return null;
  }

  // Detect known structured widgets and format them as readable callouts
  const promptsContainer = fig.querySelector(".prompts-container");
  if (promptsContainer) {
    return formatPromptsWidget(promptsContainer, document);
  }

  const prefsContainer = fig.querySelector(".prefs-container");
  if (prefsContainer) {
    return formatPrefsWidget(prefsContainer, document);
  }

  // Generic widget: wrap in a blockquote so it renders with a visible
  // left border and stands out from regular paragraphs.
  const blockquote = document.createElement("blockquote");
  while (fig.firstChild) {
    blockquote.appendChild(fig.firstChild);
  }
  return blockquote;
}

/**
 * Convert a .prompts-container widget (labeled prompt examples) into
 * structured markdown:
 *
 *   > **Antagonistic and Control Prompts**
 *   >
 *   > - **Label** (sublabel): text content
 *   > - **Label** (sublabel): text content
 */
function formatPromptsWidget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  container: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const wrapper = document.createElement("blockquote");

  // Title → bold paragraph (avoids weird heading-inside-blockquote markdown)
  const titleEl = container.querySelector(".prompts-title");
  if (titleEl) {
    const titleText = (titleEl.textContent || "").trim();
    if (titleText) {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = titleText;
      p.appendChild(strong);
      wrapper.appendChild(p);
    }
  }

  // Rows → unordered list
  const rows = container.querySelectorAll(".prompts-row");
  if (rows.length > 0) {
    const ul = document.createElement("ul");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows.forEach((row: any) => {
      const label =
        (row.querySelector(".prompts-label")?.textContent || "").trim();
      const sublabel =
        (row.querySelector(".prompts-sublabel")?.textContent || "").trim();
      const txt =
        (row.querySelector(".prompts-text")?.textContent || "").trim();

      const li = document.createElement("li");
      if (label) {
        const strong = document.createElement("strong");
        strong.textContent = label;
        li.appendChild(strong);
      }
      if (sublabel) {
        li.appendChild(document.createTextNode(` (${sublabel})`));
      }
      if (txt) {
        li.appendChild(document.createTextNode((label || sublabel) ? `: ${txt}` : txt));
      }
      ul.appendChild(li);
    });
    wrapper.appendChild(ul);
  }

  // Caption → italic paragraph
  const caption = container.querySelector(".prompts-caption");
  if (caption) {
    const captionText = (caption.textContent || "").trim();
    if (captionText) {
      const p = document.createElement("p");
      const em = document.createElement("em");
      em.textContent = captionText;
      p.appendChild(em);
      wrapper.appendChild(p);
    }
  }

  return wrapper;
}

/**
 * Convert a .prefs-container widget (data table) into a real <table>.
 * Structure:
 *   .prefs-title              → caption above table
 *   .prefs-group-header (opt) → top-row group labels (e.g. Post-Trained vs Base)
 *   .prefs-header             → column labels
 *   .prefs-row × N            → data rows (mix of .prefs-category, -description,
 *                                -elo, -num children — order matters)
 *   .prefs-caption (opt)      → italic caption below
 *
 * node-html-markdown converts <table> to GFM table syntax.
 */
function formatPrefsWidget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  container: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  document: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const wrapper = document.createElement("div");

  // Title → bold paragraph above the table
  const titleEl = container.querySelector(".prefs-title");
  if (titleEl) {
    const titleText = (titleEl.textContent || "").trim();
    if (titleText) {
      const p = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = titleText;
      p.appendChild(strong);
      wrapper.appendChild(p);
    }
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");

  // Build header row(s)
  const headerLabels = Array.from(
    container.querySelectorAll(".prefs-header > *")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).map((el: any) => (el.textContent || "").trim());

  const groupLabels = Array.from(
    container.querySelectorAll(".prefs-group-header > *")
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((el: any) => (el.textContent || "").trim());

  if (headerLabels.length > 0) {
    // GFM tables don't support multi-row headers. If we have group labels,
    // merge them into the column labels: "Post-Trained Elo", "Base Elo", etc.
    const finalHeaders =
      groupLabels.length > 0 && groupLabels.some((g) => g.length > 0)
        ? mergeGroupHeaders(headerLabels, groupLabels)
        : headerLabels;

    const headerRow = document.createElement("tr");
    for (const label of finalHeaders) {
      const th = document.createElement("th");
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);
  }

  // Body rows
  const tbody = document.createElement("tbody");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  container.querySelectorAll(".prefs-row").forEach((row: any) => {
    const tr = document.createElement("tr");
    // Each child <span> is a cell; preserve order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Array.from(row.children).forEach((cell: any) => {
      const td = document.createElement("td");
      td.textContent = (cell.textContent || "").trim();
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrapper.appendChild(table);

  // Caption below table
  const caption = container.querySelector(".prefs-caption");
  if (caption) {
    const captionText = (caption.textContent || "").trim();
    if (captionText) {
      const p = document.createElement("p");
      const em = document.createElement("em");
      em.textContent = captionText;
      p.appendChild(em);
      wrapper.appendChild(p);
    }
  }

  return wrapper;
}

/**
 * Merge group labels (e.g. ["", "", "Post-Trained", "Base Model"]) with
 * per-column labels (e.g. ["Cat", "Activity", "Elo", "Bliss.", "Host.",
 * "Elo", "Bliss.", "Host."]) into single labels:
 *   ["Cat", "Activity", "Post-Trained Elo", "Post-Trained Bliss.", ...]
 *
 * Heuristic: each non-empty group label spans (totalCols - groupCount) /
 * (groupCount of non-empty) columns. Falls back to "Group · Col" format.
 */
function mergeGroupHeaders(
  cols: string[],
  groups: string[]
): string[] {
  // Identify which groups are content-bearing (non-empty)
  const contentGroups = groups.filter((g) => g.trim().length > 0);
  if (contentGroups.length === 0) return cols;

  // Number of leading non-grouped columns (e.g. Category, Activity)
  const nonGroupedCols = cols.length - contentGroups.length * Math.floor(
    (cols.length - (groups.length - contentGroups.length)) / contentGroups.length
  );

  // Columns under each group
  const colsPerGroup = Math.floor(
    (cols.length - nonGroupedCols) / contentGroups.length
  );

  if (colsPerGroup <= 0) return cols;

  const result: string[] = [];
  for (let i = 0; i < cols.length; i++) {
    if (i < nonGroupedCols) {
      result.push(cols[i]);
    } else {
      const groupIdx = Math.floor((i - nonGroupedCols) / colsPerGroup);
      const groupLabel = contentGroups[groupIdx] || "";
      result.push(groupLabel ? `${groupLabel} ${cols[i]}` : cols[i]);
    }
  }
  return result;
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
