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
      })
    );
  });
});

describe("stripImages", () => {
  it("removes standalone image blocks and tracks by block index", () => {
    const md = "# Title\n\n![photo](https://example.com/img.png)\n\nSome text.";
    const { text, images } = stripImages(md);

    expect(text).not.toContain("![photo]");
    expect(text).toContain("Some text.");
    expect(images).toHaveLength(1);
    expect(images[0].image).toBe("![photo](https://example.com/img.png)");
    expect(images[0].blockIndex).toBe(1); // after "# Title" block
  });

  it("handles multiple images", () => {
    const md = "![a](1.png)\n\nText\n\n![b](2.png)";
    const { text, images } = stripImages(md);

    expect(images).toHaveLength(2);
    expect(text).not.toContain("![a]");
    expect(text).not.toContain("![b]");
    expect(text).toContain("Text");
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
  it("re-inserts images at correct block positions", () => {
    // Original: heading, image, paragraph → image at blockIndex 1
    const images = [
      { blockIndex: 1, image: "![photo](https://example.com/img.png)" },
    ];
    // Translation has 2 blocks: heading + paragraph
    const translated = "# 标题\n\n一些文字。";
    const result = restoreImages(translated, images);

    expect(result).toContain("![photo](https://example.com/img.png)");
    // Image should be between heading and paragraph
    const blocks = result.split("\n\n");
    expect(blocks[0]).toBe("# 标题");
    expect(blocks[1]).toBe("![photo](https://example.com/img.png)");
    expect(blocks[2]).toBe("一些文字。");
  });

  it("clamps positions when translated text has fewer blocks", () => {
    const images = [
      { blockIndex: 100, image: "![img](url)" },
    ];
    const translated = "Short text";
    const result = restoreImages(translated, images);

    expect(result).toContain("![img](url)");
  });

  it("handles multiple images in correct order", () => {
    const images = [
      { blockIndex: 1, image: "![a](1.png)" },
      { blockIndex: 3, image: "![b](2.png)" },
    ];
    const translated = "Block 0\n\nBlock 1\n\nBlock 2\n\nBlock 3";
    const result = restoreImages(translated, images);

    expect(result).toContain("![a](1.png)");
    expect(result).toContain("![b](2.png)");
    expect(result.indexOf("![a](1.png)")).toBeLessThan(
      result.indexOf("![b](2.png)")
    );
  });

  it("preserves image position relative to paragraphs regardless of line count", () => {
    // Simulates: EN paragraph is 1 line, ZH paragraph is 3 lines
    // Image should still appear after the paragraph, not in the middle
    const images = [
      { blockIndex: 2, image: "![fig](fig.png)" },
    ];
    const translated = "# 标题\n\n这是一个很长的段落，\n翻译后可能有多行，\n但仍然是一个段落。\n\n更多内容。";
    const result = restoreImages(translated, images);

    const blocks = result.split("\n\n");
    expect(blocks[2]).toBe("![fig](fig.png)");
    expect(blocks[3]).toBe("更多内容。");
  });
});

describe("splitIntoChunks", () => {
  it("returns single chunk for short content", () => {
    const md = "# Title\n\nShort text.";
    const chunks = splitIntoChunks(md);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(md);
  });

  it("splits on h2 headings for long content", () => {
    const section1 = "# Title\n\nIntro paragraph.";
    const section2 = "## Section One\n\nContent one.";
    const section3 = "## Section Two\n\nContent two.";
    const md = `${section1}\n${section2}\n${section3}`;

    const chunks = splitIntoChunks(md, 10); // low threshold to force split
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toContain("# Title");
    expect(chunks[1]).toContain("## Section One");
    expect(chunks[2]).toContain("## Section Two");
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
