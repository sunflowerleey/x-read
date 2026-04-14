import { NextRequest } from "next/server";
import {
  streamTranslateToChineseMarkdown,
  translateChunk,
  splitIntoChunks,
} from "@/lib/gemini";

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

    // Split into chunks for parallel translation
    // Images stay inside the markdown — Gemini preserves them in place,
    // which is far more reliable than trying to reinsert them after.
    const chunks = splitIntoChunks(markdown);

    const encoder = new TextEncoder();

    // Short content: stream directly for better UX (shows characters as they arrive)
    if (chunks.length <= 1) {
      return streamResponse(encoder, markdown);
    }

    // Long content: translate chunks in parallel, emit when all done
    return parallelResponse(encoder, chunks);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Translation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

/** Stream a single translation call (for short content). */
function streamResponse(encoder: TextEncoder, markdown: string) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamTranslateToChineseMarkdown(markdown)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
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

  return new Response(stream, { headers: SSE_HEADERS });
}

/** Translate chunks in parallel (with concurrency limit), emit SSE in order. */
function parallelResponse(encoder: TextEncoder, chunks: string[]) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Translate with bounded concurrency to balance throughput vs rate limits
        const settled = await translateWithConcurrency(chunks, 8);

        const results = settled.map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : `[翻译失败: ${chunks[i].slice(0, 50)}...]`
        );

        const full = results.join("\n\n");
        // Use fullText so client replaces (not appends) — parallel path emits
        // the complete translation in one shot, not incremental chunks
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ fullText: full })}\n\n`)
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

  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * Translate chunks with limited concurrency.
 * Runs at most `limit` workers in parallel to avoid Gemini rate limits.
 */
async function translateWithConcurrency(
  chunks: string[],
  limit: number
): Promise<PromiseSettledResult<string>[]> {
  const results: PromiseSettledResult<string>[] = new Array(chunks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < chunks.length) {
      const i = nextIndex++;
      try {
        const value = await translateChunk(chunks[i]);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, chunks.length) }, () => worker())
  );

  return results;
}
