"use client";

import { useState, type RefObject } from "react";
import { toPng } from "html-to-image";

interface Props {
  target: RefObject<HTMLElement | null>;
  filename: string;
  label?: string;
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
    try {
      const isDark = document.documentElement.classList.contains("dark");
      const backgroundColor = isDark ? "#1e293b" : "#ffffff";
      const dataUrl = await toPng(node, {
        backgroundColor,
        pixelRatio: 2,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = filename;
      a.click();
    } catch (err) {
      console.error("Failed to export image", err);
      alert(
        "导出图片失败，部分跨域图片可能无法渲染。详细信息请查看控制台。",
      );
    } finally {
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
