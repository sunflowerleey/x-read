import { NextRequest } from "next/server";
import {
  streamTranslateToChineseMarkdown,
  translateChunk,
  stripImages,
  restoreImages,
  splitIntoChunks,
} from "@/lib/gemini";

type ImageEntry = { lineIndex: number; image: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const markdown = body?.markdown;
    if (!markdown || typeof markdown !== "string") {
      return new Response(
        JSON.stringify({ error: "Markdown content is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Payload size limit: reject content > 500KB
    // Gemini 2.5 Flash supports 1M tokens (~750KB text), but leave headroom
    // for the system prompt and thinking budget
    if (markdown.length > 500_000) {
      return new Response(
        JSON.stringify({ error: "Content too large (max 500KB)" }),
        { status: 413, headers: { "Content-Type": "application/json" } }
      );
    }

    // Strip images — they don't need translation and waste tokens
    const { text: textOnly, images } = stripImages(markdown);

    // Split into chunks for parallel translation
    const chunks = splitIntoChunks(textOnly);

    const encoder = new TextEncoder();

    // Short content: stream directly for better UX (shows characters as they arrive)
    if (chunks.length <= 1) {
      return streamResponse(encoder, textOnly, images);
    }

    // Long content: translate chunks in parallel, emit in order
    return parallelResponse(encoder, chunks, images);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Translation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/** Stream a single translation call (for short content). */
function streamResponse(
  encoder: TextEncoder,
  markdown: string,
  images: ImageEntry[]
) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const parts: string[] = [];
        for await (const chunk of streamTranslateToChineseMarkdown(markdown)) {
          parts.push(chunk);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          );
        }
        // After streaming completes, send the full text with images restored
        if (images.length > 0) {
          const full = restoreImages(parts.join(""), images);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ fullText: full })}\n\n`
            )
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Translation failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Translate chunks in parallel, emit SSE events in order. */
function parallelResponse(
  encoder: TextEncoder,
  chunks: string[],
  images: ImageEntry[]
) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Fire all translations in parallel
        const promises = chunks.map((chunk) => translateChunk(chunk));
        const results = await Promise.all(promises);

        // Emit full result with images restored
        const full = restoreImages(results.join("\n\n"), images);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: full })}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Translation failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
