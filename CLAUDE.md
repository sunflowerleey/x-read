@AGENTS.md

# X-Read — Agent Guide

## What This Is
Tweet/article reader: fetch from Twitter/X, convert to markdown, translate EN->ZH via Gemini.
Stack: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4.

## Quick Commands
- `npm run dev` — dev server (port 3000)
- `npm run build` — production build (catches type errors)
- `npm run lint` — ESLint
- `npm test` — Vitest unit tests
- `npm run typecheck` — tsc --noEmit
- `npm run check-layers` — architecture layer violation check
- `npm run quality` — regenerate docs/QUALITY.md from code metrics

## Automated Feedback Loops (Hooks)
- **PostToolUse (Edit/Write):** lint + typecheck on `.ts`/`.tsx`; tests on `.test.ts`
- **Stop:** auto-regenerate `docs/QUALITY.md` when session ends
- **PreCompact:** inject architecture + workflow context so it survives context compression
- **Runtime invariants:** `src/lib/translationMetrics.ts` compares pre/post translation heading/image/block counts on every request. Violations log as `[translation-invariant]` for grep. See `POST /api/translate`.
- CI: lint → typecheck → layer guard → quality gate → quality freshness → unit tests + E2E
- Quality gate: all lib modules must have tests (C/D grade blocks merge)

## Architecture (5 layers, bottom-up)
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

| Layer     | Key files                          | Rule                              |
|-----------|------------------------------------|-----------------------------------|
| Types     | `src/lib/types.ts`                 | No runtime deps, no imports       |
| Data      | `src/lib/twitter.ts`               | Fetch only, no formatting         |
| Transform | `src/lib/{markdown,gemini,splitMarkdown,alignBlocks,escapeHtml}.ts` | Pure where possible, no fetch |
| API       | `src/app/api/*/route.ts`           | Thin orchestration only           |
| UI        | `src/app/`, `src/components/`, `src/hooks/` | Client components, call API routes only |

**Dependency rule:** Each layer may only import from layers below it. Never sideways or upward.

## File Layout
```
src/
├── lib/           # Types, data fetching, transform logic
├── app/
│   ├── api/       # fetch-tweet, translate routes
│   ├── page.tsx   # Home page
│   └── layout.tsx # Root layout
├── components/    # ContentDisplay, DownloadButton
└── hooks/         # useTweetFetcher
```

## Conventions
See [docs/CONVENTIONS.md](docs/CONVENTIONS.md). Key enforced rules:
- `strict: true` in tsconfig
- No `any` — use `unknown`
- No unused variables
- Pure lib functions must have tests (`*.test.ts` co-located)

## Quality Status
See [docs/QUALITY.md](docs/QUALITY.md) for per-module grades and test coverage.

## Environment
- `GEMINI_API_KEY` in `.env.local` — required for translation
- External APIs: `api.fxtwitter.com` (tweets), `r.jina.ai` (article scraping)

## Key Decisions
1. FxTwitter + Jina dual-source — metadata vs body. See `src/lib/twitter.ts`
2. Heading-anchored alignment — limits error propagation. See `src/lib/alignBlocks.ts`
3. Gemini `thinkingBudget: 8192` + "英语思维" prompt — deep comprehension before translation. See `src/lib/gemini.ts`
4. Markdown post-processing pipeline — 5-stage Jina cleanup. See `fetchArticleContent()` in `src/lib/twitter.ts`

## Workflow Preferences
- After completing work: commit → push to feature branch → create PR → wait for CI → merge → pull main. Do all steps automatically without asking.
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- Branch naming: `feat/xxx`, `fix/xxx`, `test/xxx`, `refactor/xxx`
- Main branch is protected: always go through PR

## When Adding Features
- New platform (e.g., Substack): add `src/lib/substack.ts` in Data layer
- New transform: add in `src/lib/`, import only from Types/Data layers
- New page: add in `src/app/`, use hooks to call API routes
- Always add unit tests for pure functions
- Add E2E tests for UI interactions and cross-layer behaviors
- Run `npm run quality` to update quality report after adding tests
