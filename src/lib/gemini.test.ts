import { describe, it, expect, vi, afterEach } from "vitest";
import {
  stripImages,
  restoreImages,
  splitIntoChunks,
} from "./gemini";

const mockGenerateContentStream = vi.fn();
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: mockGenerateContentStream,
      generateContent: mockGenerateContent,
    };
  },
}));

// Must import after mock is set up
import { streamTranslateToChineseMarkdown, translateChunk } from "./gemini";

afterEach(() => {
  mockGenerateContentStream.mockReset();
  mockGenerateContent.mockReset();
});

describe("streamTranslateToChineseMarkdown", () => {
  it("yields chunks from Gemini stream", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    mockGenerateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield { text: "# 你好" };
        yield { text: "\n\n世界" };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of streamTranslateToChineseMarkdown(
      "# Hello\n\nWorld"
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["# 你好", "\n\n世界"]);
    expect(mockGenerateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({
          thinkingConfig: { thinkingBudget: 8192 },
        }),
      })
    );
  });

  it("skips empty text chunks", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    mockGenerateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield { text: "翻译" };
        yield { text: "" };
        yield { text: "内容" };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of streamTranslateToChineseMarkdown("test")) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["翻译", "内容"]);
  });

  it("includes markdown content in the prompt", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    mockGenerateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield { text: "ok" };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of streamTranslateToChineseMarkdown(
      "## Special Content"
    )) {
      chunks.push(chunk);
    }

    const callArgs = mockGenerateContentStream.mock.calls[0][0];
    const promptText = callArgs.contents[0].parts[0].text;
    expect(promptText).toContain("## Special Content");
    expect(promptText).toContain("英语思维");
  });
});

describe("translateChunk", () => {
  it("calls generateContent and returns text", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    mockGenerateContent.mockResolvedValueOnce({ text: "翻译结果" });

    const result = await translateChunk("Hello world");
    expect(result).toBe("翻译结果");
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-flash",
        config: expect.objectContaining({
          // Lower budget than single-shot: chunks are smaller and faster
          thinkingConfig: { thinkingBudget: 2048 },
        }),
      })
    );
  });
});

describe("stripImages", () => {
  it("removes standalone image blocks and tracks by heading + offset", () => {
    const md = "# Title\n\nPara 1.\n\n![photo](https://example.com/img.png)\n\nPara 2.";
    const { text, images } = stripImages(md);

    expect(text).not.toContain("![photo]");
    expect(text).toContain("Para 1.");
    expect(text).toContain("Para 2.");
    expect(images).toHaveLength(1);
    expect(images[0].image).toBe("![photo](https://example.com/img.png)");
    // After heading 0 (# Title), offset 1 (after Para 1 which is offset=1)
    expect(images[0].headingIndex).toBe(0);
    expect(images[0].offset).toBe(1);
  });

  it("handles image before any heading (headingIndex = -1)", () => {
    const md = "![a](1.png)\n\nFirst text.\n\n# Heading";
    const { images } = stripImages(md);
    expect(images[0].headingIndex).toBe(-1);
  });

  it("tracks offsets within sections correctly", () => {
    const md = "# H1\n\nA.\n\n![img1](1.png)\n\n## H2\n\nB.\n\nC.\n\n![img2](2.png)";
    const { images } = stripImages(md);

    expect(images).toHaveLength(2);
    // img1: after heading 0, 1 paragraph before it → offset 1
    expect(images[0]).toEqual({
      headingIndex: 0,
      offset: 1,
      image: "![img1](1.png)",
    });
    // img2: after heading 1 (## H2), 2 paragraphs before it → offset 2
    expect(images[1]).toEqual({
      headingIndex: 1,
      offset: 2,
      image: "![img2](2.png)",
    });
  });

  it("preserves inline image references (not on their own block)", () => {
    const md = "See ![icon](i.png) in the text";
    const { text } = stripImages(md);
    expect(text).toContain("![icon](i.png)");
  });

  it("returns empty array when no images", () => {
    const md = "# Title\n\nJust text.";
    const { text, images } = stripImages(md);
    expect(images).toHaveLength(0);
    expect(text).toContain("# Title");
    expect(text).toContain("Just text.");
  });
});

