# DevDigest

Local-first AI pull-request review. Four standalone packages — **no workspace**: each has its
own `package.json` + lockfile; cross-package code is shared via tsconfig path aliases.

## Packages — read `<pkg>/CLAUDE.md` before working in a package

| Folder | What | PM | Port |
|---|---|---|---|
| [server/](server/CLAUDE.md) | Fastify 5 API + Drizzle 0.38 / Postgres 16 (pgvector) | pnpm | 3001 |
| [client/](client/CLAUDE.md) | Next.js 15 / React 19 studio | pnpm | 3000 |
| [reviewer-core/](reviewer-core/CLAUDE.md) | Pure review engine: diff → prompt → LLM → grounded findings | npm | — |
| [e2e/](e2e/CLAUDE.md) | Deterministic browser flows (agent-browser) | npm | — |

Every package has: `README.md` (humans) · `docs/` (deep dives) · `specs/` (feature specs) ·
`INSIGHTS.md` (insight log, append-only). In `e2e/`, `specs/` holds the flow JSON instead.

## Commands

- Full stack from zero: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- Hermetic browser e2e: `./scripts/e2e.sh`
- Prereqs: Node ≥22 · pnpm ≥10 · Docker (only Postgres runs in Docker; API + web run on host)

## Docs — read on trigger, never preload

- Product overview, architecture diagram, course lessons L01–L08 → [README.md](README.md)
- Test strategy, suite map, CI workflows + path filters → [TESTING.md](TESTING.md)
- Writing or changing a reviewer agent prompt → [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
- New feature → write its spec first: `/spec <package> <name>`
- Non-obvious finding (root cause, dead end, lib quirk, decision) → `engineering-insights` skill
  appends it to `<package>/INSIGHTS.md`; infra / cross-package → root [INSIGHTS.md](INSIGHTS.md)

## Cross-package gotchas

- `@devdigest/shared` exists as TWO copies, already diverged (5 files): `server/src/vendor/shared`
  (used by server + reviewer-core) and `client/src/vendor/shared`. Contract change → update both.
- Server imports reviewer-core as RAW source → without `reviewer-core/node_modules` the API
  crashes with `ERR_MODULE_NOT_FOUND`.
- CI is path-filtered per package; `reviewer-core/**` also triggers `server-unit`.

## Do not touch

- `docker compose down -v` — deletes the `devdigest_pgdata` volume (every imported repo + review).
- `server/clones/` — runtime checkouts, git-ignored.
- CLAUDE.md budget: root + one package ≤ 100 lines. Per line: "remove it — would Claude err?" No → cut.
