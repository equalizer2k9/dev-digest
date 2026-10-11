# Smart Diff — server

**Status:** implemented · **Package:** server · **Date:** 2026-10-11

Sibling: [`client/specs/smart-diff.md`](../../client/specs/smart-diff.md) ·
requirements: [`docs/hw3/requirements.md`](../../docs/hw3/requirements.md)

## Problem

Files changed lists a PR's files in the order GitHub returns them, so a lock file sits next to the
logic it was regenerated for and nothing tells a reviewer what to read first. The scaffolding for
a role-grouped diff is half there and unused: `SmartDiff` and `SmartDiffResponse` exist in both
`@devdigest/shared` copies ([`brief.ts`](../src/vendor/shared/contracts/brief.ts) lines 80-113,
[`review-api.ts`](../src/vendor/shared/contracts/review-api.ts) line 68) — but no route serves
them, nothing classifies a path, and `SmartDiffRole` has three values (`core`, `wiring`,
`boilerplate`) where the feature needs five.

## Goals / non-goals

**Goals**

- `classifyFile(path)` — a pure function from a path to one of five roles, usable without a
  route, a container or a database.
- Every pattern and both orders (match precedence, display order) in one constants file.
- `GET /pulls/:id/smart-diff` returns the PR's files in five groups, in display order, each file
  carrying the lines of the current findings on it; the body validates against `SmartDiff`.
- Grouping is deterministic code: no model call, no embeddings, and it answers before the first
  review exists.
- `SmartDiffRole` has five values in BOTH `@devdigest/shared` copies.

**Non-goals**

- A size threshold, split proposals, `pseudocode_summary` — each needs a heuristic or a model.
  §5 pins the minimal values.
- Using the classifier as a filter in front of prompt assembly (the L08 follow-up). §2 only keeps
  that possible.
- Any DB change, including an order column on `pr_files`. No migration.
- Refactoring `modules/pulls/routes.ts` beyond the one extraction §4 names.
- P3-1, P3-2, P3-3. Scope is all of P1 and P2, plus P3-4 and P3-5.
- A new dependency. The matcher is hand-written over the three pattern shapes in §2.

## Behaviour

### 1. Where the code lives

```
src/modules/reviews/smart-diff/
  build-smart-diff.ts       buildSmartDiff
  build-smart-diff.test.ts
src/modules/_shared/
  smart-diff-rules.ts       rules in match order · display order · fallback role
  classify-file.ts          classifyFile — shared: `reviews` and `brief` both classify paths
  classify-file.test.ts
  latest-reviews.ts         latestReviewPerAgent — the one copy of the rule (§4)
  latest-reviews.test.ts
```

The `reviews` module, because it already owns both reads the route needs — `getPrFiles` and
`reviewsForPull` on [`ReviewRepository`](../src/modules/reviews/repository.ts). The route goes
into [`reviews/routes.ts`](../src/modules/reviews/routes.ts), one method onto `ReviewService`.
Dependency direction: route → service → repository; the service calls `buildSmartDiff`, which
calls `classifyFile`. Nothing in `smart-diff/` imports upwards; the classifier and its rules sit
in `_shared/` since the `brief` module started using them (SPEC-01).

### 2. `classifyFile` — a pure function

```ts
export function classifyFile(path: string): SmartDiffRole
```

- Input is the path alone. No file contents, no size, no PR metadata.
- **No HTTP**: no Fastify type, no request, no reply. Also no container, no DB, no `fs`, no
  network, no clock. Its only imports are `./smart-diff-rules` and the `SmartDiffRole` type.
- Total and deterministic: every string maps to exactly one role; the same path always maps to
  the same role.

That is what lets it be called from anywhere later — the requirements name a prompt-assembly
filter on L08 — and what lets its test be a plain table of strings.

**Rules — the first one that matches wins.** The requirements' table, in the requirements'
order, widened in seven places (**bold**; see "Deviations" below):

| # | Role | Patterns |
|---|---|---|
| 1 | `boilerplate` | `*.lock` · `pnpm-lock.yaml` · `package-lock.json` · `yarn.lock` · **`skills-lock.json`** · **`**/dist/**`** · **`**/build/**`** · **`**/migrations/meta/**`** · `**/__snapshots__/**` · `*.snap` · `*.generated.*` · `*.min.js` |
| 2 | `tests` | `**/*.test.ts` · `**/*.test.tsx` · `**/*.it.test.ts` · `**/*.spec.ts` · **`**/*.spec.tsx`** · `**/test/**` · `**/tests/**` · `**/__tests__/**` · `e2e/**` |
| 3 | `wiring` | `index.ts` · `index.js` · **`index.tsx`** · **`package.json`** · `*.config.*` · `tsconfig*.json` · `.eslintrc*` · `.env*` · `docker-compose*.yml` · `.github/**` · `.claude/**` |
| 4 | `docs` | `**/*.md` · `docs/**` · `README*` · `CHANGELOG*` · `LICENSE` |
| 5 | `core` | everything else |

