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
  it("removes standalone image lines and tracks their positions", () => {
    const md = "# Title\n\n![photo](https://example.com/img.png)\n\nSome text.";
    const { text, images } = stripImages(md);

    expect(text).not.toContain("![photo]");
    expect(text).not.toContain("IMG_PLACEHOLDER");
    expect(text).toContain("Some text.");
    expect(images).toHaveLength(1);
    expect(images[0].image).toBe("![photo](https://example.com/img.png)");
  });

  it("handles multiple images", () => {
    const md = "![a](1.png)\n\nText\n\n![b](2.png)";
    const { text, images } = stripImages(md);

    expect(images).toHaveLength(2);
    expect(text).not.toContain("![a]");
    expect(text).not.toContain("![b]");
    expect(text).toContain("Text");
  });

  it("preserves inline image references (not on their own line)", () => {
    const md = "See ![icon](i.png) in the text";
    const { text } = stripImages(md);

    // Inline images are not on their own line, should not be stripped
    expect(text).toContain("![icon](i.png)");
  });

  it("returns empty array when no images", () => {
    const md = "# Title\n\nJust text.";
    const { text, images } = stripImages(md);

    expect(text).toBe(md);
    expect(images).toHaveLength(0);
  });
});

describe("restoreImages", () => {
  it("re-inserts images at their original line positions", () => {
    const images = [
      { lineIndex: 2, image: "![photo](https://example.com/img.png)" },
    ];
    const translated = "# 标题\n\n一些文字。";
    const result = restoreImages(translated, images);

    expect(result).toContain("![photo](https://example.com/img.png)");
    const lines = result.split("\n");
    expect(lines[2]).toBe("![photo](https://example.com/img.png)");
  });

  it("clamps positions when translated text is shorter", () => {
    const images = [
      { lineIndex: 100, image: "![img](url)" },
    ];
    const translated = "Short\ntext";
    const result = restoreImages(translated, images);

    expect(result).toContain("![img](url)");
  });

  it("handles multiple images in correct order", () => {
    const images = [
      { lineIndex: 1, image: "![a](1.png)" },
      { lineIndex: 3, image: "![b](2.png)" },
    ];
    const translated = "Line 0\nLine 1\nLine 2\nLine 3";
    const result = restoreImages(translated, images);

    const lines = result.split("\n");
    expect(lines).toContain("![a](1.png)");
    expect(lines).toContain("![b](2.png)");
    expect(lines.indexOf("![a](1.png)")).toBeLessThan(
      lines.indexOf("![b](2.png)")
    );
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

  it("does not split on h3 or lower headings", () => {
    const md = "## Main\n\n### Sub1\n\nText\n\n### Sub2\n\nMore text";
    const chunks = splitIntoChunks(md, 10);
    expect(chunks).toHaveLength(1);
  });
});
