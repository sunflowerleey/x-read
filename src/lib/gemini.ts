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
- **图片必须原样保留在原来的位置**：遇到 \`![...](...)\` 这样的图片行，整行复制到译文对应位置，不要修改 URL，不要翻译 alt 文本
- 保持完全相同的结构：相同数量的标题、段落、图片、标题层级
- 原文每个标题对应译文恰好一个标题，每个段落对应恰好一个段落，每个图片对应恰好一个图片
- 不要合并或拆分段落
- 不翻译：@用户名、URL、专有名词（人名、公司名、产品名）、代码块内容
- 保留数字和统计数据原样

## 待翻译内容

`;

/** Max size for a single translation chunk (chars). */
const MAX_CHUNK_SIZE = 30_000;
/** Target minimum chunk size — smaller chunks get merged with neighbors. */
const MIN_CHUNK_SIZE = 10_000;

/**
 * Split markdown into chunks for parallel translation.
 * 1. Split by ## headings
 * 2. Further split oversized (>30KB) chunks by ### headings
 * 3. Merge small adjacent chunks (target 10-30KB each) to reduce API calls
 *
 * Short documents (< threshold) are returned as a single chunk.
 */
export function splitIntoChunks(
  markdown: string,
  chunkThreshold = 5_000
): string[] {
  if (markdown.length < chunkThreshold) {
    return [markdown];
  }

  // First pass: split by ## headings
  const coarseChunks = splitByHeadingLevel(markdown, "## ");

  // Second pass: split oversized chunks by ### headings
  const expanded: string[] = [];
  for (const chunk of coarseChunks) {
    if (chunk.length > MAX_CHUNK_SIZE) {
      expanded.push(...splitByHeadingLevel(chunk, "### "));
    } else {
      expanded.push(chunk);
    }
  }

  // Third pass: merge small adjacent chunks (keeps count low for faster overall)
  return mergeSmallChunks(expanded);
}

/**
 * Merge consecutive small chunks so each resulting chunk is ~MIN_CHUNK_SIZE
 * or larger (but not exceeding MAX_CHUNK_SIZE). Reduces total API calls.
 */
function mergeSmallChunks(chunks: string[]): string[] {
  const merged: string[] = [];
  let buffer = "";

  for (const chunk of chunks) {
    if (buffer.length === 0) {
      buffer = chunk;
    } else if (buffer.length + chunk.length + 2 <= MAX_CHUNK_SIZE) {
      // Fits — merge
      buffer = buffer + "\n\n" + chunk;
    } else {
      // Would exceed max — flush and start fresh
      merged.push(buffer);
      buffer = chunk;
    }

    // If buffer reaches target size, flush it
    if (buffer.length >= MIN_CHUNK_SIZE) {
      merged.push(buffer);
      buffer = "";
    }
  }

  if (buffer.length > 0) {
    merged.push(buffer);
  }

  return merged;
}

function splitByHeadingLevel(markdown: string, prefix: string): string[] {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith(prefix) && current.length > 0) {
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
 *
 * Uses a lower thinking budget than the single-shot path: each chunk is
 * smaller and more self-contained, so deep thinking per chunk is wasteful.
 *
 * maxOutputTokens is critical: Gemini's default (8192) truncates long
 * translations silently. A 30KB English chunk needs ~15K output tokens
 * in Chinese. We set a generous limit to avoid mid-translation cutoff.
 */
export async function translateChunk(markdown: string): Promise<string> {
  const response = await getAI().models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      thinkingConfig: { thinkingBudget: 2048 },
      maxOutputTokens: 32_000,
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
      maxOutputTokens: 32_000,
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
