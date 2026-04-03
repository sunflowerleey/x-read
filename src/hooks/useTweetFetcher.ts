"use client";

import { useState, useRef, useCallback } from "react";
import { ContentData } from "@/lib/types";

type Status = "idle" | "fetching" | "translating" | "done" | "error";

export function useContentFetcher() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [contentData, setContentData] = useState<ContentData | null>(null);
  const [originalMarkdown, setOriginalMarkdown] = useState<string | null>(null);
  const [translatedMarkdown, setTranslatedMarkdown] = useState<string | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);

  const fetchContent = useCallback(async (url: string) => {
    abortRef.current?.abort();

    setStatus("fetching");
    setError(null);
    setContentData(null);
    setOriginalMarkdown(null);
    setTranslatedMarkdown(null);

    try {
      const res = await fetch("/api/fetch-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch content");

      setContentData(data.content);
      setOriginalMarkdown(data.markdown);

      // Auto-translate if English
      if (data.content.language === "en") {
        setStatus("translating");
        setTranslatedMarkdown("");

        const abortController = new AbortController();
        abortRef.current = abortController;

        try {
          const transRes = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdown: data.markdown }),
            signal: abortController.signal,
          });

          if (!transRes.ok || !transRes.body) {
            throw new Error("Translation request failed");
          }

          const reader = transRes.body.getReader();
          const decoder = new TextDecoder();
          let accumulated = "";
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const payload = line.slice(6);
                if (payload === "[DONE]") continue;
                let parsed;
                try {
                  parsed = JSON.parse(payload);
                } catch {
                  continue;
                }
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (parsed.text) {
                  accumulated += parsed.text;
                  setTranslatedMarkdown(accumulated);
                }
              }
            }
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            return;
          }
        }
      }

      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  }, []);

  return {
    fetchContent,
    status,
    error,
    contentData,
    originalMarkdown,
    translatedMarkdown,
  };
}
