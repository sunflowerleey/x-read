"use client";

import { useState } from "react";
import { useTweetFetcher } from "@/hooks/useTweetFetcher";
import ContentDisplay from "@/components/ContentDisplay";

export default function Home() {
  const [url, setUrl] = useState("");
  const {
    fetchTweet,
    status,
    error,
    tweetData,
    originalMarkdown,
    translatedMarkdown,
  } = useTweetFetcher();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    fetchTweet(url.trim());
  }

  const isLoading = status === "fetching" || status === "translating";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">X-Read</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fetch tweets, convert to Markdown, auto-translate English to Chinese
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-3 mb-8">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a Twitter/X link here, e.g. https://x.com/user/status/123456"
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
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
        </form>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Tweet info */}
        {tweetData && (
          <div className="flex items-center gap-3 mb-6 p-4 bg-white rounded-lg border border-gray-200">
            {tweetData.authorAvatar && (
              <img
                src={tweetData.authorAvatar}
                alt={tweetData.authorName}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div>
              <p className="font-semibold text-gray-900">
                {tweetData.authorName}{" "}
                <span className="font-normal text-gray-500">
                  @{tweetData.authorHandle}
                </span>
              </p>
              <p className="text-xs text-gray-400">{tweetData.createdAt}</p>
            </div>
            {tweetData.language === "en" && status === "translating" && (
              <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                Translating...
              </span>
            )}
            {tweetData.language !== "en" && (
              <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                Language: {tweetData.language}
              </span>
            )}
          </div>
        )}

        {/* Content */}
        {originalMarkdown && (
          <ContentDisplay
            originalMarkdown={originalMarkdown}
            translatedMarkdown={translatedMarkdown}
            isTranslating={isLoading}
            tweetHandle={tweetData?.authorHandle || "unknown"}
          />
        )}
      </main>
    </div>
  );
}
