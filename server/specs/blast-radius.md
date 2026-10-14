# Blast Radius — server

**Status:** approved · **Package:** server · **Date:** 2026-10-11

Siblings: [`client/specs/blast-radius.md`](../../client/specs/blast-radius.md) ·
[`devdigest-mcp/specs/mcp-tools.md`](../../devdigest-mcp/specs/mcp-tools.md) ·
requirements: [`docs/hw4/requirements.md`](../../docs/hw4/requirements.md)

## Problem

A reviewer sees what a PR changes, not what else in the repo depends on it. `repo-intel` already
knows: the index built at clone time holds symbols, resolved references and per-file route / cron
facts, and [`repoIntel.getBlastRadius`](../src/modules/repo-intel/service.ts) (lines 220-391)
answers "who calls what these files declare". Nothing serves it: there is no route, no
`modules/blast/`, and the `BlastRadius` contract in both `@devdigest/shared` copies
([`brief.ts`](../src/vendor/shared/contracts/brief.ts) lines 16-44) has no consumer outside
`PrBrief`.

## Goals / non-goals

**Goals**

- `GET /pulls/:id/blast` — the PR's changed files → ONE `repoIntel.getBlastRadius` call → the
  `BlastRadius` shape plus an honest `degraded` / `reason`.
- The mapping from the facade's flat `BlastResult` to `downstream[]` is a pure function, unit-tested
  without an app, a container or a database.
- No model call and no embedder call, on any path. `summary` is a string built from four counts.
- No limit of its own: the caller cap is applied by the facade from
  [`repo-intel/constants.ts`](../src/modules/repo-intel/constants.ts); the `blast` module holds no
  numeric caller or depth limit.
- The facade tells the truth: `getBlastRadius` itself reports why a map is incomplete
  (`flag_off`, `index_partial`, `no_data`) and applies `MAX_CALLERS_PER_SYMBOL` per symbol (§3).

**Non-goals**

- The optional LLM text summary (requirements P2-4, optional part). Not built.
- P3-1, P3-2, P3-3, P3-6. Of P3 only P3-4, P3-5 (and P3-7 on the client).
- Any `repo-intel` change beyond the two in §3: no new index status, no writer for
  `index_failed` / `repo_too_large`, no multi-hop traversal.
- DB schema, migrations, seed. Nothing changes.
- Re-fetching `pr_files` on every request. The route loads them only when none are stored (§2).

## Behaviour

### 1. Where the code lives

```
src/modules/blast/
  routes.ts          GET /pulls/:id/blast
  service.ts         BlastService.forPull(workspaceId, prId)
  helpers.ts         toBlastRadius · buildSummary   (pure)
  helpers.test.ts
src/modules/_shared/
  pull-detail.ts     the GitHub → pr_files / pr_commits refresh, extracted from pulls/routes.ts
test/blast.it.test.ts
```

A new module, registered in [`modules/index.ts`](../src/modules/index.ts) (one import, one map
entry — its header comment already lists `blast` as planned). No `repository.ts`: the two reads it
needs already exist on `container.reviewRepo` (`getPull`, `getPrFiles`), the same pair
`smartDiffForPull` uses.

### 2. The request

`:id` is the `pull_requests` row uuid, as on every other `/pulls/:id/*` route.

1. `reviewRepo.getPull(workspaceId, id)` — missing → 404 `not_found` "Pull request not found".
2. `reviewRepo.getPrFiles(id)` → paths. **The route guarantees the files itself:** when the PR has
   no stored rows it runs the same refresh `GET /pulls/:id` runs, then reads again. That refresh is
   today inline in [`pulls/routes.ts`](../src/modules/pulls/routes.ts) (lines 238-270); it moves,
   unchanged in behaviour, into one function in `modules/_shared/pull-detail.ts` that both routes
   call — one copy, not two. When rows already exist the route does not touch GitHub. If the
   refresh cannot run (no token, GitHub down) and there are still no rows: 200, empty arrays,
   `degraded: true`, `reason: 'no_data'` — never a 500.
3. `repoIntel.getBlastRadius(pull.repoId, paths)` — exactly once.
4. `toBlastRadius(result)`; `degraded` and `reason` are taken from the facade result as is
   (`reason: null` when not degraded).
