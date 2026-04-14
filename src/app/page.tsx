"use client";

import { useCallback, useEffect, useState } from "react";
import { useContentFetcher } from "@/hooks/useTweetFetcher";
import { useTheme } from "@/hooks/useTheme";
import ContentDisplay from "@/components/ContentDisplay";
import ThemeToggle from "@/components/ThemeToggle";

const TRANSLATE_PREF_KEY = "x-read:translate";

/**
 * Persist translate-on toggle to localStorage across reloads.
 *
 * Always renders the default (true) on both server and initial client
 * render to avoid hydration mismatch. After mount, reads localStorage
 * and updates state. The visual flicker is acceptable: the checkbox is
 * in a fold-above-the-fetch area that the user is unlikely to be looking
 * at until they click Fetch.
 */
function useTranslatePref(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(TRANSLATE_PREF_KEY);
    if (stored !== null && (stored === "true") !== enabled) {
      // Standard pattern for hydrating from localStorage: render the
      // server-safe default first, then sync once on mount. The lint
      // rule allows conditional setState based on external (localStorage) state.
      setEnabled(stored === "true");
    }
    // Intentionally only run on mount — no dependency on `enabled`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback((next: boolean) => {
    setEnabled(next);
    localStorage.setItem(TRANSLATE_PREF_KEY, String(next));
  }, []);

  return [enabled, set];
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [translateEnabled, setTranslateEnabled] = useTranslatePref();
  const { theme, toggleTheme } = useTheme();
  const {
    fetchContent,
    status,
    error,
    contentData,
    originalMarkdown,
    translatedMarkdown,
  } = useContentFetcher();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    fetchContent(url.trim(), translateEnabled);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">X-Read</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Fetch articles, convert to Markdown, auto-translate English to Chinese
            </p>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste any URL — Twitter, blog posts, articles, etc."
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 dark:text-gray-200 dark:placeholder-gray-500"
              disabled={status === "fetching"}
            />
            <button
              type="submit"
              disabled={!url.trim() || status === "fetching"}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {status === "fetching" ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Fetching...
                </span>
              ) : (
                "Fetch"
              )}
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={translateEnabled}
              onChange={(e) => setTranslateEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              翻译为中文
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              (Translate English content to Chinese)
            </span>
          </label>
        </form>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {contentData && (
          <div className="flex items-center gap-3 mb-6 p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            {contentData.authorAvatar && (
              <img
                src={contentData.authorAvatar}
                alt={contentData.authorName}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 dark:text-white truncate">
                {contentData.title}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {contentData.authorName}
                {contentData.source === "twitter" && ` @${contentData.authorHandle}`}
                {contentData.createdAt && ` · ${contentData.createdAt}`}
              </p>
            </div>
            {contentData.language === "en" && status === "translating" && (
              <span className="ml-auto text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full shrink-0">
                Translating...
              </span>
            )}
            {contentData.language !== "en" && (
              <span className="ml-auto text-xs text-gray-500 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-full shrink-0">
                {contentData.language}
              </span>
            )}
          </div>
        )}

        {originalMarkdown && (
          <ContentDisplay
            originalMarkdown={originalMarkdown}
            translatedMarkdown={translatedMarkdown}
            isTranslating={status === "translating"}
            tweetHandle={contentData?.authorHandle || "unknown"}
          />
        )}
      </main>
    </div>
  );
}
