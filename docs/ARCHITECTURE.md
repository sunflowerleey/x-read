# Architecture

## Layered Domain Model

X-Read uses a 5-layer architecture. Each layer may only depend on layers below it.

```
┌─────────────────────────────────────────┐
│  Layer 5: UI                            │
│  page.tsx, ContentDisplay, hooks        │
├─────────────────────────────────────────┤
│  Layer 4: API Routes (orchestration)    │
│  fetch-tweet/route.ts, translate/route  │
├─────────────────────────────────────────┤
│  Layer 3: Transform                     │
│  markdown.ts, gemini.ts, splitMarkdown  │
│  alignBlocks.ts, escapeHtml.ts          │
├─────────────────────────────────────────┤
│  Layer 2: Data (fetching)               │
│  twitter.ts (URL parsing + API calls)   │
├─────────────────────────────────────────┤
│  Layer 1: Types + Config                │
│  types.ts                               │
└─────────────────────────────────────────┘
```

### Layer 1: Types + Config
**Files:** `src/lib/types.ts`
- Zero runtime dependencies. No imports from other project files.
- Only type definitions, interfaces, and constants.
- Future: `src/lib/config.ts` for env vars, timeout values, API URLs.

### Layer 2: Data (Fetching)
**Files:** `src/lib/twitter.ts`
- Network I/O: calling external APIs and returning parsed data.
- May import from Layer 1 only.
- Must NOT do UI-related transformation.
- Future: `src/lib/substack.ts`, `src/lib/medium.ts` for multi-platform.

### Layer 3: Transform
**Files:** `src/lib/gemini.ts`, `markdown.ts`, `splitMarkdown.ts`, `alignBlocks.ts`, `escapeHtml.ts`
- Pure functions where possible.
- `gemini.ts` is the exception (calls Gemini API), but its purpose is transformation (EN->ZH).
- May import from Layers 1-2.
- `twitter.ts` currently contains post-processing functions (`fixCodeBlocks`, `filterJunkLines`, etc.) that belong here. Planned extraction to `src/lib/cleanJinaMarkdown.ts`.

### Layer 4: API Routes
**Files:** `src/app/api/fetch-tweet/route.ts`, `src/app/api/translate/route.ts`
- Thin orchestration: validate input, call Layer 2+3, format HTTP response.
- No business logic in route handlers.

### Layer 5: UI
**Files:** `src/app/page.tsx`, `layout.tsx`, `globals.css`, `src/components/*`, `src/hooks/*`
- Client components marked `"use client"`.
- Call API routes only — never import Layer 2/3 directly from client code.
- Hooks encapsulate fetch + state logic.

## Data Flow

```
User pastes URL
  → page.tsx → useTweetFetcher
    → POST /api/fetch-tweet
      → parseTweetUrl() [L2]
      → fetchTweet() [L2]
      → if article: fetchArticleContent() [L2] + articleToMarkdown() [L3]
      → else: tweetToMarkdown() [L3]
      → return { tweet, markdown }
    → if English: POST /api/translate (SSE stream)
      → streamTranslateToChineseMarkdown() [L3]
    → ContentDisplay renders side-by-side
      → splitMarkdownIntoBlocks() [L3] + alignBlocks() [L3]
```

## Extension Points
- **Multi-platform:** New Data-layer modules per platform. API routes dispatch by URL pattern.
- **Local storage:** Storage layer alongside Data, or a database integration.
- **Auth:** Next.js middleware (`src/middleware.ts`) + session management.