5. One log line: `blast: served { prId, repoId, degraded, reason, symbols, callers, ms }`.

The route never calls the indexer, git, ast-grep, the LLM or the embedder, and calls GitHub only in
the no-stored-files case of step 2.

### 3. The facade: what it does today and what this spec changes

`getBlastRadius` has no consumer other than this feature, so both changes are safe for the rest of
the server.

| Requirements say | Our code today | After this spec |
|---|---|---|
| `reason ∈ flag_off / index_failed / index_partial / repo_too_large / no_data` | Only `no_data` is ever emitted (`service.ts:233`, `:302`). Flag off → ripgrep fallback tagged `no_data`. A `partial` index → `degraded: false`, no reason (`:320`, `:389`). | **Changed** — see "Reasons" below. |
| `MAX_CALLERS_PER_SYMBOL = 20` | Applied once to the whole rank-sorted list (`:386`): 20 callers per response. | **Changed** — 20 per `viaSymbol`. |
| `BFS_DEPTH = 2` | Not used by blast at all (only `getCriticalPaths`, `:686`). Callers are depth 1; endpoints come from the caller's own file. | Unchanged, stated here. The blast feature has one limit, not two. |
| "Never throws" | True for the no-data cases; a DB error propagates → 500 through the error envelope. | Unchanged. |
| "Drops the declaring file itself" | Explicit on the fallback path (`:273`), only implicit on the index path. | Unchanged in the facade; the mapping guards it (§4). |
| `factsByFile`, `rank` | Absent / `0` on the fallback path. | Unchanged. |
| Changed symbols | Every symbol declared in a changed file — exported or not, on a changed line or not. | Unchanged. |

**Reasons — the facade computes them.** First matching row wins.

| # | Condition | Path | `degraded` | `reason` |
|---|---|---|---|---|
| 1 | `config.repoIntelEnabled === false` | ripgrep fallback | true | `flag_off` |
| 2 | no repo / no clone / no changed files / no usable index state / `codeIndex` failure | fallback or empty | true | `no_data` |
| 3 | index `status === 'partial'` | persistent index | true | `index_partial` |
| 4 | index `status === 'full'` | persistent index | false | — |

Row 3 still returns whatever callers the partial index holds; `degraded` marks the map as possibly
incomplete, it does not empty it.

**Reachable reasons: `flag_off`, `index_partial`, `no_data`.** `index_failed` and `repo_too_large`
exist in the `DegradedReason` type but nothing in the codebase writes them: the indexer never
stamps `repo_index_state.status = 'failed'`, and the walker only records `stats.bounded`. This spec
does not add a writer for either and no test pretends they occur.

**Cap per symbol.** After the rank sort, the facade keeps the first `MAX_CALLERS_PER_SYMBOL`
callers of each `viaSymbol` instead of slicing the combined list. `factsByFile` and
`impactedEndpoints` are built from the kept callers' files. The constant is read from
`constants.ts`; no literal `20` appears in `service.ts`.

### 4. Mapping — `toBlastRadius(result: BlastResult): BlastRadius`

- `changed_symbols` = `result.changedSymbols`, order kept.
- Callers are grouped by `viaSymbol` → one `downstream` entry per symbol that has ≥1 caller. A
  changed symbol with no caller has no entry but stays in `changed_symbols`.
- A caller whose `file` is a file that declares its `viaSymbol` is dropped (P2-5).
- Entry `callers[]` = `{ name: caller.symbol, file, line }`, sorted by `rank` desc, then `file`,
  then `line`.
- Entry `endpoints_affected` / `crons_affected` = the union, de-duplicated, of
  `factsByFile[file]` over that entry's caller files only. `factsByFile` undefined → both empty.
  Crons never go into `endpoints_affected` (P3-4).
- `downstream` is sorted by the entry's highest caller `rank` desc, then symbol name asc (P3-5).
- `summary` = `buildSummary({ symbols, callers, endpoints, crons })` →
  `"2 symbols · 14 callers · 3 endpoints · 1 cron"`, singular for 1. `symbols` counts
  `changed_symbols`; endpoints and crons are counted unique across entries.

