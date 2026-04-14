import { describe, it, expect } from "vitest";
import { extractArticleAsMarkdown } from "./readabilityToMarkdown";

describe("extractArticleAsMarkdown", () => {
  it("extracts article content and converts to markdown", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>My Research Paper</title></head>
      <body>
        <header><nav>Home | About</nav></header>
        <article>
          <h1>My Research Paper</h1>
          <p>This is a substantial paragraph of research about interesting topics in AI. It contains enough text to pass Readability's length threshold for article detection.</p>
          <h2>Introduction</h2>
          <p>Large language models sometimes appear to exhibit emotional reactions. They express enthusiasm when helping with creative projects and frustration when stuck. This opening paragraph establishes the topic with enough substance for extraction.</p>
          <p>But these behaviors are not well understood. In this work, we investigate the underlying representations that drive these outputs, providing a detailed characterization of how emotion concepts are encoded internally.</p>
        </article>
        <footer>© 2026</footer>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("My Research Paper");
    expect(result!.markdown).toContain("Introduction");
    expect(result!.markdown).toContain("Large language models");
    // Boilerplate should be stripped
    expect(result!.markdown).not.toContain("Home | About");
    expect(result!.markdown).not.toContain("© 2026");
  });

  it("resolves relative image URLs against baseUrl", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Paper</title></head>
      <body>
        <article>
          <h1>Paper With Figure</h1>
          <p>Here we describe a figure that illustrates our key finding about emotion concept representations and their behavioral consequences. The figure shows activation patterns across layers of the model.</p>
          <p><img src="hero.png" alt="Hero figure" /></p>
          <p>The figure above shows the key relationships in detail, with emotion vectors clustering according to psychological dimensions like valence and arousal.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(
      html,
      "https://example.com/papers/2026/index.html"
    );

    expect(result).not.toBeNull();
    // Relative URL should become absolute
    expect(result!.markdown).toContain(
      "https://example.com/papers/2026/hero.png"
    );
  });

  it("returns null when document has no body content at all", () => {
    // Completely empty — Readability will return null or empty content
    const html = `<html><head><title>Home</title></head><body></body></html>`;
    const result = extractArticleAsMarkdown(html);

    expect(result).toBeNull();
  });

  it("handles nested inline elements without glue-ups", () => {
    // Regression: old regex approach produced "Functionin" from adjacent spans
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Emotion Concepts Paper</title></head>
      <body>
        <article>
          <h1><span>Emotion Concepts and their </span><span>Function in a Large Language Model</span></h1>
          <p>Large language models sometimes appear to exhibit emotional reactions. They express enthusiasm when helping with creative projects and frustration when stuck on difficult problems.</p>
          <p>In this work, we investigate the underlying representations that drive these observable behaviors. We provide a detailed characterization of how emotion concepts are encoded internally.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    // Key assertion: "Function in" must survive as two separate words
    expect(result!.markdown).toContain("Function in a Large Language Model");
    expect(result!.markdown).not.toContain("Functionin");
  });

  it("converts inline formatting (bold, italic, links, inline code)", () => {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Formatting Test</title></head>
      <body>
        <article>
          <h1>Formatting Test Article</h1>
          <p>This paragraph has <strong>bold text</strong>, <em>italic text</em>, a <a href="https://example.com">link</a>, and <code>inline_code()</code> that should all survive the round trip through Readability and the markdown converter.</p>
          <p>Another paragraph with more content to meet the Readability threshold for classifying this as an article rather than a stub.</p>
        </article>
      </body>
      </html>
    `;
    const result = extractArticleAsMarkdown(html);

    expect(result).not.toBeNull();
    expect(result!.markdown).toContain("**bold text**");
    expect(result!.markdown).toMatch(/_italic text_|\*italic text\*/);
    expect(result!.markdown).toContain("[link](https://example.com)");
    expect(result!.markdown).toContain("`inline_code()`");
  });
});
