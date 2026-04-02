# Quality Status

Last updated: 2026-04-02

## Grading: A (tested+clean) / B (partial) / C (no tests, clean code) / D (no tests + issues)

| File | Lines | Grade | Tests | Notes |
|------|-------|-------|-------|-------|
| `src/lib/types.ts` | 21 | **B** | n/a | Types only, no tests needed |
| `src/lib/twitter.ts` | 307 | **D** | 0 | Mixed concerns: post-processing fns belong in Transform layer |
| `src/lib/gemini.ts` | 58 | **C** | 0 | Clean. Needs integration test with mock |
| `src/lib/markdown.ts` | 83 | **C** | 0 | Pure functions, easily testable |
| `src/lib/splitMarkdown.ts` | 104 | **C** | 0 | Complex state machine, high-priority test target |
| `src/lib/alignBlocks.ts` | 49 | **C** | 0 | Pure function, high-priority test target |
| `src/lib/escapeHtml.ts` | 26 | **C** | 0 | Edge cases around code blocks |
| `src/app/api/fetch-tweet/route.ts` | 61 | **C** | 0 | Duplicated language detection logic |
| `src/app/api/translate/route.ts` | 64 | **C** | 0 | Clean SSE streaming |
| `src/app/page.tsx` | 109 | **C** | 0 | Clean component |
| `src/components/ContentDisplay.tsx` | 133 | **C** | 0 | Well-structured with memo |
| `src/components/DownloadButton.tsx` | 45 | **B** | 0 | Simple, single responsibility |
| `src/hooks/useTweetFetcher.ts` | 120 | **C** | 0 | Complex SSE parsing |

## Overall
- Test coverage: **0%**
- CI pipeline: **Yes** (lint + typecheck + test)

## Priority Test Targets
1. `splitMarkdown.ts` — complex state machine for block splitting
2. `alignBlocks.ts` — critical for bilingual display correctness
3. `twitter.ts` — `parseTweetUrl()` is pure, post-processing fns are pure
4. `escapeHtml.ts` — edge cases with code blocks containing angle brackets
5. `markdown.ts` — `tweetToMarkdown()` and `articleToMarkdown()` are pure

## Refactoring Priorities
1. Extract post-processing from `twitter.ts` -> `src/lib/cleanJinaMarkdown.ts`
2. Extract duplicated language detection -> `src/lib/detectLanguage.ts`
