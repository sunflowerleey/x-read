import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!_ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === "your_gemini_api_key_here") {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    _ai = new GoogleGenAI({ apiKey: key });
  }
  return _ai;
}

const TRANSLATION_PROMPT = `你是一位精通英汉双语的专业翻译。请运用"英语思维"方法，将下方英文 markdown 翻译成流畅、精准且自然的简体中文。

## 翻译方法（在你的内部思考中完成，不要输出）

在思考阶段，请依次完成以下步骤：

1. **略读抓取大意**：快速浏览全文，抓住核心主题、基调和目的。注意关键词和短语。
2. **分块与逻辑梳理**：将文本分解为有意义的"意群"，理解每个信息块的核心含义，以及它们之间的逻辑关系（因果、递进、对比、举例等）。
3. **总结与内化**：用英文对原文核心信息做一次简明总结，确保在源语言框架内完全消化其内在含义。
4. **关键选词与文化适配**：识别关键术语、习语、文化典故，思考中文语境中功能对等的表达方式。对比直译与意译的优劣，选择最能实现"信、达、雅"的方案。
5. **句法重构**：分析复杂句的句法结构，思考如何用符合中文表达习惯的方式重构，而非逐字硬译。

## 输出规则

- 只输出最终中文译文，不要输出任何分析、解释或思考过程
- 完整保留所有 markdown 格式（标题、加粗、链接、引用、代码块等）
- 保持完全相同的结构：相同数量的标题、段落、标题层级
- 原文每个标题对应译文恰好一个标题，每个段落对应恰好一个段落
- 不要合并或拆分段落
- 不翻译：@用户名、URL、专有名词（人名、公司名、产品名）、代码块内容
- 保留数字和统计数据原样

## 待翻译内容

`;

/**
 * Strip image markdown lines and replace with placeholders.
 * Returns the cleaned text and a list of original image lines for restoration.
 */
export function stripImages(markdown: string): {
  text: string;
  images: Map<string, string>;
} {
  const images = new Map<string, string>();
  let counter = 0;

  const text = markdown.replace(/^!\[.*?\]\(.*?\)$/gm, (match) => {
    const placeholder = `<!--IMG_PLACEHOLDER_${counter}-->`;
    images.set(placeholder, match);
    counter++;
    return placeholder;
  });

  return { text, images };
}

/**
 * Restore image placeholders with original image markdown.
 */
export function restoreImages(
  translated: string,
  images: Map<string, string>
): string {
  let result = translated;
  for (const [placeholder, original] of images) {
    result = result.replace(placeholder, original);
  }
  return result;
}

/**
 * Split markdown into chunks by h2 headings for parallel translation.
 * Each chunk is a self-contained section.
 * Short documents (< threshold) are returned as a single chunk.
 */
export function splitIntoChunks(
  markdown: string,
  chunkThreshold = 5_000
): string[] {
  if (markdown.length < chunkThreshold) {
    return [markdown];
  }

  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    // Split on h2 headings (## ...)
    if (line.startsWith("## ") && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  return chunks;
}

/**
 * Translate a single chunk of markdown (non-streaming).
 * Used for parallel translation of multiple chunks.
 */
export async function translateChunk(markdown: string): Promise<string> {
  const response = await getAI().models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      thinkingConfig: { thinkingBudget: 8192 },
    },
    contents: [
      {
        role: "user",
        parts: [{ text: TRANSLATION_PROMPT + markdown }],
      },
    ],
  });

  return response.text ?? "";
}

/**
 * Stream-translate a short markdown string (single Gemini call).
 * Used for small documents that don't benefit from chunking.
 */
export async function* streamTranslateToChineseMarkdown(
  markdown: string
): AsyncGenerator<string> {
  const response = await getAI().models.generateContentStream({
    model: "gemini-2.5-flash",
    config: {
      thinkingConfig: { thinkingBudget: 8192 },
    },
    contents: [
      {
        role: "user",
        parts: [{ text: TRANSLATION_PROMPT + markdown }],
      },
    ],
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) {
      yield text;
    }
  }
}
