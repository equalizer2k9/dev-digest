# client/ — @devdigest/web

Next.js studio: import repos, browse PRs, run + read AI reviews, author agents.

## Stack

Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl 3 · Tailwind 4 · recharts ·
mermaid · Zod 3 · Vitest 2 + Testing Library + jsdom · TS 5.7 · pnpm

## Commands

- `pnpm dev` (:3000, expects API on :3001) · `pnpm build` · `pnpm typecheck`
- `pnpm test` — vitest + jsdom, `fetch` mocked; needs no API and no browser

## Where things live

- `src/app/**/page.tsx` — routes; pages stay thin, logic in colocated `_components/<Name>/`
- `src/lib/hooks/*` — every data hook → `src/lib/api.ts` (base URL `NEXT_PUBLIC_API_BASE`)
- `src/components/` — cross-cutting: `app-shell` (nav, breadcrumbs, `g`-key shortcuts), `diff-viewer`, `showcase`
- `src/vendor/ui/` — design system (`@devdigest/ui`)
- `src/vendor/shared/` — Zod contracts (`@devdigest/shared`, client copy)
- `messages/en/<ns>.json` — UI strings, one namespace per feature

## Conventions (non-default)

- Import UI only from the `@devdigest/ui` barrel — never from a layer file inside `src/vendor/ui`
- New or changed UI component → add it to `src/components/showcase` (smoke test mounts the gallery)
- Colors only via CSS vars (`var(--accent)`, `var(--border)` …); theme switches on `data-theme`
- UI text via `useTranslations("<ns>")` / `getTranslations("<ns>")`; new feature = new
  `messages/en/<ns>.json`, auto-merged by `src/i18n/request.ts` — no registration needed
- Component test sits next to it: `_components/<Name>/<Name>.test.tsx`

## Gotchas

- `src/vendor/shared` is a COPY, already diverged from `server/src/vendor/shared`. Contract change → diff + update both.
- Single locale `en`, no locale routing — don't add a `[locale]` segment.

## Docs — read on trigger

- UI route map + which API each route calls → [README.md](README.md)
- Design system layers, tokens, theming → [src/vendor/ui/README.md](src/vendor/ui/README.md)
- Deep dives → [docs/](docs/README.md) · implementing a feature → its spec in [specs/](specs/README.md) first
- Before a non-trivial change → [INSIGHTS.md](INSIGHTS.md); new insight → `engineering-insights` skill
- Real browser journeys → [../e2e/CLAUDE.md](../e2e/CLAUDE.md) · test strategy → [../TESTING.md](../TESTING.md)
