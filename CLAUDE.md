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
- Checks, run inside the package: `typecheck` (every package) · `test` — `pnpm` in server + client,
  `npm` in reviewer-core + e2e. There is NO linter in this repo; typecheck + tests are the gate.
- DB: `pnpm db:generate` (new migration) · `db:migrate` · `db:seed`, all in `server/`
- Prereqs: Node ≥22 · pnpm ≥10 · Docker (only Postgres runs in Docker; API + web run on host)

## Naming

| What | Rule | Example |
|---|---|---|
| Files and folders | kebab-case | `run-executor.ts` · `repo-intel.ts` · `seed-prompts.ts` |
| React components | PascalCase folder + same-named file + `index.ts` barrel | `_components/FindingsPanel/FindingsPanel.tsx` |
| Component internals | these fixed names only — never invent a sibling | `constants.ts` · `helpers.ts` · `styles.ts` |
| Server module | fixed names inside `src/modules/<domain>/` | `routes.ts` · `service.ts` · `repository.ts` + `repository/<entity>.repo.ts` |
| DB schema | one file per domain; a `_` prefix means shared helpers, not a domain | `db/schema/reviews.ts` · `db/schema/_shared.ts` |
| Migrations | `NNNN_<drizzle-generated-name>.sql` — generated, never hand-named | `0010_clear_king_cobra.sql` |
| Route segments | lowercase; params camelCase in brackets; `_` prefix = private folder | `app/repos/[repoId]/pulls/[number]/_components/` |
| Tests | beside the subject | `<Name>.test.tsx` · `*.test.ts` unit · `*.it.test.ts` integration |
| e2e flows | numbered `NN-<slug>.flow.json` | `04-pr-findings.flow.json` |
| i18n | one namespace file per feature, camelCase; keys are camelCase dot-paths | `messages/en/prReview.json` → `panel.hideLowConfidence` |
| Zod contracts | kebab file; schema `const` PascalCase + an inferred type of the same name | `contracts/findings.ts` → `export const Severity` + `export type Severity` |
| Specs | kebab-case `.md` under `<pkg>/specs/` | `client/specs/findings-severity-counters.md` |

## Docs — read on trigger, never preload

- Product overview, architecture diagram, course lessons L01–L08 → [README.md](README.md)
- Test strategy, suite map, CI workflows + path filters → [TESTING.md](TESTING.md)
- Writing or changing a reviewer agent prompt → [docs/agent-prompts/README.md](docs/agent-prompts/README.md)
- UI reference for any visual change → [docs/DevDigest Design (standalone).html](docs/)
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

- **Migrations** — `server/src/db/migrations/**`. NEVER edit an applied `.sql`, and never hand-edit
  `migrations/meta/_journal.json` or a `*_snapshot.json`: they are drizzle-kit output and a manual
  edit has already corrupted the journal once (`2006964`). Schema change → edit `db/schema/*.ts`,
  then `pnpm db:generate` and commit the generated files unchanged.
- **Lock files** — `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml` (pnpm),
  `reviewer-core/package-lock.json`, `e2e/package-lock.json` (npm), `skills-lock.json`. Never edit
  or delete one to fix an install; change dependencies only by running that package's own package
  manager, and never swap a package's PM.
- `docker compose down -v` — deletes the `devdigest_pgdata` volume (every imported repo + review).
- `server/clones/` — runtime checkouts, git-ignored.
- CLAUDE.md budget: root ≤ 80 lines, each package ≤ 60. Per line: "remove it — would Claude err?"
  No → cut.