Known limits, accepted: endpoint attribution is file-level (every route registered in a caller's
file is listed, not only the handler that calls the symbol); two changed files declaring the same
symbol name merge into one entry.

### 5. Stand: the states the demo needs

Each state is produced by the real code path of §3; no response is stubbed and nothing is created
on GitHub.

| State | How | Why it is honest |
|---|---|---|
| Incomplete index — `index_partial` | Import a small existing public repo that has no `.ts` / `.js` files and at least one open PR (read-only: clone + PR list). | The full index finds no supported files and stamps `partial` itself ([`pipeline/full.ts`](../src/modules/repo-intel/pipeline/full.ts) lines 101-113). The block shows the marker with the real reason next to "no changed symbols". |
| No callers | PR #11 of the fork. | Its changed file is new — it is not in the indexed default branch, so nothing references it. |
| Full map | The test PR (see "Open questions"). | `index-state` is `full` and `lastIndexedSha` equals the fork's `main`. |

Not used for the video, but real: `REPO_INTEL_ENABLED=false` + restart → `flag_off`.

## Contracts & data

**`@devdigest/shared` — both copies, identical edit**, right after `BlastRadius` in
`contracts/brief.ts`:

```ts
export const BlastDegradedReason = z.enum([
  'flag_off', 'index_failed', 'index_partial', 'repo_too_large', 'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const BlastRadiusResponse = BlastRadius.extend({
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullable(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;
```

`BlastRadius` and `PrBrief` are not changed. Same precedent as `SmartDiffResponse`. The enum
mirrors the existing server type `DegradedReason` value for value; only three of the five are
reachable (§3).

**Route**

| Method | Path | 200 | Errors |
|---|---|---|---|
| GET | `/pulls/:id/blast` | `BlastRadiusResponse` | 404 `not_found` unknown PR · 422 `validation_error` malformed id |

**DB** — nothing.

## Acceptance criteria

Numbered by [`docs/hw4/requirements.md`](../../docs/hw4/requirements.md). Server half here.

- [ ] **P1-2** *(server half)* The body has `changed_symbols`, `downstream[]` and a `summary` built
      from the four counts per §4.
- [ ] **P1-3** *(server half)* Each `downstream` entry has `symbol`, `callers[{ name, file, line }]`
      and the endpoints / crons of its own caller files.
- [ ] **P1-6 / P2-7** *(server half)* The body carries `degraded` and `reason`, computed by the
      facade per the "Reasons" table in §3; each reachable reason (`flag_off`, `index_partial`,
      `no_data`) has a unit test, and so does the `full` → not degraded case.
- [ ] **P2-1** One `getBlastRadius` call per request; no indexer, git or ast-grep call; GitHub only
      when the PR has no stored files (§2.2); the log line of §2.5 is written.
- [ ] **P2-2** The route declares `response: { 200: BlastRadiusResponse }`; the 200 body passes
      `BlastRadiusResponse.parse` and `BlastRadius.parse`; both `brief.ts` copies are identical.
- [ ] **P2-3** `toBlastRadius` is pure and unit-tested: grouping by `viaSymbol`, facts per group,
      `factsByFile` absent, summary.
- [ ] **P2-4** Zero LLM and zero embedder calls — the injected mocks record none. No text summary
      from a model exists.