**Deviations from the requirements' table.** Each is a named row in the classifier test.

| Path shape | Requirements, read literally | Here | Why |
|---|---|---|---|
| `**/dist/**` | `dist/**` at the root only → `server/dist/x.js` is `core` | `boilerplate` at any depth | four packages, no root build — output is always nested |
| `**/build/**` | `build/**` at the root only | `boilerplate` at any depth | same |
| `skills-lock.json` | `core` (not `*.lock`) | `boilerplate` | a lock file by role, listed as one in the root `CLAUDE.md` |
| `**/migrations/meta/**` | `core` | `boilerplate` | drizzle-kit output (`_journal.json`, `*_snapshot.json`), never hand-edited |
| `*.spec.tsx` | `core` (only `*.spec.ts` listed) | `tests` | parity with `*.test.tsx` |
| `index.tsx` | `core` (only `.ts` / `.js` listed) | `wiring` | a barrel is a barrel in a React package too |
| `package.json` | `core` | `wiring` | a manifest wires dependencies and scripts; it is not the substance of a change (added 2026-10-11 after the PR #11 check) |

One thing deliberately **not** widened: a migration `*.sql` stays `core`. It is generated, but it
is the schema change itself and has to be reviewed. `…/migrations/0010_x.sql` → `core` is a row in
the test, next to `…/migrations/meta/_journal.json` → `boilerplate`.

**How a pattern is read.** Like a `.gitignore` entry, against the path exactly as GitHub reports
it (forward slashes, no leading `./`), case-sensitive:

- no slash, or `**/` followed by a slash-free glob → matched against the basename, at any depth
  (`*.lock`, `index.ts`, `README*`, `**/*.test.ts`, `**/*.md`);
- `**/a/**`, `**/a/b/**` → that run of directory segments at any depth, the root included
  (`**/dist/**`, `**/migrations/meta/**`);
- `name/**` → anchored at the repository root (`e2e/**`, `docs/**`, `.github/**`, `.claude/**`).

**Two orders, one file, never conflated.** `_shared/smart-diff-rules.ts` holds both:

- *match precedence* — `boilerplate` → `tests` → `wiring` → `docs` → `core`, the table above;
- *display order* — `core` → `tests` → `wiring` → `docs` → `boilerplate`, what the route emits.

Precedence decides which role a path gets; display order decides where its group appears. They
are different sequences on purpose and are exported as two separate constants.

### 3. The three disputed cases

Each path below matches two rules. The order in §2 settles all three; no rule is changed.

| Path | Matches | Role | Settled by |
|---|---|---|---|
| `__tests__/__snapshots__/x.snap` | rule 1 (`__snapshots__`, `*.snap`) and rule 2 (`__tests__`) | `boilerplate` | 1 before 2 |
| `.claude/skills/security/SKILL.md` | rule 3 (`.claude/**`) and rule 4 (`*.md`) | `wiring` | 3 before 4 |
| `e2e/README.md` | rule 2 (`e2e/**`) and rule 4 (`*.md`, `README*`) | `tests` | 2 before 4 |

`e2e/README.md` → `tests` is a decision, not an accident: the requirements allow changing the
rule instead, and this spec keeps the table as written. All three are named rows in the
classifier's test table, so reordering the rules fails a test.

### 4. Grouping — no model call

```ts
// modules/_shared/latest-reviews.ts
export function latestReviewPerAgent<T extends { prId: string; agentId: string | null; createdAt: Date }>(
  reviews: readonly T[],
): T[]
// modules/reviews/smart-diff/build-smart-diff.ts
export function buildSmartDiff(files, findings): SmartDiff
```

Both pure. Neither the functions, the service method nor the route handler touches an LLM, an
embedder, GitHub or git. A role comes from a path and a rule table, so
there is nothing for a model to decide.

`buildSmartDiff`:

- `groups` has **exactly five entries, always, in display order**. A role with no files is
  present with `files: []`.
- Inside a group, files are sorted by `path` (plain code-unit comparison). `pr_files` has no
  position column and `getPrFiles` has no `ORDER BY`, so any other order would be whatever
  Postgres happened to return.
- Per file: `path`, `additions`, `deletions`, and `finding_lines` = the `start_line` values of
  the selected findings whose `file` equals `path`, ascending, de-duplicated. There is no `line`
  field on a finding; `start_line` is the anchor.
- `pseudocode_summary` is omitted.
- A finding whose `file` is not among the PR's files contributes to nothing.

`latestReviewPerAgent` — which reviews count. **One server function, two callers; no second
copy of the rule.**

- The rule used to live inline in the PR list
  ([`pulls/routes.ts`](../src/modules/pulls/routes.ts)), where it picks the reviews behind
  `findings_counts`. That logic is **moved** into `latestReviewPerAgent` and the list calls
  it; `smartDiffForPull` calls the same function. The list's response does not change.
- Given reviews of `kind = 'review'`, it returns the newest one per `(prId, agentId)`; reviews
  without an agent share one key per PR. It sorts by `createdAt` itself and does not rely on the
  caller's order. Filtering by `kind` stays with the caller's query or a line before the call —
  whichever keeps the list's SQL unchanged.
- Findings of the returned reviews are the findings that count. Accepted and dismissed ones are
  included, exactly as in the list's FINDINGS column — so the group counter and the file dot on
  the client count the same set that column counts.
- No reviews → no findings → every `finding_lines` is `[]`. The response is still a 200 with all
  five groups: grouping works before the first review.

### 5. `split_suggestion` — minimal

The three fields the contract already has, filled with the least that is true:

| Field | Value |
|---|---|
| `too_big` | `false`, always |
| `total_lines` | `Σ (additions + deletions)` over the PR's files |
| `proposed_splits` | `[]`, always |

Nothing triggers `too_big`. Deliberately absent: a size threshold, any split heuristic, and
anything that would populate `proposed_splits`.

### 6. Route

| Method | Path | Params | Returns |
|---|---|---|---|
| GET | `/pulls/:id/smart-diff` | `IdParams` | `SmartDiffResponse` (200) |

- `schema: { params: IdParams, response: { 200: SmartDiffResponse } }`. It is the first route in
  the repo to declare a `response` schema; the compilers are already installed
  ([`app.ts`](../src/app.ts) lines 64-65) and a body that fails its schema is already mapped to a
  generic 500 (lines 130-134).
- `getContext` → `workspaceId`; `service.smartDiffForPull(workspaceId, prId)`.
- A pull request that is not in the workspace → `NotFoundError('Pull request not found')`, the
  same check and message as `reviewsForPull`. A malformed id is a 422 from `IdParams`.
- Files come from `repo.getPrFiles(prId)`, findings from `repo.reviewsForPull(prId)`. `pr_files`
  is filled by `GET /pulls/:id`; before that call the answer is five empty groups and
  `total_lines: 0`, not an error.
- The route's header comment in `routes.ts` gains the new line.

## Contracts & data

**`@devdigest/shared` `contracts/brief.ts` — BOTH copies** (`server/src/vendor/shared`,
`client/src/vendor/shared`). The two files are byte-identical today and must be after the edit:

```ts
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
```

That line is the whole contract change. `SmartDiffFile`, `SmartDiffGroup`, `ProposedSplit`,
`SmartDiff` and `SmartDiffResponse` keep their shape:

```ts
SmartDiffFile  = { path, pseudocode_summary?: string | null, additions, deletions, finding_lines: number[] }
SmartDiffGroup = { role: SmartDiffRole, files: SmartDiffFile[] }
SmartDiff      = { groups: SmartDiffGroup[],
                   split_suggestion: { too_big: boolean, total_lines: number, proposed_splits: ProposedSplit[] } }
```

**DB** — nothing. No schema edit, no migration, no seed change.

## Acceptance criteria

Numbered by [`docs/hw3/requirements.md`](../../docs/hw3/requirements.md). This spec holds the
server half; criteria shared with the client appear in both specs.

- [x] **P1-1** *(server half)* The response's `groups` has five entries with roles in the order
      `core` → `tests` → `wiring` → `docs` → `boilerplate`, each with its files, so the client can
      render a role label and a file count per group.
- [x] **P1-2** *(server half)* A lock file — `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`,
      `*.lock`, at any depth — is classified `boilerplate`.
- [x] **P2-1** Patterns and both role orders live in `_shared/smart-diff-rules.ts` and nowhere else;
      `classify-file.test.ts` is a path → role table that includes the three disputed cases of §3
      as named rows.
- [x] **P2-2** The route's 200 body passes `SmartDiff.parse`; the route declares
      `response: { 200: SmartDiffResponse }`; `SmartDiffRole` has five values in both `brief.ts`
      copies and the copies are still identical.
- [x] **P2-3** A Smart Diff request makes no model call — the injected LLM mock records zero
      calls — and a PR with no review returns 200 with five groups and empty `finding_lines`.
- [x] *(requirements, «Можлива реалізація» 3)* `finding_lines` holds the `start_line` of each
      agent's latest-review findings on that file; `split_suggestion` is
      `{ too_big: false, total_lines: Σ, proposed_splits: [] }`.
- [x] *(decision 2026-10-11)* "Each agent's latest review" is implemented once on the server —
      `latestReviewPerAgent` — and called by both the PR list and Smart Diff; the list's
      `findings_counts` are unchanged.

Scope: P1 and P2 in full; of P3 only P3-4 and P3-5. P3-1, P3-2, P3-3 are not implemented.

| Criterion | server | client |
|---|---|---|
| P1-1, P1-2, P2-2 | ✓ | ✓ |
| P2-1, P2-3 | ✓ | — |
| P1-3, P1-4, P1-5, P1-6, P2-4, P2-6, P2-7, P3-4, P3-5 | — | ✓ |
| P3-1, P3-2, P3-3 | out of scope | |
| P2-5 | exists — `POST /findings/:id/(accept\|dismiss)`, unchanged | ✓ |
| P1-7, P2-8 | delivery, not code — PR description + demo video | |

## Tests

Written before the code they cover.

- `_shared/classify-file.test.ts` — unit, one `it.each` table of `[path, role]`. The three
  disputed rows of §3; at least one row per pattern in §2; **one row per deviation** —
  `server/dist/x.js`, `client/build/x.js`, `skills-lock.json`,
  `server/src/db/migrations/meta/_journal.json` → `boilerplate`, `x/Foo.spec.tsx` → `tests`,
  `x/Foo/index.tsx` and `server/package.json` → `wiring`, `server/src/db/migrations/0010_x.sql` → `core`; real paths from
  this repo, including the fourth overlap `e2e/package-lock.json` → `boilerplate` and
  `server/src/modules/index.ts` → `wiring`; a plain source file → `core`. The test builds no app, no container and no mock —
  it can only stay that way while `classifyFile` is pure.
- `smart-diff/build-smart-diff.test.ts` — unit: five groups in display order with an empty input
  and with one file per role; path sort inside a group; `finding_lines` ascending and
  de-duplicated; dismissed included; a finding on a file outside the PR ignored; `total_lines`;
  `too_big === false`; `proposed_splits` empty; `SmartDiff.parse(result)` passes.
- `_shared/latest-reviews.test.ts` — unit: two reviews by one agent → only the newer; two agents
  → both; two PRs kept apart; `agentId: null` shares one key per PR; unsorted input.
- The PR list keeps its behaviour: the existing list / reviews tests stay green after the
  extraction.
- [`test/contracts.test.ts`](../test/contracts.test.ts) — the existing `SmartDiff` case extended:
  all five roles parse, an unknown role is rejected.
- `test/smart-diff.it.test.ts` — integration, real Postgres (named `*.it.test.ts` because it
  uses `test/helpers/pg.ts`): a PR with files and no review → 200, five groups, all
  `finding_lines` empty; with two agents' reviews → latest per agent; the body passes
  `SmartDiff.parse`; the LLM mock's `calls` is empty afterwards; an unknown id → 404.

Gate: `pnpm typecheck && pnpm test` in `server/`, and `pnpm typecheck` in `client/` after the
enum edit.

## Open questions

Decided 2026-10-11: "latest review" = each agent's latest, dismissed included (§4); always five
groups (§4); the pattern table is widened as listed under "Deviations" (§2).

- **First `response` schema.** How `fastify-type-provider-zod` treats keys outside the schema
  (strip vs fail) was not checked. The integration test asserts the 200 and the parse either way.
- **Server and client still each hold the rule.** The server has one copy after §4, and it is
  the only one used for counting — the client reads `finding_lines`. The client keeps
  `latestFindingsPerAgent` (now in `client/src/lib/findings.ts`) to pick which finding cards to
  draw. The two are coupled by intent, not by code.
