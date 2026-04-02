import { describe, it, expect } from "vitest";
import { alignBlocks } from "./alignBlocks";

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
});
