import { GoogleGenAI } from "@google/genai";

function getAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenAI({ apiKey: key });
}

export async function* streamTranslateToChineseMarkdown(
  markdown: string
): AsyncGenerator<string> {
  const ai = getAI();
  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    config: {
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildTranslationPrompt(markdown) }],
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

function buildTranslationPrompt(markdown: string): string {
  return `You are a professional English-to-Chinese translator. Translate the following English markdown content to Simplified Chinese.

Rules:
- Preserve all markdown formatting exactly (headings, bold, links, images, blockquotes, code blocks, etc.)
- Preserve the EXACT SAME structure: same number of headings, same number of paragraphs, same heading levels
- Each heading in the original must correspond to exactly one heading in the translation
- Each paragraph in the original must correspond to exactly one paragraph in the translation
- Do NOT merge or split paragraphs
- Do NOT translate: @handles, URLs, proper nouns (people's names, company names, product names), code content inside code blocks
- Keep numbers and statistics as-is
- Keep image markdown as-is (do not modify ![...](...) syntax)
- Translate naturally, not word-by-word
- Return ONLY the translated markdown, no explanations

Content to translate:

${markdown}`;
}
