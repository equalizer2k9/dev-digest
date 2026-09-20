# server/ — @devdigest/api

Fastify API: imports repos + PRs, indexes repos (repo-intel), stores agents, runs reviews
through `reviewer-core`.

## Stack

Fastify 5 · Drizzle ORM 0.38 · postgres.js · pgvector · Zod 3 + fastify-type-provider-zod ·
Vitest 2 · testcontainers · TS 5.7 (ESM) · pnpm

## Commands

- `pnpm dev` (:3001) · `pnpm typecheck` · `pnpm build`
- `pnpm db:migrate` · `pnpm db:seed` (idempotent) · `pnpm db:generate` (after schema change)
- Unit, no Docker: `pnpm exec vitest run --exclude '**/*.it.test.ts'`
- Integration, needs Docker: `pnpm exec vitest run .it.test` · both: `pnpm test`

## Where things live

- `src/modules/<name>/` — feature plugin (`routes.ts` + service)
- `src/adapters/` — ports: llm, github, git, astgrep, tokenizer, secrets · mocks: `src/adapters/mocks.ts`
- `src/platform/` — `config.ts`, DI `container.ts`
- `src/db/` — `schema.ts`, `migrations/`, `seed.ts`
- `src/vendor/shared/` — Zod contracts (`@devdigest/shared`)
- `test/helpers/pg.ts` — testcontainers Postgres for integration tests

## Conventions (non-default)

- New module = one import + one `app.register` in `src/modules/index.ts` (NO autoload)
- Validate via route zod `params`/`body` schemas; never `Schema.parse(req.body)` in a handler
- Test importing `test/helpers/pg.ts` MUST be named `*.it.test.ts` (keeps unit/integration split)
- Outside world only through DI adapters; tests use mocks — no real keys, no network
- Secrets only via `LocalSecretsProvider` (`src/adapters/secrets/local.ts`) — never AppConfig, DB or git

## Gotchas

- Migrations are NOT applied on boot: `relation … does not exist` → `pnpm db:migrate`
- Schema already holds tables for every course lesson; unused ones stay empty by design — don't drop
- Unindexed repo → review silently degrades to diff-only (no repo map)

## Do not touch

- `src/db/migrations/**` incl. `meta/_journal.json` — change only via `pnpm db:generate`, never hand-edit

## Docs — read on trigger

- API map, request/DI flow, env vars, review context → [README.md](README.md)
- repo-intel pipeline + `repoIntel.*` facade → [src/modules/repo-intel/README.md](src/modules/repo-intel/README.md)
- Deep dives → [docs/](docs/README.md) · implementing a feature → its spec in [specs/](specs/README.md) first
- Before a non-trivial change → [INSIGHTS.md](INSIGHTS.md); new insight → `engineering-insights` skill
- Prompt / grounding logic → [../reviewer-core/CLAUDE.md](../reviewer-core/CLAUDE.md) · test strategy → [../TESTING.md](../TESTING.md)
