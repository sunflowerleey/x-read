import { describe, it, expect } from "vitest";
import { escapeNonHtmlTags } from "./escapeHtml";

describe("escapeNonHtmlTags", () => {
  it("preserves safe HTML tags", () => {
    const input = "Text with <strong>bold</strong> and <a href='#'>link</a>.";
    expect(escapeNonHtmlTags(input)).toBe(input);
  });

  it("escapes unknown tags to inline code", () => {
    const input = "Path is <sessionId>/file.txt";
    expect(escapeNonHtmlTags(input)).toContain("`<sessionId>`");
  });

  it("does not modify content inside code blocks", () => {
    const input = "```\n<toolUseId> stays\n```";
    const result = escapeNonHtmlTags(input);
    expect(result).toBe(input);
  });

  it("does not modify content inside inline code", () => {
    const input = "Use `<T>` for generics.";
    expect(escapeNonHtmlTags(input)).toBe(input);
  });

  it("escapes tags outside code but preserves inside", () => {
    const input =
      "Outside <customTag> here.\n\n```\n<customTag> inside code\n```";
    const result = escapeNonHtmlTags(input);
    expect(result).toContain("`<customTag>`");
    expect(result).toContain("```\n<customTag> inside code\n```");
  });

  it("handles self-closing tags", () => {
    const input = "Line with <br/> break.";
    // br is safe, should be preserved
    expect(escapeNonHtmlTags(input)).toBe(input);
  });

  it("handles empty input", () => {
    expect(escapeNonHtmlTags("")).toBe("");
  });
});
