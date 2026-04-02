const SAFE_HTML_TAGS = new Set([
  "a", "b", "i", "em", "strong", "code", "pre", "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "img", "table", "thead", "tbody", "tr", "th", "td", "div", "span",
  "sup", "sub", "del", "s",
]);

/**
 * Escape non-standard HTML-like tags in markdown to prevent React warnings,
 * while preserving content inside code blocks.
 */
export function escapeNonHtmlTags(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(
        /<\/?([a-zA-Z][a-zA-Z0-9_-]*)(?:\s[^>]*)?\/?>/g,
        (match, tagName) => {
          if (SAFE_HTML_TAGS.has(tagName.toLowerCase())) return match;
          return `\`${match}\``;
        }
      );
    })
    .join("");
}
