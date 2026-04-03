"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import DownloadButton from "./DownloadButton";
import { splitMarkdownIntoBlocks } from "@/lib/splitMarkdown";
import { alignBlocks } from "@/lib/alignBlocks";
import { escapeNonHtmlTags } from "@/lib/escapeHtml";
import { memo, useMemo } from "react";

const REMARK_PLUGINS = [remarkGfm];

interface Props {
  originalMarkdown: string;
  translatedMarkdown: string | null;
  isTranslating: boolean;
  tweetHandle: string;
}

const MarkdownBlock = memo(function MarkdownBlock({
  markdown,
}: {
  markdown: string;
}) {
  const safe = escapeNonHtmlTags(markdown);
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-img:rounded-lg prose-pre:bg-slate-800">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{safe}</ReactMarkdown>
    </article>
  );
});

function Spinner({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <div
      className={`${className} border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin`}
    />
  );
}

export default function ContentDisplay({
  originalMarkdown,
  translatedMarkdown,
  isTranslating,
  tweetHandle,
}: Props) {
  const hasContent =
    translatedMarkdown !== null && translatedMarkdown.length > 0;
  const isSideBySide = hasContent || isTranslating;

  const alignedPairs = useMemo(() => {
    const enBlocks = splitMarkdownIntoBlocks(originalMarkdown);
    const zhBlocks = translatedMarkdown
      ? splitMarkdownIntoBlocks(translatedMarkdown)
      : [];
    return alignBlocks(enBlocks, zhBlocks);
  }, [originalMarkdown, translatedMarkdown]);

  if (!isSideBySide) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            English Original
          </h2>
          <DownloadButton
            markdown={originalMarkdown}
            filename={`tweet-${tweetHandle}-en.md`}
          />
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6">
          <MarkdownBlock markdown={originalMarkdown} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            English Original
          </h2>
          <DownloadButton
            markdown={originalMarkdown}
            filename={`tweet-${tweetHandle}-en.md`}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              中文翻译
            </h2>
            {isTranslating && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                <Spinner className="w-3 h-3 border-blue-300 dark:border-blue-700 border-t-blue-600 dark:border-t-blue-400" />
                翻译中...
              </div>
            )}
          </div>
          {hasContent && !isTranslating && (
            <DownloadButton
              markdown={translatedMarkdown!}
              filename={`tweet-${tweetHandle}-zh.md`}
              label="Download 中文 .md"
            />
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        {alignedPairs.map(([enBlock, zhBlock], i) => (
          <div
            key={i}
            className={`grid grid-cols-1 md:grid-cols-2 ${i > 0 ? "border-t border-gray-50 dark:border-slate-700/50" : ""}`}
          >
            <div className="px-6 py-2 md:border-r border-gray-100 dark:border-slate-700/50">
              {enBlock && <MarkdownBlock markdown={enBlock} />}
            </div>
            <div className="px-6 py-2">
              {zhBlock ? (
                <MarkdownBlock markdown={zhBlock} />
              ) : (
                isTranslating &&
                enBlock && (
                  <div className="flex items-center gap-2 py-2 text-gray-400 dark:text-gray-600 text-sm">
                    <Spinner />
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
