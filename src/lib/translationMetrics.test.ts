import { describe, it, expect, vi, afterEach } from "vitest";
import {
  countImages,
  countHeadings,
  countBlocks,
  computeMetrics,
  checkTranslationInvariants,
  logMetrics,
} from "./translationMetrics";

describe("countImages", () => {
  it("counts standalone image lines", () => {
    const md = "# Title\n\n![a](1.png)\n\nText\n\n![b](2.png)";
    expect(countImages(md)).toBe(2);
  });

  it("ignores inline images", () => {
    const md = "See ![icon](i.png) in the text";
    expect(countImages(md)).toBe(0);
  });

  it("returns 0 for empty markdown", () => {
    expect(countImages("")).toBe(0);
  });
});

describe("countHeadings", () => {
  it("counts all heading levels", () => {
    const md = "# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6";
    expect(countHeadings(md)).toBe(6);
  });

  it("ignores # inside content", () => {
    const md = "Text with #hashtag\n\nMore text";
    expect(countHeadings(md)).toBe(0);
  });

  it("requires space after #", () => {
    // Markdown requires space after # for a heading
    const md = "#Title\n\n# Real";
    expect(countHeadings(md)).toBe(1);
  });
});

describe("countBlocks", () => {
  it("counts blank-line-separated blocks", () => {
    const md = "Block 1\n\nBlock 2\n\nBlock 3";
    expect(countBlocks(md)).toBe(3);
  });

  it("ignores empty blocks from multiple blank lines", () => {
    const md = "A\n\n\n\nB";
    expect(countBlocks(md)).toBe(2);
  });
});

describe("computeMetrics", () => {
  it("returns all metrics for a markdown document", () => {
    const md = "# Title\n\nPara.\n\n![img](u.png)\n\n## Section\n\nMore.";
    const m = computeMetrics(md);
    expect(m.headings).toBe(2);
    expect(m.images).toBe(1);
    expect(m.blocks).toBe(5);
    expect(m.chars).toBe(md.length);
  });
});

describe("checkTranslationInvariants", () => {
  const base = { headings: 10, images: 3, blocks: 50, chars: 10_000 };

  it("reports no violations when metrics match", () => {
    const result = checkTranslationInvariants(base, { ...base });
    expect(result.violations).toEqual([]);
  });

  it("reports image_count_mismatch when image count differs", () => {
    const after = { ...base, images: 2 };
    const result = checkTranslationInvariants(base, after);
    expect(result.violations).toContainEqual(
      expect.stringContaining("image_count_mismatch")
    );
  });

  it("tolerates small heading drift (<=3 absolute)", () => {
    // drift=3 with before=10 → 30% but absolute drift is at threshold
    const after = { ...base, headings: 7 };
    const result = checkTranslationInvariants(base, after);
    expect(result.violations.filter((v) => v.startsWith("heading_drift"))).toEqual([]);
  });

  it("flags heading drift when both absolute > 3 and ratio > 10%", () => {
    // drift=5 with before=10 → 50%, should flag
    const after = { ...base, headings: 5 };
    const result = checkTranslationInvariants(base, after);
    expect(result.violations).toContainEqual(
      expect.stringContaining("heading_drift")
    );
  });

  it("flags block drift > 30%", () => {
    const after = { ...base, blocks: 30 }; // 40% drop
    const result = checkTranslationInvariants(base, after);
    expect(result.violations).toContainEqual(
      expect.stringContaining("block_drift")
    );
  });

  it("simulates the transformer-circuits bug: dropped empty headings", () => {
    // Real bug pattern: 14 empty sections got collapsed during translation
    const before = { headings: 95, images: 27, blocks: 1357, chars: 260_000 };
    const after = { headings: 81, images: 26, blocks: 1300, chars: 240_000 };
    const result = checkTranslationInvariants(before, after);
    // Should flag BOTH image mismatch AND heading drift
    expect(result.violations.some((v) => v.includes("image_count_mismatch"))).toBe(true);
    expect(result.violations.some((v) => v.includes("heading_drift"))).toBe(true);
  });

  it("flags output_truncated when translation is cut off mid-stream", () => {
    // Real observed pattern: 260KB EN → 94KB ZH (36% ratio, way too low)
    // Gemini hit maxOutputTokens limit silently
    const before = { headings: 97, images: 27, blocks: 1358, chars: 259_948 };
    const after = { headings: 97, images: 35, blocks: 1101, chars: 94_195 };
    const result = checkTranslationInvariants(before, after);
    expect(result.violations.some((v) => v.includes("output_truncated"))).toBe(true);
    expect(result.violations.some((v) => v.includes("image_count_mismatch"))).toBe(true);
  });

  it("accepts normal Chinese output ratio (50-70% of English)", () => {
    const before = { headings: 10, images: 3, blocks: 50, chars: 10_000 };
    const after = { headings: 10, images: 3, blocks: 50, chars: 6_000 }; // 60%
    const result = checkTranslationInvariants(before, after);
    expect(result.violations.filter((v) => v.includes("output_"))).toEqual([]);
  });

  it("flags output_bloated when translation is suspiciously long", () => {
    const before = { headings: 5, images: 1, blocks: 20, chars: 10_000 };
    const after = { headings: 5, images: 1, blocks: 20, chars: 20_000 }; // 200%
    const result = checkTranslationInvariants(before, after);
    expect(result.violations.some((v) => v.includes("output_bloated"))).toBe(true);
  });

  it("skips char ratio check for very short content (<1000 chars)", () => {
    // Short content has too much variance in char ratios to check reliably
    const before = { headings: 1, images: 0, blocks: 2, chars: 500 };
    const after = { headings: 1, images: 0, blocks: 2, chars: 150 }; // 30%
    const result = checkTranslationInvariants(before, after);
    expect(result.violations.filter((v) => v.includes("output_"))).toEqual([]);
  });
});

describe("logMetrics", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  afterEach(() => {
    warnSpy.mockClear();
    logSpy.mockClear();
  });

  it("logs as warning when violations exist", () => {
    logMetrics("test", {
      before: { headings: 5, images: 2, blocks: 10, chars: 100 },
      after: { headings: 5, images: 1, blocks: 10, chars: 100 },
      violations: ["image_count_mismatch: before=2 after=1"],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("translation-invariant")
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs as info when no violations", () => {
    logMetrics("test", {
      before: { headings: 5, images: 2, blocks: 10, chars: 100 },
      after: { headings: 5, images: 2, blocks: 10, chars: 100 },
      violations: [],
    });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("translation-metrics")
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("emits parsable JSON with stage and timestamp", () => {
    logMetrics("parallel", {
      before: { headings: 1, images: 0, blocks: 1, chars: 10 },
      after: { headings: 1, images: 0, blocks: 1, chars: 10 },
      violations: [],
    });
    const call = logSpy.mock.calls[0][0] as string;
    const jsonPart = call.replace("[translation-metrics] ", "");
    const parsed = JSON.parse(jsonPart);
    expect(parsed.stage).toBe("parallel");
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
