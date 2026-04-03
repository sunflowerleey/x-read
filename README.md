# X-Read

Fetch Twitter/X articles, convert to Markdown, auto-translate English to Chinese with side-by-side display.

## Features

- **Tweet & Article Fetching** — Paste any `x.com` or `twitter.com` link (both `/status/` and `/article/` formats)
- **Markdown Conversion** — Clean markdown output with post-processing for Jina Reader quirks
- **Streaming Translation** — English content auto-translated to Chinese via Gemini 2.5 Flash (SSE streaming)
- **Side-by-Side Display** — Bilingual content aligned paragraph-by-paragraph using heading anchors
- **Dark Mode** — Toggle between light/dark themes, persisted to localStorage
- **Download** — Export as `.md` files (English and Chinese separately)

## Tech Stack

- **Framework:** Next.js 16 + React 19 + TypeScript
- **Styling:** Tailwind CSS 4 + @tailwindcss/typography
- **Translation:** Google Gemini 2.5 Flash (streaming, thinking disabled for low latency)
- **Content Fetching:** FxTwitter API (metadata) + Jina Reader (article body)
- **Testing:** Vitest (unit) + Playwright (E2E)
- **CI:** GitHub Actions (lint + typecheck + layer guard + unit test + E2E)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local and add your Gemini API key

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for translation) | [Google AI Studio](https://aistudio.google.com/apikey) API key |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Run unit tests (Vitest, 56 cases) |
| `npm run test:e2e` | Run E2E tests (Playwright, 6 cases) |
| `npm run check-layers` | Architecture layer dependency check |
| `npm run quality` | Regenerate quality report from code metrics |

## Architecture

5-layer domain model. Each layer may only import from layers below it.

```
Types → Data → Transform → API Routes → UI
```

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Types** | `src/lib/types.ts` | Shared interfaces |
| **Data** | `src/lib/twitter.ts` | FxTwitter + Jina Reader API calls |
| **Transform** | `src/lib/{markdown,gemini,splitMarkdown,alignBlocks,escapeHtml,cleanJinaMarkdown}.ts` | Content transformation, translation, alignment |
| **API** | `src/app/api/{fetch-tweet,translate}/route.ts` | HTTP orchestration |
| **UI** | `src/app/`, `src/components/`, `src/hooks/` | React client components |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires Playwright browser)
npx playwright install chromium
npm run test:e2e

# All checks (same as CI)
npm run lint && npm run typecheck && npm run check-layers && npm test && npm run test:e2e
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── fetch-tweet/route.ts   # Tweet/article fetching endpoint
│   │   └── translate/route.ts     # SSE streaming translation endpoint
│   ├── page.tsx                   # Home page
│   ├── layout.tsx                 # Root layout
│   └── globals.css                # Tailwind + dark mode + prose overrides
├── components/
│   ├── ContentDisplay.tsx         # Side-by-side bilingual display
│   ├── DownloadButton.tsx         # Markdown file download
│   └── ThemeToggle.tsx            # Dark/light mode switch
├── hooks/
│   ├── useTweetFetcher.ts         # Fetch + SSE translate orchestration
│   └── useTheme.ts                # Dark mode state management
└── lib/
    ├── types.ts                   # TweetData interface
    ├── twitter.ts                 # URL parsing + API fetching
    ├── cleanJinaMarkdown.ts       # Jina Reader output post-processing
    ├── markdown.ts                # Tweet/article → markdown conversion
    ├── gemini.ts                  # Gemini streaming translation
    ├── splitMarkdown.ts           # Block splitting for alignment
    ├── alignBlocks.ts             # Heading-anchored bilingual alignment
    └── escapeHtml.ts              # Non-standard HTML tag escaping
```

## License

MIT
