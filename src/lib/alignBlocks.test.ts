import { describe, it, expect } from "vitest";
import { alignBlocks, headingLevel } from "./alignBlocks";

describe("alignBlocks", () => {
  it("aligns matching blocks 1:1", () => {
    const en = ["# Title", "Paragraph."];
    const zh = ["# 标题", "段落。"];
    const result = alignBlocks(en, zh);
    expect(result).toEqual([
      ["# Title", "# 标题"],
      ["Paragraph.", "段落。"],
    ]);
  });

  it("handles extra blocks on EN side", () => {
    const en = ["# Title", "P1.", "P2."];
    const zh = ["# 标题", "段落。"];
    const result = alignBlocks(en, zh);
    expect(result).toEqual([
      ["# Title", "# 标题"],
      ["P1.", "段落。"],
      ["P2.", ""],
    ]);
  });

  it("handles extra blocks on ZH side", () => {
    const en = ["# Title", "P1."];
    const zh = ["# 标题", "段落一。", "段落二。"];
    const result = alignBlocks(en, zh);
    expect(result).toEqual([
      ["# Title", "# 标题"],
      ["P1.", "段落一。"],
      ["", "段落二。"],
    ]);
  });

  it("aligns multiple sections independently", () => {
    const en = ["# S1", "A.", "B.", "## S2", "C."];
    const zh = ["# 一", "甲。", "## 二", "丙。"];
    const result = alignBlocks(en, zh);
    // Section 1: en has 3 blocks (heading + 2 paras), zh has 2 (heading + 1 para)
    expect(result[0]).toEqual(["# S1", "# 一"]);
    expect(result[1]).toEqual(["A.", "甲。"]);
    expect(result[2]).toEqual(["B.", ""]);
    // Section 2
    expect(result[3]).toEqual(["## S2", "## 二"]);
    expect(result[4]).toEqual(["C.", "丙。"]);
  });

  it("handles empty ZH (translation not started)", () => {
    const en = ["# Title", "Text."];
    const zh: string[] = [];
    const result = alignBlocks(en, zh);
    expect(result).toEqual([
      ["# Title", ""],
      ["Text.", ""],
    ]);
  });

  it("handles both empty", () => {
    expect(alignBlocks([], [])).toEqual([]);
  });

  it("recovers alignment when EN has an extra heading not in ZH", () => {
    // EN has a duplicate h1 that ZH doesn't have
    const en = ["# Title", "# Title Duplicate", "## Intro", "Text.", "## Part 1", "Body."];
    const zh = ["# 标题", "## 引言", "正文。", "## 第一部分", "内容。"];
    const result = alignBlocks(en, zh);
    // The duplicate h1 should be EN-only, then alignment recovers
    expect(result).toContainEqual(["## Intro", "## 引言"]);
    expect(result).toContainEqual(["## Part 1", "## 第一部分"]);
    expect(result).toContainEqual(["Text.", "正文。"]);
    expect(result).toContainEqual(["Body.", "内容。"]);
  });

  it("recovers alignment when ZH has extra sections", () => {
    const en = ["# Title", "## S1", "A.", "## S2", "B."];
    const zh = ["# 标题", "## 一", "甲。", "### 额外", "附加。", "## 二", "乙。"];
    const result = alignBlocks(en, zh);
    expect(result).toContainEqual(["## S1", "## 一"]);
    expect(result).toContainEqual(["## S2", "## 二"]);
  });
});

describe("headingLevel", () => {
  it("extracts heading level", () => {
    expect(headingLevel("# Title")).toBe(1);
    expect(headingLevel("## Section")).toBe(2);
    expect(headingLevel("### Sub")).toBe(3);
    expect(headingLevel("###### Deep")).toBe(6);
  });

  it("returns -1 for non-headings", () => {
    expect(headingLevel("Text")).toBe(-1);
    expect(headingLevel("")).toBe(-1);
    expect(headingLevel(undefined)).toBe(-1);
  });
});
