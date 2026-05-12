"use client";

import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";

interface Props {
  target: RefObject<HTMLElement | null>;
  filename: string;
  label?: string;
}

const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Replace <img> srcs that point to a different origin (Twitter CDN, etc.)
 *  with a same-origin proxy URL so html-to-image's fetch() can read them
 *  without hitting CORS. Returns a restore() function that puts the original
 *  src values back, so the on-screen UI stays unchanged after export. */
async function reroute(node: HTMLElement): Promise<() => void> {
  const sameOrigin = window.location.origin;
  const swaps: { img: HTMLImageElement; original: string }[] = [];

  for (const img of Array.from(node.querySelectorAll("img"))) {
    const src = img.src;
    if (!src || src.startsWith("data:")) continue;
    let urlOrigin: string;
    try {
      urlOrigin = new URL(src).origin;
    } catch {
      continue;
    }
    if (urlOrigin === sameOrigin) continue;
    swaps.push({ img, original: src });
    img.src = `/api/image-proxy?url=${encodeURIComponent(src)}`;
  }

  await Promise.all(
    swaps.map(({ img }) =>
      img.decode().catch(() => {
        /* swallow — imagePlaceholder will cover failures */
      }),
    ),
  );

  return () => {
    for (const { img, original } of swaps) {
      img.src = original;
    }
  };
}

export default function ExportImageButton({
  target,
  filename,
  label = "Save as PNG",
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    const node = target.current;
    if (!node || busy) return;
    setBusy(true);
    let restore: (() => void) | null = null;
    try {
      restore = await reroute(node);

      const isDark = document.documentElement.classList.contains("dark");
      const backgroundColor = isDark ? "#1e293b" : "#ffffff";
      const dataUrl = await toPng(node, {
        backgroundColor,
        pixelRatio: 2,
        cacheBust: false,
        imagePlaceholder: TRANSPARENT_PNG,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
    } catch (err) {
      const message =
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : typeof err === "string"
            ? err
            : "unknown error";
      console.error("Failed to export image:", message, err);
      alert(`导出图片失败：${message}`);
    } finally {
      restore?.();
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-md transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
    >
      {busy ? (
        <span className="w-4 h-4 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      )}
      {busy ? "Exporting..." : label}
    </button>
  );
}
