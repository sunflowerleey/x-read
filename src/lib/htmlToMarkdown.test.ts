import { describe, it, expect } from "vitest";
import { extractBlocks, blocksToMarkdown, extractTitle, htmlToMarkdown, stripNonContent, isSimilarText } from "./htmlToMarkdown";

describe("extractBlocks", () => {
  it("extracts headings with correct levels", () => {
    const html = "<h1>Title</h1><h2>Section</h2><h3>Sub</h3>";
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "heading", level: 2, text: "Section" },
      { type: "heading", level: 3, text: "Sub" },
    ]);
  });

  it("extracts paragraphs and strips nested tags", () => {
    const html = '<p>Hello <strong>bold</strong> and <a href="#">link</a> text</p>';
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([
      { type: "paragraph", text: "Hello bold and link text" },
    ]);
  });

  it("extracts list items", () => {
    const html = "<ul><li>First</li><li>Second</li></ul>";
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([
      { type: "list-item", text: "First" },
      { type: "list-item", text: "Second" },
    ]);
  });

  it("extracts blockquotes", () => {
    const html = "<blockquote>A wise quote</blockquote>";
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([{ type: "blockquote", text: "A wise quote" }]);
  });

  it("extracts code blocks", () => {
    const html = "<pre>const x = 1;</pre>";
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([{ type: "code", text: "const x = 1;" }]);
  });

  it("skips empty elements", () => {
    const html = "<p></p><h2>  </h2><p>Real content</p>";
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([{ type: "paragraph", text: "Real content" }]);
  });

  it("decodes HTML entities", () => {
    const html = "<p>A &amp; B &lt; C &gt; D &quot;E&quot; F&#39;s</p>";
    const blocks = extractBlocks(html);
    expect(blocks[0].text).toBe('A & B < C > D "E" F\'s');
  });

  it("preserves document order across mixed elements", () => {
    const html = "<h2>Intro</h2><p>Text here</p><h3>Details</h3><li>Item</li>";
    const blocks = extractBlocks(html);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list-item",
    ]);
  });

  it("extracts standalone img tags", () => {
    const html = '<img src="photo.png" alt="A photo"/>';
    const blocks = extractBlocks(html, "https://example.com/page/");
    expect(blocks).toEqual([
      { type: "image", text: "![A photo](https://example.com/page/photo.png)" },
    ]);
  });

  it("extracts images inside figure elements", () => {
    const html = '<figure><img src="chart.png" alt="Chart"/><figcaption>Figure 1</figcaption></figure>';
    const blocks = extractBlocks(html, "https://example.com/");
    const types = blocks.map((b) => b.type);
    expect(types).toContain("image");
    const imgBlock = blocks.find((b) => b.type === "image");
    expect(imgBlock?.text).toBe("![Chart](https://example.com/chart.png)");
  });

  it("converts inline images in paragraphs to markdown syntax", () => {
    const html = '<p>See this: <img src="diagram.png" alt="diagram"/> for details.</p>';
    const blocks = extractBlocks(html, "https://example.com/docs/");
    expect(blocks[0].text).toContain("![diagram](https://example.com/docs/diagram.png)");
  });

  it("resolves relative image URLs against base URL", () => {
    const html = '<img src="images/fig1.png"/>';
    const blocks = extractBlocks(html, "https://site.com/papers/2026/index.html");
    expect(blocks[0].text).toBe("![](https://site.com/papers/2026/images/fig1.png)");
  });

  it("keeps absolute image URLs unchanged", () => {
    const html = '<img src="https://cdn.example.com/photo.jpg" alt="photo"/>';
    const blocks = extractBlocks(html);
    expect(blocks[0].text).toBe("![photo](https://cdn.example.com/photo.jpg)");
  });

  it("skips data URI images", () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo..." alt="chart"/>';
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([]);
  });

  it("skips blocks with excessively long text (embedded data)", () => {
    const longText = "A".repeat(15_000);
    const html = `<p>${longText}</p><p>Short readable text</p>`;
    const blocks = extractBlocks(html);
    expect(blocks).toEqual([{ type: "paragraph", text: "Short readable text" }]);
  });
});

describe("stripNonContent", () => {
  it("removes script, style, svg, canvas, noscript, nav, footer tags", () => {
    const html = `
      <h1>Title</h1>
      <script>var x = 1;</script>
      <style>.foo { color: red; }</style>
      <svg><rect/></svg>
      <canvas></canvas>
      <noscript>Enable JS</noscript>
      <nav><a href="/">Home</a></nav>
      <footer>Copyright</footer>
      <p>Content</p>
    `;
    const cleaned = stripNonContent(html);
    expect(cleaned).toContain("<h1>Title</h1>");
    expect(cleaned).toContain("<p>Content</p>");
    expect(cleaned).not.toContain("var x = 1");
    expect(cleaned).not.toContain("color: red");
    expect(cleaned).not.toContain("<svg>");
    expect(cleaned).not.toContain("<canvas>");
    expect(cleaned).not.toContain("Enable JS");
    expect(cleaned).not.toContain("Home");
    expect(cleaned).not.toContain("Copyright");
  });
});

