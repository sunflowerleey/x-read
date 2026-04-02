# Coding Conventions

Rules marked [enforced] are checked by tools. Rules marked [soft] are conventions to follow.

## TypeScript

| Rule | Status |
|------|--------|
| `strict: true` | [enforced] tsconfig.json |
| No `any` — use `unknown` | [enforced] `@typescript-eslint/no-explicit-any` |
| No unused variables | [enforced] `@typescript-eslint/no-unused-vars` |
| No non-null assertions (`!`) — prefer type narrowing | [soft] |

## Imports
- Use `@/*` path alias (never relative `../../`)
- Named exports preferred (exception: Next.js page/layout use default)
- Layer dependency: Types -> Data -> Transform -> API -> UI. Never upward.

## API Routes
- Validate request body at top of handler
- Return `NextResponse.json()` with explicit status codes
- Wrap handler body in try/catch, return 500 on unknown errors
- Streaming responses use SSE format (`data: ...\n\n`)

## React / UI
- Client components: `"use client"` directive at top
- No direct external API calls from client components — use API routes
- Memoize expensive computations with `useMemo`
- Wrap stable components with `React.memo` when parent re-renders frequently

## File Naming
- React components: PascalCase (`ContentDisplay.tsx`)
- Lib modules: camelCase (`splitMarkdown.ts`)
- Hooks: `use` prefix (`useTweetFetcher.ts`)
- Tests: co-located `*.test.ts` next to source file

## Testing
- Pure lib functions must have unit tests
- Test file co-located: `foo.test.ts` next to `foo.ts`
- Run with `npm test`

## Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- CI must pass before merge to main