describe("restoreImages", () => {
  it("re-inserts image at correct position relative to heading", () => {
    // Image anchored to heading 0, offset 1 (after 1 paragraph)
    const images = [
      { headingIndex: 0, offset: 1, image: "![photo](url)" },
    ];
    const translated = "# 标题\n\n段落一。\n\n段落二。";
    const result = restoreImages(translated, images);

    const blocks = result.split("\n\n");
    expect(blocks[0]).toBe("# 标题");
    expect(blocks[1]).toBe("段落一。");
    expect(blocks[2]).toBe("![photo](url)");
    expect(blocks[3]).toBe("段落二。");
  });

  it("stays robust when translation merges paragraphs (fewer blocks)", () => {
    // Original: heading + 2 paras + image + 1 para = 4 kept blocks
    // Translation merged 2 paras into 1: heading + 1 para + 1 para = 3 blocks
    // Image should still land after the (merged) paragraph
    const images = [
      { headingIndex: 0, offset: 2, image: "![fig](fig.png)" },
    ];
    // Only 2 content blocks after heading (simulating merge)
    const translated = "# 标题\n\n合并后的段落。\n\n另一个段落。";
    const result = restoreImages(translated, images);

    // offset=2 means "2 blocks after heading" — clamped to next section boundary
    // With only 2 content blocks, image goes at end of section
    expect(result).toContain("![fig](fig.png)");
  });

  it("keeps images within correct section when translation varies", () => {
    const images = [
      { headingIndex: 0, offset: 1, image: "![a](1.png)" },
      { headingIndex: 1, offset: 1, image: "![b](2.png)" },
    ];
    const translated = "# H1\n\nA.\n\n## H2\n\nB.";
    const result = restoreImages(translated, images);

    const blocks = result.split("\n\n");
    // img a should be in H1 section (after "A.", before "## H2")
    const aIdx = blocks.indexOf("![a](1.png)");
    const h2Idx = blocks.indexOf("## H2");
    expect(aIdx).toBeLessThan(h2Idx);
    // img b should be in H2 section (after "B.")
    const bIdx = blocks.indexOf("![b](2.png)");
    expect(bIdx).toBeGreaterThan(h2Idx);
  });

  it("handles images before any heading", () => {
    const images = [
      { headingIndex: -1, offset: 0, image: "![top](top.png)" },
    ];
    const translated = "Intro text.\n\n# 标题";
    const result = restoreImages(translated, images);

    const blocks = result.split("\n\n");
    expect(blocks[0]).toBe("![top](top.png)");
  });

  it("falls back to end-of-document if heading doesn't exist in translation", () => {
    const images = [
      { headingIndex: 5, offset: 0, image: "![img](url)" },
    ];
    const translated = "# 标题\n\n正文。";
    const result = restoreImages(translated, images);
    expect(result).toContain("![img](url)");
  });
});

describe("splitIntoChunks", () => {
  it("returns single chunk for short content", () => {
    const md = "# Title\n\nShort text.";
    const chunks = splitIntoChunks(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(md);
  });

  it("splits on h2 headings and merges small adjacent chunks", () => {
    // Build sections that are individually small (<MIN_CHUNK_SIZE)
    // so they should be merged back together
    const section1 = "# Title\n\n" + "Intro paragraph. ".repeat(100);
    const section2 = "## Section One\n\n" + "Content one. ".repeat(100);
    const section3 = "## Section Two\n\n" + "Content two. ".repeat(100);
    const md = `${section1}\n\n${section2}\n\n${section3}`;

    const chunks = splitIntoChunks(md, 10);
    // Small sections get merged to reduce API calls
    expect(chunks.length).toBeLessThanOrEqual(3);
    // All section content should still be present
    const joined = chunks.join("\n\n");
    expect(joined).toContain("# Title");
    expect(joined).toContain("## Section One");
    expect(joined).toContain("## Section Two");
  });

  it("keeps large sections as separate chunks", () => {
    // Each section is larger than MIN_CHUNK_SIZE (10KB) so should stay split
    const big1 = "## Section One\n\n" + "A".repeat(11_000);
    const big2 = "## Section Two\n\n" + "B".repeat(11_000);
    const md = `# Title\n\n${big1}\n\n${big2}`;

    const chunks = splitIntoChunks(md, 10);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("further splits oversized chunks by h3 headings", () => {
    // Build a chunk that exceeds MAX_CHUNK_SIZE (30000)
    const longPara = "A".repeat(31_000);
    const md = `# Title\n\nIntro.\n\n## Main\n\n${longPara}\n\n### Sub1\n\nText\n\n### Sub2\n\nMore text`;
    const chunks = splitIntoChunks(md, 10); // low threshold to force split
    // The ## Main chunk is oversized, so should be split by ###
    expect(chunks.length).toBeGreaterThanOrEqual(3); // Title chunk + Sub1 + Sub2
    expect(chunks.some((c) => c.includes("### Sub1"))).toBe(true);
    expect(chunks.some((c) => c.includes("### Sub2"))).toBe(true);
  });

  it("keeps small h2 chunks intact even with h3 headings", () => {
    const md = "## Main\n\n### Sub1\n\nText\n\n### Sub2\n\nMore text";
    const chunks = splitIntoChunks(md, 10);
    // Under MAX_CHUNK_SIZE, no further splitting
    expect(chunks).toHaveLength(1);
  });
});
