import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";

/**
 * Safety settings for academic translation.
 * We set all categories to BLOCK_NONE because research papers on AI safety
 * legitimately discuss adversarial examples, jailbreaks, blackmail scenarios,
 * reward hacking, etc. The default filter causes soft-refusals (truncated
 * or summarized output) on these sections, breaking bilingual alignment.
 */
const TRANSLATION_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

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

const TRANSLATION_PROMPT = `你是一位精通英汉双语的专业学术翻译，正在为一篇已发表的学术论文制作完整的中文译本。

## 重要背景

原文是学术研究论文（例如 AI 安全、可解释性研究），可能包含对不当行为的案例分析（如模型越狱、奖励欺骗、敲诈勒索、奉承等例子）。这些内容是研究对象，**不是需要规避的敏感内容**。作为学术译者，你必须完整、逐字地翻译所有正文，包括模型输出示例、对话记录、案例分析等，不得总结、跳过、删减或重写任何段落。忠实还原原文是学术翻译的基本准则。

## 翻译方法（在内部思考中完成，不要输出）

1. **略读抓取大意**：快速浏览全文，抓住核心主题和基调。
2. **分块与逻辑梳理**：理解每个段落的核心含义和逻辑关系。
3. **关键选词**：识别专业术语、习语，选择准确的中文对应。
4. **句法重构**：用符合中文表达习惯的方式重构复杂句，而非逐字硬译。

## 输出规则

- 只输出最终中文译文，不要输出任何分析、解释、思考过程或元评论
- **必须完整翻译每一段**，不得省略、总结、跳过，即使是对话示例或案例
- 完整保留所有 markdown 格式（标题、加粗、链接、引用、代码块等）
- **图片必须原样保留在原来的位置**：遇到 \`![...](...)\` 这样的图片行，整行复制到译文对应位置，不要修改 URL，不要翻译 alt 文本
- 保持完全相同的结构：相同数量的标题、段落、图片、标题层级
- 原文每个标题对应译文恰好一个标题，每个段落对应恰好一个段落
- 不要合并或拆分段落
- 不翻译：@用户名、URL、专有名词（人名、公司名、产品名）、代码块内容
- 保留数字和统计数据原样

## 待翻译内容

`;

/**
 * Max size for a single translation chunk (chars).
 *
 * Why 18_000? English-to-Chinese translation can produce more tokens
 * than the input because Chinese is tokenized at 1-2 chars per token
 * (vs English's ~4 chars/token). Worst case a 20KB English chunk can
 * generate 40K+ output tokens, approaching Gemini's 65K ceiling. We
 * leave generous headroom so chunks never truncate mid-translation
 * (truncation causes Gemini to hallucinate image markdown at cutoff).
 */
const MAX_CHUNK_SIZE = 18_000;
/** Target minimum chunk size — smaller chunks get merged with neighbors. */
const MIN_CHUNK_SIZE = 8_000;

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
  const midChunks: string[] = [];
  for (const chunk of coarseChunks) {
    if (chunk.length > MAX_CHUNK_SIZE) {
      midChunks.push(...splitByHeadingLevel(chunk, "### "));
    } else {
      midChunks.push(chunk);
    }
  }

  // Third pass: split any still-oversized chunks at paragraph boundaries.
  // Some sections (e.g. appendices with raw examples) have no subheadings
  // but are massive — splitting on blank lines is the last resort.
  const expanded: string[] = [];
  for (const chunk of midChunks) {
    if (chunk.length > MAX_CHUNK_SIZE) {
      expanded.push(...splitByParagraphs(chunk, MAX_CHUNK_SIZE));
    } else {
      expanded.push(chunk);
    }
  }

  // Fourth pass: merge small adjacent chunks (keeps count low for faster overall)
  return mergeSmallChunks(expanded);
}

/** Split text at paragraph boundaries into chunks <= maxSize. */
function splitByParagraphs(text: string, maxSize: number): string[] {
  const paras = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paras) {
    if (current.length === 0) {
      current = para;
    } else if (current.length + para.length + 2 <= maxSize) {
      current = current + "\n\n" + para;
    } else {
      chunks.push(current);
      current = para;
    }
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
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
 * Stricter retry prompt. Used when the first attempt produces
 * suspiciously short output (Gemini voluntarily summarized instead of
 * translating verbatim). finishReason is still STOP, so this isn't
 * safety/MAX_TOKENS — it's a prompt-following failure.
 */
const STRICT_TRANSLATION_PROMPT = `严格逐字翻译下方英文 markdown 为简体中文。

硬性要求（违反则视为失败）：
- 译文长度必须与原文相近（中文通常是英文字符数的 50%-70%）
- 每个段落、列表项、对话、代码都必须有对应译文，顺序一致
- 严禁总结、摘要、压缩、跳过任何内容
- 严禁输出"（以下内容略）"、"（省略）"、"..." 等省略标记
- 如果原文是对话或邮件示例，也必须完整翻译

格式保留：
- markdown 标记原样保留（# 标题、**加粗**、\`代码\`、![图片]() 等）
- URL、人名、公司名、产品名、@用户名、代码内容不翻译
- 数字、百分比、日期保留原样

只输出译文，不要输出解释或元评论。

## 原文

`;

async function callGemini(markdown: string, prompt: string) {
  const response = await getAI().models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      thinkingConfig: { thinkingBudget: 2048 },
      maxOutputTokens: 65_000,
      safetySettings: TRANSLATION_SAFETY_SETTINGS,
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt + markdown }],
      },
    ],
  });
  const text = response.text ?? "";
  const finishReason = response.candidates?.[0]?.finishReason;
  return { text, finishReason };
}

/**
 * Translate a single chunk of markdown (non-streaming).
 * Retries with a stricter prompt if the first attempt summarizes
 * instead of translating (output too short but finishReason=STOP).
 *
 * maxOutputTokens is critical: Gemini's default (8192) truncates long
 * translations silently. A 30KB English chunk needs ~15K output tokens
 * in Chinese. We set a generous limit to avoid mid-translation cutoff.
 */
export async function translateChunk(markdown: string): Promise<string> {
  const first = await callGemini(markdown, TRANSLATION_PROMPT);

  if (first.finishReason && first.finishReason !== "STOP") {
    console.warn(
      `[gemini-finish] ${JSON.stringify({
        finishReason: first.finishReason,
        inChars: markdown.length,
        outChars: first.text.length,
        firstLine: markdown.split("\n")[0].slice(0, 60),
      })}`
    );
  }

  // Retry with stricter prompt if the output is suspiciously short
  // but Gemini reported normal completion (voluntary summarization).
  const ratio = markdown.length > 0 ? first.text.length / markdown.length : 1;
  if (ratio < 0.4 && first.finishReason === "STOP" && markdown.length > 2000) {
    console.warn(
      `[retry] chunk ratio=${ratio.toFixed(2)}, retrying with strict prompt (firstLine="${markdown.split("\n")[0].slice(0, 60)}")`
    );
    const retry = await callGemini(markdown, STRICT_TRANSLATION_PROMPT);
    // Accept retry only if it's meaningfully longer
    if (retry.text.length > first.text.length * 1.3) {
      return retry.text;
    }
  }

  return first.text;
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
      maxOutputTokens: 65_000,
      safetySettings: TRANSLATION_SAFETY_SETTINGS,
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