- [ ] **P2-5** A caller in the declaring file of its `viaSymbol` never appears in `downstream`.
- [ ] **P2-6** *(server half)* `modules/blast/` contains no numeric caller or depth limit; the
      facade applies `MAX_CALLERS_PER_SYMBOL` from `repo-intel/constants.ts` **per symbol**, with a
      test (a symbol with more callers than the cap keeps exactly the cap, and does not reduce
      another symbol's callers). `BFS_DEPTH` is not used by blast.
- [ ] **P3-4** *(server half)* Crons only in `crons_affected`.
- [ ] **P3-5** `downstream` and each entry's callers are ordered by `rank` per §4.
- [ ] *(decision 2026-10-11)* The route loads the PR's files itself when none are stored, through
      the one function `GET /pulls/:id` also uses; `GET /pulls/:id` behaves as before. With no rows
      and no way to load them → 200, empty arrays, `degraded: true`, `reason: 'no_data'`.

| Criterion | server | client | devdigest-mcp |
|---|---|---|---|
| P1-2, P1-3, P1-6, P2-6, P2-7, P3-4, P3-5 | ✓ | ✓ | — |
| P2-1, P2-2, P2-3, P2-4, P2-5 | ✓ | — | — |
| P1-1, P1-5, P3-7 | — | ✓ | — |
| P1-7, P2-8 | route only | — | ✓ |
| P1-4 | verified on the stand, not code | | |
| P1-8, P2-9 | delivery — PR description + demo video | | |
| P2-4 optional text summary · P3-1, P3-2, P3-3, P3-6 | out of scope | | |

## Tests

Written before the code they cover.

- `modules/blast/helpers.test.ts` — unit, plain data, no app:
  - `toBlastRadius`: two symbols with interleaved callers → two groups; facts only from the group's
    caller files; a file with facts but no caller in the group contributes nothing; duplicates
    removed; `factsByFile` undefined → empty arrays; declaring-file caller dropped; group order and
    caller order by rank; a symbol with no callers has no group but stays in `changed_symbols`;
    `BlastRadius.parse(result)` passes.
  - `buildSummary`: zero, singular, plural.
- `modules/repo-intel/` facade tests (beside the existing ones, same style and mocks):
  - flag off → `degraded: true`, `reason: 'flag_off'`;
  - index `partial` → `degraded: true`, `reason: 'index_partial'`, callers still returned;
  - no index state / no clone / no changed files → `no_data`;
  - index `full` → `degraded: false`, no reason;
  - cap per symbol: symbol A with cap + 5 callers and symbol B with 2 → A keeps exactly the cap,
    B keeps both; the expectation reads `MAX_CALLERS_PER_SYMBOL`, not `20`.
- [`test/contracts.test.ts`](../test/contracts.test.ts) — `BlastRadiusResponse` parses; an unknown
  reason is rejected.
- `test/blast.it.test.ts` — integration, real Postgres, `overrides.repoIntel` with a recording
  mock: 200 and both parses; exactly one `getBlastRadius` call with the PR's paths and repo id;
  the mock's `degraded` / `reason` arrive unchanged; LLM and embedder `calls` empty; no `pr_files`
  rows → the GitHub mock is asked once, rows are stored, the map is served; rows present → the
  GitHub mock is not called; no rows and GitHub failing → 200 empty with `no_data`; unknown uuid →
  404; malformed id → 422.
- The existing `GET /pulls/:id` tests stay green after the extraction.

Gate: `pnpm typecheck && pnpm test` in `server/`, `pnpm typecheck` in `client/` after the contract
edit.

## Open questions

Decided 2026-10-11: contract by extension (`BlastRadiusResponse`); the facade computes the reason
and caps per symbol (§3); the route loads PR files itself (§2); `index_partial` for the video comes
from a real public repo without TS/JS, "no callers" from PR #11 (§5).

- **Test PR.** `modules/_shared/latest-reviews.ts` is not in the fork's `main` nor in the indexed
  clone, and the requirements' `modules/reviews/helpers.ts` has no caller that registers a route.
  The target must be an exported function that exists in `main` and in the index, is imported by
  ≥2 files, with ≥1 caller in a `routes.ts`. The candidate is confirmed with
  `GET /pulls/:id/blast` (≥2 callers, ≥1 endpoint) before the video is recorded.
- **Index freshness.** On 2026-10-11 `lastIndexedSha` was `c6af1e4` while the fork's `main` was
  `df7a057` (clone 14 commits behind). `POST /repos/:id/resync` before recording, then re-check
  `index-state` is still `full`.
- **Line drift.** The index reflects the default-branch clone, links are pinned to the PR head sha;
  a caller's line can be off if the PR branch touched that file.
- **Endpoint attribution is file-level** — every route registered in a caller's file is listed.
- **`response` schema strictness** of `fastify-type-provider-zod` (strip vs fail on extra keys) is
  still unchecked; the mapping returns exactly the contract keys.
