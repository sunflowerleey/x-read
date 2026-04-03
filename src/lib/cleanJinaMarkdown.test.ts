import { describe, it, expect } from "vitest";
import {
  fixCodeBlocks,
  filterJunkLines,
  fixBrokenTables,
  restoreMissingSectionHeadings,
  deriveSectionTitle,
  cleanJinaMarkdown,
} from "./cleanJinaMarkdown";

describe("fixCodeBlocks", () => {
  it("merges separated language identifier with code fence", () => {
    const input = "typescript\n\n```\nconst x = 1;\n```";
    expect(fixCodeBlocks(input)).toBe("```typescript\nconst x = 1;\n```");
  });

  it("handles single blank line between lang and fence", () => {
    const input = "python\n```\nprint('hi')\n```";
    expect(fixCodeBlocks(input)).toBe("```python\nprint('hi')\n```");
  });

  it("does not modify already correct code blocks", () => {
    const input = "```typescript\nconst x = 1;\n```";
    expect(fixCodeBlocks(input)).toBe(input);
  });

  it("does not modify unrelated text", () => {
    const input = "This is typescript in a sentence.\n\nMore text.";
    expect(fixCodeBlocks(input)).toBe(input);
  });
});

describe("filterJunkLines", () => {
  it("removes video thumbnails", () => {
    const input =
      "Before.\n![Image 3](https://pbs.twimg.com/amplify_video_thumb/123/img/abc.jpg)\nAfter.";
    expect(filterJunkLines(input)).toBe("Before.\nAfter.");
  });

  it("removes video timestamps", () => {
    const input = "Before.\n0:20\nAfter.";
    expect(filterJunkLines(input)).toBe("Before.\nAfter.");
  });

  it("keeps regular images", () => {
    const input = "![img](https://example.com/photo.jpg)";
    expect(filterJunkLines(input)).toBe(input);
  });

  it("keeps regular numbers that look like timestamps in context", () => {
    const input = "The score was 1:30 in the game.";
    // This is inline text, not a standalone line matching ^\d:\d{2}$
    expect(filterJunkLines(input)).toBe(input);
  });
});

describe("restoreMissingSectionHeadings", () => {
  it("promotes short title-like line to heading", () => {
    const input = "Previous paragraph.\n\nThe Problem\n\nSome description.";
    const result = restoreMissingSectionHeadings(input);
    expect(result).toContain("## The Problem");
  });

  it("does not promote lines ending with period", () => {
    const input = "Previous.\n\nThis is a sentence.\n\nMore text.";
    const result = restoreMissingSectionHeadings(input);
    expect(result).not.toContain("## This is a sentence.");
  });

  it("does not promote lines with common verbs", () => {
    const input = "Previous.\n\nThis is important\n\nMore text.";
    const result = restoreMissingSectionHeadings(input);
    expect(result).not.toContain("## This is important");
  });

  it("does not promote lines longer than 8 words", () => {
    const input =
      "Previous.\n\nThis Title Has Way Too Many Words In It\n\nMore text.";
    const result = restoreMissingSectionHeadings(input);
    expect(result).not.toContain("## This Title");
  });

  it("does not modify existing headings", () => {
    const input = "## Already a Heading\n\nContent.";
    expect(restoreMissingSectionHeadings(input)).toBe(input);
  });
});

describe("fixBrokenTables", () => {
  it("converts broken 3-column table to markdown table", () => {
    const input = [
      "**Agent & Phase****Duration****Cost**",
      "Planner 4.7 min$0.46",
      "Build (Round 1)2 hr 7 min$71.08",
      "QA (Round 1)8.8 min$3.24",
      "**Total V2 Harness****3 hr 50 min****$124.70**",
      "",
      "Next paragraph.",
    ].join("\n");

    const result = fixBrokenTables(input);
    expect(result).toContain("| **Agent & Phase** |");
    expect(result).toContain("| --- |");
    expect(result).toContain("$0.46");
    expect(result).toContain("$71.08");
    expect(result).toContain("$124.70");
    expect(result).toContain("Next paragraph.");
  });

  it("does not modify regular bold text", () => {
    const input = "This is **bold** text and **more bold** text.";
    expect(fixBrokenTables(input)).toBe(input);
  });

  it("does not modify proper markdown tables", () => {
    const input = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(fixBrokenTables(input)).toBe(input);
  });
});

describe("deriveSectionTitle", () => {
  it("returns known mapping for toolResultStorage", () => {
    expect(deriveSectionTitle("src/utils/toolResultStorage.ts")).toBe(
      "Layer 1: Tool Result Storage"
    );
  });

  it("returns known mapping for autoDream", () => {
    expect(deriveSectionTitle("src/services/autoDream/autoDream.ts")).toBe(
      "Layer 6: Dreaming"
    );
  });

  it("falls back to camelCase-to-Title conversion", () => {
    expect(deriveSectionTitle("src/lib/myNewModule.ts")).toBe("My New Module");
  });

  it("returns null for empty path", () => {
    expect(deriveSectionTitle("")).toBeNull();
  });
});

describe("cleanJinaMarkdown (integration)", () => {
  it("runs full pipeline", () => {
    const input = [
      "typescript\n\n```\nconst x = 1;\n```",
      "![vid](https://pbs.twimg.com/amplify_video_thumb/123/img/a.jpg)",
      "0:20",
      "The Solution\n\nSome text here.",
    ].join("\n\n");

    const result = cleanJinaMarkdown(input);
    expect(result).toContain("```typescript");
    expect(result).not.toContain("amplify_video_thumb");
    expect(result).not.toContain("\n0:20\n");
    expect(result).toContain("## The Solution");
  });
});
