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

const TRANSLATION_PROMPT = `严格逐字翻译下方英文 markdown 为简体中文。这是学术论文（AI 安全研究），包含对模型行为的案例分析（包括越狱、勒索、奖励欺骗、奉承等示例对话）——这些是研究对象，不是要规避的内容，必须完整翻译。

## 硬性要求

- **译文长度必须与原文相近**（中文通常是英文字符数的 50%-70%）
- 每个段落、列表项、对话、代码都必须有对应译文，顺序一致
- **严禁总结、摘要、压缩、跳过任何段落**，即使是对话示例、邮件、列表
- 严禁输出"（以下内容略）"、"（省略）"、"..." 等省略标记
- 如果原文是多轮对话或邮件示例，逐字翻译全部内容

## 格式保留

- markdown 标记原样保留（# 标题、**加粗**、\`代码\`、引用、列表）
- **图片行 \`![...](...)\` 整行原样复制到译文对应位置**，不要修改 URL，不要翻译 alt 文本，不要自己创造新图片
- **不要添加原文没有的标题**，标题数量必须与原文相同
- 不翻译：@用户名、URL、人名、公司名、产品名、代码内容
- 数字、百分比、日期保留原样

只输出中文译文，不要输出解释、思考过程或元评论。

## 原文

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

/**
 * Remove hallucinated images from translation.
 *
 * Gemini sometimes fabricates image markdown like `![](image.png)` with
 * URLs that don't exist in the source. This filter extracts the set of
 * valid URLs from the original and drops any translated image whose URL
 * isn't in that set.
 */
export function removeHallucinatedImages(
  translated: string,
  original: string
): string {
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const validUrls = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = imageRegex.exec(original)) !== null) {
    validUrls.add(m[1]);
  }

  if (validUrls.size === 0) {
    // No real images in original — remove ALL images from translation
    return translated.replace(/^!\[[^\]]*\]\([^)]+\)$/gm, "").replace(/\n\n\n+/g, "\n\n");
  }

  // Replace image lines whose URL isn't in the original
  return translated.replace(/^(!\[[^\]]*\]\(([^)]+)\))$/gm, (full, _img, url) => {
    return validUrls.has(url) ? full : "";
  }).replace(/\n\n\n+/g, "\n\n");
}

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
 * Split markdown around fenced code blocks into translate-able text
 * segments and pass-through code segments. Code blocks are displayed
 * verbatim without an API call — they're machine-readable content
 * (prompts, shell commands, code) that should not be translated and
 * often triggers Gemini's summarization heuristics.
 */
export function splitAroundCodeBlocks(
  markdown: string
): { type: "text" | "code"; content: string }[] {
  const segments: { type: "text" | "code"; content: string }[] = [];
  // Match fenced code blocks (``` with optional language tag, closing ```)
  const regex = /^```[^\n]*\n[\s\S]*?^```\s*$/gm;

  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    if (m.index > lastIdx) {
      segments.push({ type: "text", content: markdown.slice(lastIdx, m.index) });
    }
    segments.push({ type: "code", content: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < markdown.length) {
    segments.push({ type: "text", content: markdown.slice(lastIdx) });
  }

  return segments;
}

/**
 * Translate a single chunk of markdown (non-streaming).
 *
 * 1. Splits around fenced code blocks — code passes through untranslated
 *    (saves API calls and prevents Gemini from summarizing code)
 * 2. Translates each text segment, retrying with a stricter prompt if
 *    the first attempt summarizes (output too short, finishReason=STOP)
 * 3. Reassembles segments in original order
 *
 * maxOutputTokens is critical: Gemini's default (8192) truncates long
 * translations silently. A 30KB English chunk needs ~15K output tokens
 * in Chinese. We set a generous limit to avoid mid-translation cutoff.
 */
export async function translateChunk(markdown: string): Promise<string> {
  const segments = splitAroundCodeBlocks(markdown);

  // Fast path: if the chunk is entirely code, no translation needed
  if (segments.every((s) => s.type === "code")) {
    return markdown;
  }

  // Translate text segments in parallel (they're independent)
  const translatedSegments = await Promise.all(
    segments.map(async (seg) => {
      if (seg.type === "code") return seg.content;
      // Skip translation for very short text (usually just newlines between code blocks)
      if (seg.content.trim().length < 100) return seg.content;
      return translateTextSegment(seg.content);
    })
  );

  return translatedSegments.join("");
}

/** Translate a single text segment with retry-on-summarization. */
async function translateTextSegment(markdown: string): Promise<string> {
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
