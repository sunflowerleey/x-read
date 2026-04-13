import { NextRequest } from "next/server";
import { streamTranslateToChineseMarkdown } from "@/lib/gemini";

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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamTranslateToChineseMarkdown(
            markdown
          )) {
            // SSE format
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          const message =
            e instanceof Error ? e.message : "Translation failed";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: message })}\n\n`
            )
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Translation failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
