import { describe, it, expect } from "vitest";
import { splitMarkdownIntoBlocks } from "./splitMarkdown";

describe("splitMarkdownIntoBlocks", () => {
  it("splits headings into separate blocks", () => {
    const md = "# Title\n\nParagraph.\n\n## Section\n\nMore text.";
    const blocks = splitMarkdownIntoBlocks(md);
    expect(blocks).toEqual([
      "# Title",
      "Paragraph.",
      "## Section",
      "More text.",
    ]);
  });

  it("keeps code blocks as single block", () => {
    const md = "Before.\n\n```typescript\nconst x = 1;\nconst y = 2;\n```\n\nAfter.";
    const blocks = splitMarkdownIntoBlocks(md);
    expect(blocks).toEqual([
      "Before.",
      "```typescript\nconst x = 1;\nconst y = 2;\n```",
      "After.",
    ]);
  });

  it("keeps list items with blank lines as single block", () => {
    const md = "Intro:\n\n1.   Item one\n\n2.   Item two\n\n3.   Item three\n\nNext.";
    const blocks = splitMarkdownIntoBlocks(md);
    expect(blocks[0]).toBe("Intro:");
    expect(blocks[1]).toContain("Item one");
    expect(blocks[1]).toContain("Item two");
    expect(blocks[1]).toContain("Item three");
    expect(blocks[2]).toBe("Next.");
  });

  it("keeps unordered list as single block", () => {
    const md = "* First\n\n* Second\n\n* Third";
    const blocks = splitMarkdownIntoBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("First");
    expect(blocks[0]).toContain("Third");
  });

  it("separates blockquotes as blocks", () => {
    const md = "Before.\n\n> Quote here.\n\nAfter.";
    const blocks = splitMarkdownIntoBlocks(md);
    expect(blocks).toEqual(["Before.", "> Quote here.", "After."]);
  });

  it("handles horizontal rules", () => {
    const md = "Above.\n\n---\n\nBelow.";
    const blocks = splitMarkdownIntoBlocks(md);
    expect(blocks).toEqual(["Above.", "---", "Below."]);
  });

  it("handles empty input", () => {
    expect(splitMarkdownIntoBlocks("")).toEqual([]);
    expect(splitMarkdownIntoBlocks("\n\n\n")).toEqual([]);
  });

  it("does not split code block containing headings", () => {
    const md = "```\n# Not a heading\n## Also not\n```";
    const blocks = splitMarkdownIntoBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("# Not a heading");
  });
});
