import { describe, it, expect, vi, afterEach } from "vitest";
import { splitIntoChunks, removeHallucinatedImages } from "./gemini";

const mockGenerateContentStream = vi.fn();
const mockGenerateContent = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContentStream: mockGenerateContentStream,
      generateContent: mockGenerateContent,
    };
  },
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: "HARM_CATEGORY_HARASSMENT",
    HARM_CATEGORY_HATE_SPEECH: "HARM_CATEGORY_HATE_SPEECH",
    HARM_CATEGORY_SEXUALLY_EXPLICIT: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    HARM_CATEGORY_DANGEROUS_CONTENT: "HARM_CATEGORY_DANGEROUS_CONTENT",
  },
  HarmBlockThreshold: {
    BLOCK_NONE: "BLOCK_NONE",
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

    const result = await translateChunk(
      "Hello world. This is a longer text input that will actually be translated, not skipped as trivially short content."
    );
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
      "# Title of the Article\n\nThis is a substantial paragraph of introductory content that would normally be translated.\n\n![figure](https://example.com/fig.png)\n\nAnd here is another reasonably long paragraph about the figure above explaining its significance.";
    await translateChunk(input);

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const promptText = callArgs.contents[0].parts[0].text;
    // Images should be passed through so Gemini preserves them in-place
    expect(promptText).toContain("![figure](https://example.com/fig.png)");
  });

  it("sends safety settings set to BLOCK_NONE for academic content", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGenerateContent.mockResolvedValueOnce({ text: "翻译" });

    await translateChunk(
      "This is test content that's long enough to trigger the actual translation call and bypass the short-text skip."
    );

    const callArgs = mockGenerateContent.mock.calls[0][0];
    const safety = callArgs.config.safetySettings;
    expect(Array.isArray(safety)).toBe(true);
    expect(safety.length).toBeGreaterThanOrEqual(4);
    for (const s of safety) {
      expect(s.threshold).toBe("BLOCK_NONE");
    }
  });

  it("makes a single Gemini call per text segment (no retry)", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const input = "Hello. ".repeat(500); // ~3500 chars
    const output = "你好".repeat(1000);

    mockGenerateContent.mockResolvedValueOnce({
      text: output,
      candidates: [{ finishReason: "STOP" }],
    });

    await translateChunk(input);

    // Always exactly one call — no retry logic
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("skips translation entirely for pure code block content", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const codeOnly = "```python\nprint('hello')\nprint('world')\n```";
    const result = await translateChunk(codeOnly);

    // Should return code as-is without calling Gemini
    expect(result).toBe(codeOnly);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("passes code blocks through without translating them", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    mockGenerateContent.mockResolvedValueOnce({
      text: "这是前面的文字。",
      candidates: [{ finishReason: "STOP" }],
    });
    mockGenerateContent.mockResolvedValueOnce({
      text: "这是后面的文字。",
      candidates: [{ finishReason: "STOP" }],
    });

    const input = `Here is some leading text that should be translated by the API. This paragraph needs to be substantially long so it gets translated rather than skipped as trivially short content.

\`\`\`python
print("do not translate me")
\`\`\`

Here is some trailing text that should also be translated. This paragraph also needs to be reasonably long to avoid the short-text skip threshold.`;

    const result = await translateChunk(input);

    // Code block should appear unchanged in the output
    expect(result).toContain('print("do not translate me")');
    expect(result).toContain("这是前面的文字。");
    expect(result).toContain("这是后面的文字。");
    // Gemini should only be called for the two text segments (not the code)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

});

describe("TRANSLATION_PROMPT structure", () => {
  it("uses 英语思维 methodology and structural-preservation rules", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGenerateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield { text: "ok" };
      })()
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const chunk of streamTranslateToChineseMarkdown("test")) {
      // drain
    }

    const promptText =
      mockGenerateContentStream.mock.calls[0][0].contents[0].parts[0].text;
    expect(promptText).toContain("英语思维");
    // Must instruct to preserve heading/paragraph structure
    expect(promptText).toMatch(/相同数量的标题|每个段落/);
    // Must instruct to preserve markdown formatting
    expect(promptText).toContain("markdown");
  });
});

describe("prompt", () => {
  it("instructs Gemini to preserve markdown formatting including images", async () => {
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
    // Must instruct Gemini to preserve markdown formatting (images included)
    expect(promptText).toContain("markdown 格式");
    expect(promptText).toMatch(/图片|image/i);
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
    // Each section is larger than MIN_CHUNK_SIZE so should stay split
    const big1 = "## Section One\n\n" + "A".repeat(9_000);
    const big2 = "## Section Two\n\n" + "B".repeat(9_000);
    const md = `# Title\n\n${big1}\n\n${big2}`;

    const chunks = splitIntoChunks(md, 10);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to paragraph splitting for oversized sections", () => {
    // Section exceeds MAX_CHUNK_SIZE (18KB) with no ### subheadings.
    // Real case: appendices with raw examples.
    const hugePara = "Para content here. ".repeat(500); // ~9.5KB each
    const md = `## Big Section\n\n${hugePara}\n\n${hugePara}\n\n${hugePara}`;
    const chunks = splitIntoChunks(md, 10);
    // No chunk should exceed MAX_CHUNK_SIZE
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(20_000);
    }
    // All content preserved
    const joined = chunks.join("\n\n");
    expect(joined).toContain("Big Section");
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

describe("removeHallucinatedImages", () => {
  it("keeps images whose URLs appear in the original", () => {
    const original = "See ![fig](https://example.com/real.png)";
    const translated = "见 ![图](https://example.com/real.png)";
    const result = removeHallucinatedImages(translated, original);
    expect(result).toContain("https://example.com/real.png");
  });

  it("removes standalone image lines with fabricated URLs", () => {
    const original = "See ![fig](https://example.com/real.png)";
    const translated =
      "见 ![图](https://example.com/real.png)\n\n![](image.png)\n\n![](fake.jpg)";
    const result = removeHallucinatedImages(translated, original);
    expect(result).toContain("https://example.com/real.png");
    expect(result).not.toContain("image.png");
    expect(result).not.toContain("fake.jpg");
  });

  it("removes ALL standalone images when original has none", () => {
    const original = "Plain text, no images here.";
    const translated = "普通文本\n\n![](invented.png)\n\n![](image.png)";
    const result = removeHallucinatedImages(translated, original);
    expect(result).not.toContain("invented.png");
    expect(result).not.toContain("image.png");
    expect(result).toContain("普通文本");
  });

  it("preserves inline image references (not their own line)", () => {
    const original = "See ![fig](https://example.com/real.png)";
    const translated = "请参见 ![图](https://example.com/real.png) 上面所示";
    const result = removeHallucinatedImages(translated, original);
    // Inline image should be preserved
    expect(result).toBe(translated);
  });

  it("collapses triple newlines left by removed images", () => {
    const original = "No images.";
    const translated = "段落一\n\n![](fake.png)\n\n段落二";
    const result = removeHallucinatedImages(translated, original);
    expect(result).not.toMatch(/\n\n\n/);
    expect(result).toContain("段落一");
    expect(result).toContain("段落二");
  });
});
