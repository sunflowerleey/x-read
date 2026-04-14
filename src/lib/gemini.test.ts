import { describe, it, expect, vi, afterEach } from "vitest";
import { splitIntoChunks } from "./gemini";

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

  it("passes image markdown to Gemini unchanged (not stripped)", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    mockGenerateContent.mockResolvedValueOnce({ text: "翻译" });

    const input =
      "# Title\n\nPara.\n\n![figure](https://example.com/fig.png)\n\nMore.";
    await translateChunk(input);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const promptText = callArgs.contents[0].parts[0].text;
    // Images should be passed through so Gemini preserves them in-place
    expect(promptText).toContain("![figure](https://example.com/fig.png)");
  });
});

describe("prompt", () => {
  it("instructs Gemini to preserve image markdown in place", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    mockGenerateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield { text: "ok" };
      })()
    );

    const chunks: string[] = [];
    for await (const chunk of streamTranslateToChineseMarkdown("test")) {
      chunks.push(chunk);
    }

    const promptText =
      mockGenerateContentStream.mock.calls[0][0].contents[0].parts[0].text;
    // Must explicitly tell Gemini to preserve image lines
    expect(promptText).toMatch(/图片.*原样|preserve.*image/i);
    expect(promptText).toContain("![");
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