describe("blocksToMarkdown", () => {
  it("converts blocks to markdown string", () => {
    const md = blocksToMarkdown([
      { type: "heading", level: 2, text: "Section" },
      { type: "paragraph", text: "Some text" },
      { type: "list-item", text: "Item one" },
      { type: "list-item", text: "Item two" },
      { type: "blockquote", text: "A quote" },
      { type: "code", text: "x = 1" },
    ]);
    expect(md).toContain("## Section");
    expect(md).toContain("Some text");
    expect(md).toContain("- Item one");
    expect(md).toContain("- Item two");
    expect(md).toContain("> A quote");
    expect(md).toContain("```\nx = 1\n```");
  });
});

describe("extractTitle", () => {
  it("extracts from <title> tag", () => {
    const html = "<html><head><title>My Page</title></head></html>";
    expect(extractTitle(html)).toBe("My Page");
  });

  it("extracts from og:title meta tag", () => {
    const html = '<meta property="og:title" content="OG Title">';
    expect(extractTitle(html)).toBe("OG Title");
  });

  it("prefers <title> over og:title", () => {
    const html =
      '<head><title>Title Tag</title><meta property="og:title" content="OG"></head>';
    expect(extractTitle(html)).toBe("Title Tag");
  });

  it("returns undefined when no title found", () => {
    expect(extractTitle("<html><body>No title</body></html>")).toBeUndefined();
  });
});

describe("htmlToMarkdown", () => {
  it("converts a simple HTML page to markdown", () => {
    const html = `
      <html>
      <head><title>Test Article</title></head>
      <body>
        <h1>Main Heading</h1>
        <p>Introduction paragraph.</p>
        <h2>Section One</h2>
        <p>Details about section one.</p>
      </body>
      </html>
    `;
    const result = htmlToMarkdown(html);
    expect(result.title).toBe("Test Article");
    expect(result.markdown).toContain("# Main Heading");
    expect(result.markdown).toContain("Introduction paragraph.");
    expect(result.markdown).toContain("## Section One");
    expect(result.markdown).toContain("Details about section one.");
  });

  it("handles Distill-style research paper structure", () => {
    const html = `
      <html>
      <head><title>Emotion Concepts in LLMs</title></head>
      <body>
        <h2 id="toc-0"><a href="#introduction" id="introduction">Introduction</a></h2>
        <p>This paper explores emotion representations.</p>
        <h3><a href="#finding">Finding emotion vectors</a></h3>
        <p>We identify emotion-related directions in activation space.</p>
      </body>
      </html>
    `;
    const result = htmlToMarkdown(html);
    expect(result.title).toBe("Emotion Concepts in LLMs");
    expect(result.markdown).toContain("## Introduction");
    expect(result.markdown).toContain("### Finding emotion vectors");
    expect(result.markdown).toContain("emotion representations");
  });

  it("resolves relative image URLs with base URL", () => {
    const html = `
      <html>
      <head><title>Paper</title></head>
      <body>
        <h2>Results</h2>
        <img src="hero.png" alt="Hero figure"/>
        <p>As shown in the figure above.</p>
      </body>
      </html>
    `;
    const result = htmlToMarkdown(html, "https://example.com/2026/paper/index.html");
    expect(result.markdown).toContain("![Hero figure](https://example.com/2026/paper/hero.png)");
  });
});

describe("isSimilarText", () => {
  it("returns true for identical strings", () => {
    expect(isSimilarText("Hello World", "Hello World")).toBe(true);
  });

  it("ignores case differences", () => {
    expect(isSimilarText("Hello World", "hello world")).toBe(true);
  });

  it("treats missing spaces as similar (HTML tag boundary artifact)", () => {
    // Real case from transformer-circuits.pub: <h1> contains nested spans,
    // stripTags produces "Functionin" (no space) while <title> has "Function in"
    expect(
      isSimilarText(
        "Emotion Concepts and their Function in a Large Language Model",
        "Emotion Concepts and their Functionin a Large Language Model"
      )
    ).toBe(true);
  });

  it("treats extra whitespace as similar", () => {
    expect(isSimilarText("Hello  World", "Hello World")).toBe(true);
  });

  it("substring with >80% overlap is similar", () => {
    // 21/25 = 84%, above the 80% threshold
    expect(isSimilarText("This is a longer title okay", "This is a longer title")).toBe(true);
  });

  it("returns false for distinctly different strings", () => {
    expect(isSimilarText("Introduction", "Methodology")).toBe(false);
  });

  it("returns false for same-length but different content", () => {
    expect(isSimilarText("Authors", "Summary")).toBe(false);
  });
});

describe("deduplicates near-identical consecutive headings (regression)", () => {
  it("removes duplicate h1 even with missing-space typo", () => {
    // Real transformer-circuits.pub pattern
    const html = `
      <html>
      <head><title>Emotion Concepts and their Function in a Large Language Model</title></head>
      <body>
        <h1>Emotion Concepts and their Function in a Large Language Model</h1>
        <h1>Emotion Concepts and their Functionin a Large Language Model</h1>
        <p>Content follows.</p>
      </body>
      </html>
    `;
    const result = htmlToMarkdown(html);
    // Only ONE h1 should remain in the output
    const h1Count = (result.markdown.match(/^# /gm) || []).length;
    expect(h1Count).toBe(1);
  });
});
