# Plan: Multi-Agent Review

Spec: SPEC-04 — `specs/multi-agent-review/spec.md` (Status: approved)

## Goal

Let a reviewer launch 2 to 5 chosen enabled agents on one pull request as one **multi-agent run**. The launch shows each agent's estimated cost and time and the totals before it starts. The agents run concurrently after one shared diff and intent preparation. The result is one page that polls every 2 seconds and shows per-agent columns, finding groups computed by code, per-agent cells and conflicts. The server changes stay inside `server/src/modules/reviews/**`, plus one generated migration that adds a nullable link from `agent_runs` to `multi_agent_runs`. The client adds a picker to the PR page's `RunReviewDropdown`, plus `/multi-agent` and `/multi-agent/[id]`.

## Files

Two groups: **server** (T-1 to T-9) and **client** (T-10 to T-14). Files marked **(outside the ownership list)** are flagged under Risks with the reason.

### File ownership (Part A)

Requirements' "Власники файлів" table, extended by the user on 2026-10-16 with two new A-only paths.

| owner | files |
|---|---|
| A | `server/src/modules/reviews/**`, the one generated migration (+ its `meta/` output), `server/src/db/schema/runs.ts`, `contracts/multi-agent.ts` (both `vendor/shared` copies), PR page `RunReviewDropdown`, `client/src/app/multi-agent/**`, multi-run hooks (`client/src/lib/hooks/multi-agent.ts`), **`client/messages/en/multiAgent.json`** (new), **`client/src/components/multi-agent/**`** (new) |
| shared, append one line only | `vendor/shared/index.ts` (both copies), `client/src/lib/hooks/index.ts`, sidebar/nav (`client/src/vendor/ui/nav.ts`), `docs/retros/ledger.md`, `AGENTS.md` |
| not touched by A | `client/src/components/showcase/**` (shared file, not needed for this homework), every Part B path |


| path | new/modify | what changes | AC |
|---|---|---|---|
| `server/src/vendor/shared/contracts/multi-agent.ts` | new | `MultiRunRequest`, `MultiRunLaunchResponse`, `MultiRunListQuery`, `MultiRunStatus`, `CellValue`, `GroupCell`, `GroupMember`, `FindingGroup`, `MultiRunAgent`, `MultiRunPr`, `MultiRunDetail`, `MultiRunListItem`, `MultiRunList`, `AgentEstimate`, `AgentEstimates` | AC-1, AC-2, AC-6, AC-7, AC-10, AC-12 |
| `client/src/vendor/shared/contracts/multi-agent.ts` | new | byte-identical copy of the file above | same |
| `server/src/vendor/shared/index.ts` | modify (shared, append one line) | `export * from './contracts/multi-agent.js';` | — |
| `client/src/vendor/shared/index.ts` | modify (shared, append one line) | same line | — |
| `server/src/modules/reviews/multi-run/contract.test.ts` | new | parse cases + "both copies byte-identical" | AC-1, AC-2 |
| `server/src/db/schema/runs.ts` | modify | `agentRuns.multiAgentRunId` nullable uuid → `multiAgentRuns.id`, `onDelete: 'set null'` | AC-1 (NFR-5) |
| `server/src/db/migrations/0015_<generated>.sql`, `meta/_journal.json`, `meta/0015_snapshot.json` | new (generated) | output of `pnpm db:generate`, committed unchanged | AC-1 (NFR-5) |
| `server/src/modules/reviews/multi-run/constants.ts` | new | `SIMILARITY_THRESHOLD = 0.3`, `MULTI_RUN_MIN_AGENTS = 2`, `MULTI_RUN_MAX_AGENTS = 5`, `ESTIMATE_WINDOW = 10`, `MULTI_RUN_LIST_LIMIT = 20`, `SEVERITY_RANK` | AC-2, AC-6, AC-9, AC-12 |
| `server/src/modules/reviews/multi-run/grouping.ts` + `grouping.test.ts` | new | pure: `titleWords`, `titleSimilarity`, `rangesOverlap`, `groupFindings` | AC-9 |
| `server/src/modules/reviews/multi-run/disagreements.ts` + `disagreements.test.ts` | new | pure: `buildCells`, `isConflict` | AC-10 |
| `server/src/modules/reviews/multi-run/run-summary.ts` + `run-summary.test.ts` | new | pure: `multiRunStatus`, `wallClockMs`, `usageTotals`, `isInProgress` | AC-7, AC-12 |
| `server/src/modules/reviews/multi-run/estimate.ts` + `estimate.test.ts` | new | pure: `estimateAgent(rows)` | AC-6 |
| `server/src/modules/reviews/run-executor.ts` | modify | the per-agent `for … await` becomes `Promise.allSettled` | AC-4, AC-5 |
| `server/src/modules/reviews/run-executor.test.ts` | modify | new `describe` blocks: concurrency, a single diff load, failure isolation | AC-4, AC-5 |
| `server/src/modules/reviews/repository/multi-run.repo.ts` | new | queries for multi runs, linked agent runs, their reviews and findings, the list, estimate history | AC-1, AC-6, AC-7, AC-12 |
| `server/src/modules/reviews/repository/run.repo.ts` | modify | `createAgentRun` gets an optional `multiAgentRunId` | AC-1 |
| `server/src/modules/reviews/repository.ts` | modify | `ReviewRepository` composes the new repo functions | AC-1, AC-6, AC-7, AC-12 |
| `server/src/modules/reviews/multi-run/multi-run-service.ts` + `multi-run-service.test.ts` | new | `MultiRunService`: `resolveTargets`, `launch`, `get`, `list`, `estimates` | AC-1, AC-2, AC-6, AC-7, AC-12 |
| `server/src/modules/reviews/service.ts` | modify | `runReview` gets an optional `multiAgentRunId` that it passes to `createAgentRun` | AC-1 |
| `server/src/modules/reviews/multi-run/routes.ts` | new | `GET /multi-runs`, `GET /multi-runs/estimates`, `GET /multi-runs/:id` | AC-6, AC-7, AC-12 |
| `server/src/modules/reviews/routes.ts` | modify | `POST /pulls/:id/review` branches on `agentIds`; registers `./multi-run/routes.js` | AC-1, AC-2, AC-3 |
| `server/src/modules/reviews/multi-run/multi-run.it.test.ts` | new | HTTP + testcontainers Postgres | AC-1, AC-2, AC-3, AC-7, AC-12 |
| `client/src/lib/hooks/multi-agent.ts` + `multi-agent.test.ts` | new | `useAgentEstimates`, `useLaunchMultiRun`, `useMultiRun`, `useMultiRuns`, `useMultiRunFindingAction` | AC-1, AC-6, AC-8, AC-12 |
| `client/src/lib/hooks/index.ts` | modify (shared, append one line) | `export * from "./multi-agent";` | — |
| `client/messages/en/multiAgent.json` | new (A) | every caption of the picker and both pages | NFR-9 |
| `client/src/components/multi-agent/MultiAgentPicker/{MultiAgentPicker.tsx,index.ts,constants.ts,helpers.ts,styles.ts,MultiAgentPicker.test.tsx,helpers.test.ts}` | new (A) | presentational picker shared by the PR page and `/multi-agent` | AC-1, AC-6 |
| `client/src/components/multi-agent/index.ts` | new (A) | barrel | — |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/{RunReviewDropdown.tsx,constants.ts,styles.ts,RunReviewDropdown.test.tsx}` | modify | "Multi-agent review…" item opens a `Modal` with the picker; launch → navigate; error keeps the selection; link to the latest multi run | AC-1, AC-2, AC-3 |
| `client/src/app/multi-agent/[id]/page.tsx` | new | thin page: `AppShell` + `MultiRunView` | AC-7, AC-8 |
| `client/src/app/multi-agent/[id]/_components/MultiRunView/*` | new | header, error notice, composes the sections below | AC-7, AC-8 |
| `client/src/app/multi-agent/[id]/_components/AgentColumns/*` | new | one column per agent run; "View trace" → `RunTraceDrawer`; per-run cancel | AC-7 |
| `client/src/app/multi-agent/[id]/_components/FindingGroups/*` | new | group rows (representative + agents) that expand to `FindingCard` + `EvalCaseButton` | AC-9 |
| `client/src/app/multi-agent/[id]/_components/DisagreementsSection/*` | new | cell matrix, "Show only conflicts" toggle, client-side filter | AC-10, AC-11 |
| `client/src/app/multi-agent/page.tsx` | new | thin page: `AppShell` + `MultiRunListView` | AC-12 |
| `client/src/app/multi-agent/_components/MultiRunListView/*` | new | the list of up to 20 runs + "New multi-agent review" | AC-12 |
| `client/src/app/multi-agent/_components/NewMultiRunDialog/*` | new | choose repo → PR → the same picker → launch → navigate | AC-1 |
| `client/src/vendor/ui/nav.ts` | modify (shared sidebar/nav, append one line) | `{ key: "multi-agent", label: "Multi-Agent Review", icon: "Layers", href: "/multi-agent" }` in WORKSPACE | AC-12 (NFR-3) |

Not touched: `server/src/vendor/shared/contracts/platform.ts` (`RunRequest`), `observability.ts` (the legacy `MultiAgentRun` / `Conflict`), `server/src/modules/index.ts`, `client/src/lib/hooks/reviews.ts`, `messages/en/prReview.json`, `messages/en/runs.json`, every lock file, every applied migration, `reviewer-core/**`, `PrDetailHeader`, the PR `page.tsx`.

## Decisions

- **Body branch, not a contract change.** `RunRequest` (`server/src/vendor/shared/contracts/platform.ts:273-277`) strips unknown keys, so today `{agentIds}` turns into "neither" and the server answers `400 invalid_run_request` (`service.ts:62`). The route checks first whether the raw body has its own `agentIds` key:
  - If it does: `MultiRunRequest.parse(body)`. A bad length, a duplicate or a non-uuid throws a `ZodError`, which becomes `422 validation_error` (`app.ts:161-174`).
  - If it does not: the existing code path runs byte for byte (AC-3).
  - The in-handler parse is the documented exception for this route (`server/specs/review-flow.md:38-43`; `routes.ts:28-29`).
- **Invalid agent list (A-11).** After zod passes, `MultiRunService.resolveTargets` loads `agentsRepo.listEnabled(workspaceId)` (`server/src/modules/agents/repository.ts:58-63`). Any id not in that set (disabled, unknown or from another workspace) throws `ValidationError('Invalid agent list')`, which is `422 validation_error` (`server/src/platform/errors.ts:25-29`). The answer is the same whichever id is wrong. All validation runs before any insert, so AC-2 needs no transaction.
- **Launch order.** The pull and repo checks run first (404 as today, `service.ts:115-118`). Then `createMultiRun`, then one `createAgentRun` per agent with `multiAgentRunId`, **sequentially, in request order** (the existing loop shape, `service.ts:125-135`), then the existing fire-and-forget executor call (`service.ts:139-141`). Agent-run order is read back as `ran_at asc, id asc`. No transaction, because one transaction gives every row the same `now()`.
- **Status "queued".** `createAgentRun` writes `status: 'running'` (`run.repo.ts:135`), and `cancelRunIfRunning`, `activeRunsForPull` and `reapStaleRunningRuns` all key on `'running'` (`run.repo.ts:28,98,109`). The spec's Definitions treat queued and running alike as "in progress". The rows therefore keep being created as `running`, and `isInProgress(status)` treats `null | 'queued' | 'running'` as in progress.
- **Response shape.** `MultiRunLaunchResponse = ReviewRunResponse.extend({ multi_run_id: z.string() })` (`review-api.ts:56-61`). The `runs` field is the existing `{run_id, agent_id, agent_name}[]` in request order.
- **Names.** `observability.ts:75-86` already exports `MultiAgentRun`, `AgentColumn` and `Conflict`. The new contract uses only `MultiRun*`, `FindingGroup`, `GroupCell`, `GroupMember`, `CellValue`, `AgentEstimate*`, so the barrel `export *` has no collision. The legacy schemas stay unused and untouched.
- **Contract shapes** (identical in both copies):
  ```ts
  MultiRunRequest        = { agentIds: string(uuid)[] min 2 max 5, refine(distinct) }
  MultiRunLaunchResponse = ReviewRunResponse & { multi_run_id: string }
  MultiRunListQuery      = { pr_id?: string(uuid) }
  MultiRunStatus         = 'running' | 'done' | 'failed'
  CellValue              = Severity | 'did_not_flag' | 'failed' | 'pending'
  GroupCell              = { run_id: string, value: CellValue }
  GroupMember            = FindingRecord & { run_id: string }
  FindingGroup           = { id: string, representative: GroupMember, members: GroupMember[], cells: GroupCell[], conflict: boolean }
  MultiRunAgent          = { run_id, agent_id: string|null, agent_name: string|null /* null = deleted */, status: string|null, error: string|null,
                             duration_ms, tokens_in, tokens_out, cost_usd, findings_count, score /* all nullable */ }
  MultiRunPr             = { id: string, number: int, title: string, repo_id: string }
  MultiRunDetail         = { id, pr: MultiRunPr, status: MultiRunStatus, started_at: string, wall_clock_ms: int|null,
                             tokens_in: int, tokens_out: int, cost_usd: number|null, agents: MultiRunAgent[], groups: FindingGroup[] }
  MultiRunListItem       = { id, pr: MultiRunPr, agents: { agent_id: string|null, agent_name: string|null }[], status, wall_clock_ms: int|null,
                             cost_usd: number|null, started_at: string }
  MultiRunList           = MultiRunListItem[]
  AgentEstimate          = { agent_id, agent_name, duration_ms: number|null, cost_usd: number|null, runs: int }
  AgentEstimates         = { agents: AgentEstimate[] }
  ```
- **Routes** (all workspace-scoped through `getContext`, `server/src/modules/_shared/context.ts:14-23`):
  - `GET /multi-runs?pr_id=` → `MultiRunList`: at most 20, newest first. `pr_id` narrows the list for the PR-page link (NFR-3).
  - `GET /multi-runs/estimates` → `AgentEstimates` for every enabled agent of the workspace.
  - `GET /multi-runs/:id` (`IdParams`) → `MultiRunDetail`. A multi run of another workspace answers `NotFoundError`.
  - Each route has a `response: { 200: … }` zod schema, the same way as `routes.ts:138-145`. The static `/multi-runs/estimates` takes precedence over `/:id` in find-my-way.
- **Status, totals, wall-clock** (pure, `run-summary.ts`):
  - Status: `running` if any run is in progress, `failed` if every run is failed or cancelled, otherwise `done`.
  - Tokens: the sum of the known `tokens_in` and `tokens_out` values.
  - Cost: the sum of the known `cost_usd` values, and `null` when none is known (shown as "—").
  - Wall-clock: `null` while any run is in progress (A-7). Otherwise `max(finish_i) − multi.ranAt`, where `finish_i` is the `reviews.created_at` of the run's review when it has one, else `ranAt_i + (durationMs_i ?? 0)`. Reason: `durationMs` is measured from the start of `runOneAgent`, after the shared preparation (`run-executor.ts:200`), and `agent_runs` has no finish column.
- **Grouping input order (NFR-7).** Agent runs come in launch order. Within a run, `findings` has no insertion column (`server/src/db/schema/reviews.ts:29-47`; random uuid id), so the repository orders a run's findings by `file, start_line, id`. That order is fixed and stable, and it is the order "stored finding order" refers to. A run with several `review` rows (none expected) takes its newest review only.
- **Grouping is single-link (A-5)**, in input order. A finding joins the **first** group that both (a) has no member from the same run and (b) has a member in the same file, with an overlapping range (`end_line ?? start_line`; A-4, EC-9) and `titleSimilarity ≥ SIMILARITY_THRESHOLD`. Otherwise the finding starts a new group.
  - Title words: lower-case, split on `/[^\p{L}\p{N}]+/u`, drop empty pieces, then a `Set`. The Jaccard index is 0 when both sets are empty.
  - Representative: the highest `SEVERITY_RANK`; a tie keeps the earlier finding.
  - `group.id` is the representative's finding id.
  - Only runs with status `done` contribute findings (AC-9). The function never mutates its input.
- **Cells (AC-10).** One cell per agent run, in launch order:
  - `done` → the severity of its member, or `did_not_flag`;
  - `failed` / `cancelled` → `failed`;
  - in progress → `pending` (A-13).
  - `conflict` = any `did_not_flag` cell **or** more than one distinct severity among the members. `pending` and `failed` never make a conflict.
- **Estimate (AC-6, A-6).** Per enabled agent: its last `ESTIMATE_WINDOW = 10` runs with `status = 'done'` and `source = 'local'`, any PR, `ran_at desc`. `duration_ms` is the mean of the non-null `duration_ms`. `cost_usd` is the mean over the rows with non-null `cost_usd`. Either is `null` when it has no rows. Totals (sum of cost, max of time, `null` when no ticked agent has a value) are computed on the client in the picker's `helpers.ts`, because they change with every tick.
- **Picker placement.** The design-system `Dropdown` closes on every item click and supports no checkbox rows (`client/src/vendor/ui/kit/Dropdown.tsx:12-15`; `kit/types.ts:5-16`), and `src/vendor/ui` is outside Part A's files. `RunReviewDropdown` therefore keeps its run-all and per-agent items unchanged and adds one item, "Multi-agent review…". That item opens a `Modal` (`kit/Modal.tsx:4-18`) holding `MultiAgentPicker`. "New multi-agent review" on `/multi-agent` reuses the same component. NFR-1's content (a checkbox per enabled agent, each with its estimate, a total, a "Run multi-agent review (N)" button enabled only for 2 ≤ N ≤ 5, no sixth tick) is all inside the picker. See Risks.
- **Polling (AC-8).** `useMultiRun(id)` sets `refetchInterval: q => (q.state.data && hasInProgress(q.state.data) ? MULTI_RUN_POLL_MS : false)` with `MULTI_RUN_POLL_MS = 2000` and `retry: false`. After a failed refetch TanStack keeps `state.data`, so polling continues and the page shows a non-blocking notice while `isError && data` (EC-11).
- **Live stream (NFR-4).** Only the opened column gets a stream. `RunTraceDrawer` receives `running = isInProgress(agent.status)` and opens SSE only in that case (`RunTraceDrawer.tsx:45-49`). At most one drawer is open at a time (one `selectedRunId` in state).

## Tasks

### Group: server

### T-1 — `multi-agent.ts` contract in both vendor copies
AC: AC-1, AC-2, AC-7, AC-12
Files: `server/src/vendor/shared/contracts/multi-agent.ts`, `client/src/vendor/shared/contracts/multi-agent.ts`, `server/src/vendor/shared/index.ts` (+1 line), `client/src/vendor/shared/index.ts` (+1 line), `server/src/modules/reviews/multi-run/contract.test.ts`
Change: the shapes under Decisions. `Severity` comes from `./findings.js` and `FindingRecord` / `ReviewRunResponse` from `./review-api.js`. Comments say the client imports these as types only.
Test: `server/src/modules/reviews/multi-run/contract.test.ts` —
- `MultiRunRequest accepts 2 and 5 distinct uuids`
- `MultiRunRequest rejects 1 id, 6 ids, a duplicate and a non-uuid`
- `MultiRunLaunchResponse requires multi_run_id and keeps pr_id/runs/reviews`
- `MultiRunDetail accepts a null wall_clock_ms, a null cost_usd and a null agent_name`
- `CellValue accepts the three severities and did_not_flag/failed/pending only`
- `both multi-agent.ts copies are byte-identical` (`node:fs` read of both paths)
Verify: `pnpm typecheck && pnpm exec vitest run src/modules/reviews/multi-run/contract.test.ts` in `server/`; `pnpm typecheck` in `client/`
Skills: zod
Depends on: —

### T-2 — Link agent runs to their multi run (schema + generated migration)
AC: — (enables T-7, T-9; NFR-5 for AC-1)
Files: `server/src/db/schema/runs.ts`; generated `server/src/db/migrations/0015_*.sql`, `meta/_journal.json`, `meta/0015_snapshot.json`
Change: in `agentRuns` (`runs.ts:8-33`) add `multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, { onDelete: 'set null' })`. The column is nullable with no default, so existing rows stay `null`. The lambda reference to the later `multiAgentRuns` (`runs.ts:43-52`) works at runtime. Only if `tsc` reports an implicit-any cycle, type it with `(): AnyPgColumn => multiAgentRuns.id`. Then run `pnpm db:generate` in `server/` (drizzle-kit, offline, no DB needed). Do **not** run `db:migrate`.
Test: `server/src/modules/reviews/multi-run/multi-run.it.test.ts` › `deleting a multi run keeps its agent runs and clears their link` (T-9). The generated SQL is checked here.
Verify: `pnpm db:generate && pnpm typecheck` in `server/`. Then `grep -in "drop\|rename" src/db/migrations/0015_*.sql` must be empty, and `grep -i "on delete set null" src/db/migrations/0015_*.sql` must match exactly one `ADD CONSTRAINT`.
Skills: drizzle-orm-patterns
Depends on: —

### T-3 — Finding grouping (pure)
AC: AC-9
Files: `server/src/modules/reviews/multi-run/constants.ts`, `server/src/modules/reviews/multi-run/grouping.ts`, `server/src/modules/reviews/multi-run/grouping.test.ts`
Signatures: `titleWords(title: string): Set<string>` · `titleSimilarity(a: string, b: string): number` · `rangesOverlap(a: FindingSpan, b: FindingSpan): boolean` · `groupFindings(runs: { runId: string; findings: GroupMember[] }[], threshold = SIMILARITY_THRESHOLD): { representative: GroupMember; members: GroupMember[] }[]` (the caller passes finished runs only, in launch order)
Test: `grouping.test.ts` —
- `titleWords lower-cases, splits on non letter/digit, drops empties` (`"SSRF: fetch(url)!"` → `{ssrf, fetch, url}`; Cyrillic letters are kept)
- `titleSimilarity is the Jaccard index and 0 for two empty titles`
- `SIMILARITY_THRESHOLD is 0.3`
- `same file, overlapping lines, similar titles from two agents → one group`
- `same file, overlapping lines 153–188, titles "unfinished review" vs "SSRF in fetch" → two groups (EC-7)`
- `different files never group whatever the title (A-4)`
- `touching ranges 10–12 and 12–14 overlap; 10–12 and 13–14 do not`
- `a finding without end_line covers only start_line (EC-9)`
- `two matching findings of the same agent never share a group (EC-8)`
- `single-link: C joins the group via its match with B even though C does not match A`
- `a finding joins the first eligible group in input order`
- `representative is the highest severity; a tie keeps the first in input order`
- `input arrays are not mutated` (deep-frozen fixtures)
- `deterministic: the same input twice gives deep-equal output`
Verify: `pnpm exec vitest run src/modules/reviews/multi-run/grouping.test.ts` in `server/`
Skills: onion-architecture, typescript-expert
Depends on: T-1

### T-4 — Cells, conflicts and run summary (pure)
AC: AC-10, AC-7, AC-12
Files: `server/src/modules/reviews/multi-run/disagreements.ts`, `disagreements.test.ts`, `server/src/modules/reviews/multi-run/run-summary.ts`, `run-summary.test.ts`
Signatures: `buildCells(groups, runs: { runId: string; status: string | null }[]): FindingGroup[]` · `isConflict(cells: GroupCell[], members: GroupMember[]): boolean` · `isInProgress(status: string | null): boolean` · `multiRunStatus(statuses): MultiRunStatus` · `usageTotals(runs): { tokens_in; tokens_out; cost_usd: number | null }` · `wallClockMs(startedAt: Date, runs: { status; finishedAt: Date | null }[]): number | null`
Test:
- `disagreements.test.ts`:
  - `one cell per agent run in launch order`
  - `done agent with a member → its severity; done without → did_not_flag`
  - `failed and cancelled → failed (EC-12); queued/running/null → pending`
  - `conflict when a finished agent did not flag it`
  - `conflict when member severities differ`
  - `no conflict when all agree on one severity`
  - `pending and failed never make a conflict (A-13)`
  - `one finished agent + failed others → no group is a conflict (EC-6)`
- `run-summary.test.ts`:
  - `running while any run is queued/running/null`
  - `failed when every run is failed or cancelled (EC-4)`
  - `done otherwise (mixed done + failed)`
  - `totals add known tokens and costs; unknown cost adds nothing; all unknown → null`
  - `wall-clock is null while in progress`
  - `wall-clock = latest finish − start`
Verify: `pnpm exec vitest run src/modules/reviews/multi-run/disagreements.test.ts src/modules/reviews/multi-run/run-summary.test.ts` in `server/`
Skills: onion-architecture, typescript-expert
Depends on: T-1, T-3

### T-5 — Per-agent estimate (pure)
AC: AC-6
Files: `server/src/modules/reviews/multi-run/estimate.ts`, `estimate.test.ts`
Signature: `estimateAgent(rows: { durationMs: number | null; costUsd: number | null }[]): { duration_ms: number | null; cost_usd: number | null; runs: number }`. It uses at most the first `ESTIMATE_WINDOW` rows; the repository already passes them newest first.
Test: `estimate.test.ts` —
- `mean duration and mean cost of the given finished runs`
- `uses only the 10 newest rows when given 12`
- `mean cost ignores rows with unknown cost (A-6)`
- `no rows → both null ("—", EC-15)`
- `every cost unknown → cost null, duration still a mean (EC-15)`
Verify: `pnpm exec vitest run src/modules/reviews/multi-run/estimate.test.ts` in `server/`
Skills: typescript-expert
Depends on: T-1

### T-6 — Concurrent agent execution with failure isolation
AC: AC-4, AC-5
Files: `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/run-executor.test.ts`
Change: replace the loop at `run-executor.ts:155-186` with `await Promise.allSettled(jobs.map(job => runJob(job)))`. Each `runJob` keeps today's body: start log, `runOneAgent`, done log, and the `catch` that only logs. The diff load (`:108-118`) and `ensureForReview` (`:127-135`) stay before the fan-out and run once. `failAll` (`:86-106`) and the per-run trace-before-status order (`:395-410`, `:420-434`) are unchanged. `RunLogger.forRun` builds a new instance per run (`server/src/platform/run-logger.ts:45-47`), so concurrent runs do not share mutable logger state. Both `{all}` and `{agentIds}` go through this one path.
Test: `run-executor.test.ts`, new `describe('ReviewRunExecutor — concurrent agents')`, built like `writesFor` (`:246-272`) with two agents of distinct ids and names:
- `starts every agent's model call before any of them finishes (AC-4)`: `container.llm` returns a stub whose `completeStructured` records `started++`, then awaits a gate. The gate opens when `started === 2`, or after 500 ms as a fallback. Assert the max observed `started` (before any call resolved) is 2.
- `loads the diff once for two agents (AC-4)`: a `git.diff` spy is called once and `getPrFiles` is not called.
- `one agent failing does not stop the other (AC-5)`: agent A's provider throws `'provider down'` and agent B succeeds. Assert `completeAgentRun` was called with `failed` (and `error: 'provider down'`) for run A and with `done` for run B, `insertReview` was called once for run B, and the result does not depend on whether A is listed first.
- `a cancelled agent ends as cancelled while the other completes (AC-5)`: `runBus.cancel('run-a')` before execution → A `cancelled`, B `done`.
- The existing suites at `:137-372` stay green unchanged (the "trace is stored before the terminal status" order included).
Verify: `pnpm exec vitest run src/modules/reviews/run-executor.test.ts` in `server/`
Skills: onion-architecture, typescript-expert
Depends on: —

### T-7 — Multi-run repository
AC: — (enables T-8, T-9 for AC-1, AC-6, AC-7, AC-12)
Files: `server/src/modules/reviews/repository/multi-run.repo.ts`, `server/src/modules/reviews/repository/run.repo.ts`, `server/src/modules/reviews/repository.ts`
Signatures (functions take `db` first, as in `run.repo.ts`; `ReviewRepository` gets same-named delegating methods):
- `createMultiRun(db, { workspaceId, prId }): Promise<{ id: string; ranAt: Date }>`
- `getMultiRun(db, workspaceId, id)`: `multi_agent_runs` inner join `pull_requests` (number, title, repoId), scoped on `multi_agent_runs.workspace_id`.
- `agentRunsForMultiRun(db, multiRunId)`: `agent_runs` `leftJoin agents` for the name (null for a deleted agent, EC-3), ordered `ran_at asc, id asc`.
- `reviewsWithFindingsForRuns(db, runIds)`: `reviews` with `run_id in runIds` and `kind = 'review'`, plus their findings ordered `file, start_line, id`, plus `created_at`.
- `listMultiRuns(db, workspaceId, { prId?, limit })`: `ran_at desc`, `limit`, joined with the pull. A second query loads their agent runs with `inArray`, plus agent names.
- `finishedLocalRuns(db, workspaceId, agentId, limit)`: `status = 'done' and source = 'local'`, `ran_at desc`, `limit`.
- `createAgentRun` (`run.repo.ts:117-140`) gets an optional `multiAgentRunId?: string | null` and writes it.
Rules: every join that goes through `reviews.run_id` is a `leftJoin` (server INSIGHTS 2026-09-20).
Test: covered by `multi-run.it.test.ts` (T-9). Unit tests for the logic use a mocked `ReviewRepository` (T-8).
Verify: `pnpm typecheck` in `server/`
Skills: drizzle-orm-patterns, onion-architecture
Depends on: T-2

### T-8 — `MultiRunService`: launch, read, list, estimates
AC: AC-1, AC-2, AC-6, AC-7, AC-12
Files: `server/src/modules/reviews/multi-run/multi-run-service.ts`, `multi-run-service.test.ts`, `server/src/modules/reviews/service.ts`
Signatures: `new MultiRunService(container, repo: ReviewRepository, reviews: ReviewService)` ·
- `resolveTargets(workspaceId, agentIds): Promise<AgentRow[]>` (request order; `ValidationError` for any id outside `listEnabled`)
- `launch(workspaceId, prId, agentIds, logger): Promise<MultiRunLaunchResponse>`
- `get(workspaceId, id): Promise<MultiRunDetail>`
- `list(workspaceId, prId?): Promise<MultiRunList>`
- `estimates(workspaceId): Promise<AgentEstimates>`
Change in `service.ts`: `runReview` (`:109-144`) gets an optional `opts?: { multiAgentRunId?: string }`, passed to `createAgentRun`. With no `opts`, behaviour is identical to today. `launch` = `resolveTargets` → `getPull`/`getRepo` (404) → `createMultiRun` → `reviews.runReview(…, { multiAgentRunId })`, then return `{ pr_id, runs, reviews: [], multi_run_id }`. `get` puts T-3/T-4 together: `findingRowToDto` (`helpers.ts:39-58`) + `run_id` gives `GroupMember`, and `finishedAt` per run is the review's `createdAt` else `ranAt + durationMs`.
Test: `multi-run-service.test.ts` (mocked `ReviewRepository`, `agentsRepo`, and a `ReviewService` stub that records `runReview` calls; no DB) —
- `launch with 3 enabled agents creates one multi run and calls runReview once with the targets in request order and its multiAgentRunId (AC-1)`
- `launch returns multi_run_id together with the created runs (AC-1)`
- `an id that is disabled, unknown or of another workspace → ValidationError and neither createMultiRun nor runReview is called (AC-2, A-11)`
- `the error message is the same whichever id is wrong (A-11)`
- `a missing pull → NotFoundError and nothing is created`
- `get of a multi run getMultiRun does not return → NotFoundError (EC-13)`
- `get returns pr, status, started_at, wall_clock_ms, totals and one agent entry per run in launch order with duration, tokens, cost, findings_count, score (AC-7)`
- `get groups only findings of done runs and returns cells per run (AC-7, AC-9, AC-10)`
- `get with every run failed → status failed, groups [] (EC-4)`
- `get with a deleted agent → agent_name null, its findings still grouped (EC-3)`
- `list passes limit 20 and keeps the repository's newest-first order, each with pr, agents, status, wall-clock, cost, started_at (AC-12)`
- `estimates returns one entry per enabled agent from its last 10 finished local runs (AC-6)`
Verify: `pnpm typecheck && pnpm exec vitest run src/modules/reviews/multi-run/multi-run-service.test.ts` in `server/`
Skills: onion-architecture, zod
Depends on: T-1, T-3, T-4, T-5, T-7

### T-9 — Routes + route integration test
AC: AC-1, AC-2, AC-3, AC-7, AC-12
Files: `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/multi-run/routes.ts`, `server/src/modules/reviews/multi-run/multi-run.it.test.ts`
Change:
- `POST /pulls/:id/review` (`routes.ts:30-47`): `const raw = req.body ?? {}`. If `raw` has its own `agentIds` key, call `MultiRunRequest.parse(raw)` and then `multiRuns.launch(...)`. Otherwise run the existing lines unchanged. The `rateLimit` config stays on the one route, so it covers both (NFR-6).
- `reviewsRoutes` registers `./multi-run/routes.js` with `app.register(...)`. That plugin declares the three GETs with `params` / `querystring` / `response` schemas. No change to `server/src/modules/index.ts`.
Test: `server/src/modules/reviews/multi-run/multi-run.it.test.ts` (testcontainers; setup copied from `server/test/reviews.it.test.ts:12-13,63-129` and `brief.it.test.ts:4-12`; `waitForPrRuns` from `server/test/helpers/runs.ts:14-34`) —
- `POST {agentIds:[a,b,c]} → 200 with multi_run_id and 3 runs; 3 agent_runs rows carry that multi_agent_run_id (AC-1)`
- `POST with 1 id, 6 ids or a duplicate → 422, multi_agent_runs and agent_runs counts unchanged (AC-2)`
- `POST naming a disabled agent or an agent of a second workspace → 422, nothing created (AC-2)`
- `POST {agentId} and POST {all:true} → the same keys as before (pr_id, runs, reviews), no multi_run_id, no multi_agent_runs row, link null (AC-3)`
- `GET /multi-runs/:id after the runs settle → pr, status done, wall_clock_ms, totals, 2 agent entries, groups with cells (AC-7)`
- `GET /multi-runs/:id of another workspace → 404 (EC-13)`
- `GET /multi-runs after 21 launches → 20 items, newest first; ?pr_id narrows to that PR (AC-12)`
- `GET /multi-runs/estimates → one entry per enabled agent, numbers after a finished run, null before (AC-6)`
- `deleting a multi run keeps its agent runs and clears their link (NFR-5, EC-14)`
- The existing `server/test/reviews.it.test.ts` stays green (AC-3 regression).
DB note: like every existing `*.it.test.ts`, this starts its **own throwaway** `pgvector/pgvector:pg16` container on a random port and applies all migrations, including the generated `0015`, through `runMigrations` (`server/test/helpers/pg.ts:35-53`). It never touches the shared dev Postgres or ports 5432/3001, and it self-skips without Docker (`pg.ts:23-33`). It does not need `db:migrate` on any shared DB.
Verify: `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/` (required). With Docker available: `pnpm exec vitest run src/modules/reviews/multi-run/multi-run.it.test.ts test/reviews.it.test.ts` in `server/`.
Skills: fastify-best-practices, onion-architecture, zod, drizzle-orm-patterns
Depends on: T-6, T-8

**Server group gate:** `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/`. Plus, when Docker is available, `pnpm exec vitest run .it.test` in `server/` (throwaway testcontainers only). The generated migration is grep-checked as in T-2.

### Group: client

### T-10 — Multi-run data hooks
AC: AC-1, AC-6, AC-8, AC-12
Files: `client/src/lib/hooks/multi-agent.ts`, `client/src/lib/hooks/multi-agent.test.ts`, `client/src/lib/hooks/index.ts` (+1 line)
Signatures (contract types `import type` only):
- `useAgentEstimates()` → `["multi-run-estimates"]`, `GET /multi-runs/estimates`
- `useLaunchMultiRun()` → mutation `({ prId, agentIds }) => api.post<MultiRunLaunchResponse>(`/pulls/${prId}/review`, { agentIds })`; on success it invalidates `["multi-runs"]`, `["reviews", prId]`, `["pr-runs", prId]`
- `useMultiRun(id)` → `["multi-run", id]`, polling as in Decisions; exports `MULTI_RUN_POLL_MS` and `hasInProgress(detail)`
- `useMultiRuns(prId?)` → `["multi-runs", prId ?? "all"]`, `GET /multi-runs` or `?pr_id=`
- `useMultiRunFindingAction(multiRunId)` → wraps `useFindingAction` (`client/src/lib/hooks/reviews.ts:173-195`) and also invalidates `["multi-run", multiRunId]`
Pattern: `client/src/lib/hooks/brief.ts` / `brief.test.ts:7-45` (mock `../api`, `QueryClientProvider` wrapper).
Test: `multi-agent.test.ts` —
- `useLaunchMultiRun posts { agentIds } to /pulls/:id/review and resolves multi_run_id (AC-1)`
- `useMultiRun re-requests every 2 s while an agent run is running (AC-8)`: fake timers; after `advanceTimersByTime(2000)` there are 2 GETs, after another 2000 there are 3.
- `useMultiRun stops re-requesting once no agent run is in progress (AC-8)`: the second response is all done/failed, and `advanceTimersByTime(6000)` adds no GET.
- `a failed re-request keeps the last data and keeps polling (EC-11)`
- `useMultiRuns(prId) requests /multi-runs?pr_id=…; without prId requests /multi-runs (AC-12)`
- `useAgentEstimates requests /multi-runs/estimates (AC-6)`
Verify: `pnpm typecheck && pnpm exec vitest run src/lib/hooks/multi-agent.test.ts` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-1

### T-11 — `MultiAgentPicker` (shared component) + messages
AC: AC-6, AC-1
Files: `client/messages/en/multiAgent.json`, `client/src/components/multi-agent/index.ts`, `client/src/components/multi-agent/MultiAgentPicker/{MultiAgentPicker.tsx,index.ts,constants.ts,helpers.ts,styles.ts,MultiAgentPicker.test.tsx,helpers.test.ts}`
Not touched: `client/src/components/showcase/**` (user decision 2026-10-16: not needed for the homework, shared file).
Props (presentational, no data hooks): `{ estimates: AgentEstimate[] | undefined; loading: boolean; selected: string[]; onChange(ids: string[]): void; onLaunch(): void; launching: boolean; error: string | null }`
Helpers: `totalEstimate(estimates, selected): { cost_usd: number | null; duration_ms: number | null }` (sum / max over values that exist, `null` when none) · `toggle(selected, id, max = MAX_AGENTS): string[]` (keeps request order; refuses a sixth) · `canLaunch(n) = MIN_AGENTS ≤ n ≤ MAX_AGENTS` · `formatCost` / `formatDuration` with `"—"` for `null`. `constants.ts`: `MIN_AGENTS = 2`, `MAX_AGENTS = 5`.
Messages (`multiAgent.json`, camelCase keys): `picker.title`, `picker.estimate`, `picker.total`, `picker.launch` (`"Run multi-agent review ({count})"`), `picker.max`, `picker.needTwo`, `picker.none`, `picker.loading`, `picker.dash`, plus the page keys used by T-12 to T-14 (`page.*`, `column.*`, `groups.*`, `disagree.*`, `cell.*`, `list.*`, `newRun.*`, `link.latest`, `column.deletedAgent`, `error.*`). The `Checkbox` has no `disabled` prop (`client/src/vendor/ui/kit/Checkbox.tsx:5-16`), so the cap is enforced in `toggle` and explained by `picker.max`.
Test:
- `helpers.test.ts`:
  - `totalEstimate sums cost and takes the max duration of the ticked agents (AC-6)`
  - `totalEstimate skips agents with "—" and is null when none has a value (EC-15)`
  - `toggle refuses a sixth agent and keeps order`
  - `canLaunch is true only for 2..5`
- `MultiAgentPicker.test.tsx` (messages from the imported `multiAgent.json`):
  - `lists one checkbox per estimate with its cost and duration, "—" when null (AC-6)`
  - `shows the total for the ticked agents (AC-6)`
  - `launch button reads "Run multi-agent review (N)" and is disabled for N<2 and enabled for 2..5 (NFR-1)`
  - `a sixth tick does not change the selection and shows the max hint`
  - `with fewer than 2 estimates the button stays disabled and needTwo is shown (EC-1)`
  - `clicking launch calls onLaunch once (AC-1)`
  - `error prop is shown and the selection is kept (EC-2)`
- `client/src/test/smoke.test.tsx` still mounts the gallery with the new group (intl provider only, no QueryClient).
Verify: `pnpm typecheck && pnpm exec vitest run src/components/multi-agent src/test/smoke.test.tsx` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-1

### T-12 — PR page: picker in `RunReviewDropdown` + link to the latest multi run
AC: AC-1, AC-2, AC-3
Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/{RunReviewDropdown.tsx,constants.ts,styles.ts,RunReviewDropdown.test.tsx}`
Change:
- The `items` array (`RunReviewDropdown.tsx:63-82`) keeps `runAll` and the per-agent items byte for byte. One item, `t("picker.open")` from `multiAgent`, is added after `runAll` and sets `pickerOpen`.
- While `pickerOpen`, a `Modal` renders `MultiAgentPicker` fed by `useAgentEstimates()`. The selection lives in this component's state.
- `onLaunch` → `useLaunchMultiRun().mutateAsync({ prId, agentIds: selected })` → `router.push(`/multi-agent/${res.multi_run_id}`)` (A-9). On error the modal stays open with a fixed message: `error.invalidAgents` for `ApiError.code === "validation_error"`, otherwise `error.launch`. The selection is kept (EC-2). Server text is never rendered.
- Beside the trigger: `useMultiRuns(prId)`. When `data?.[0]` exists, render a `next/link` to `/multi-agent/${id}` with `t("link.latest")`; otherwise render nothing (NFR-3, EC-16).
Test: `RunReviewDropdown.test.tsx` (extend the existing mocks at `:6-14` with `../../../../../../../lib/hooks/multi-agent`; add `multiAgent` messages) —
- keep `renders the trigger label`
- `single agent item still calls useRunReview with { prId, agentId } only (AC-3)`
- `opening "Multi-agent review…" shows the picker with the estimates`
- `launching with two ticked agents posts { prId, agentIds } in tick order and navigates to /multi-agent/<multi_run_id> (AC-1)`
- `a validation_error keeps the modal open, shows the invalid-agents copy and keeps the ticks (AC-2, EC-2)`
- `a link to the latest multi run is shown when useMultiRuns returns one; absent when empty (NFR-3, EC-16)`
Verify: `pnpm typecheck && pnpm exec vitest run "src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown"` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library, next-best-practices
Depends on: T-10, T-11

### T-13 — Multi-Agent Review page `/multi-agent/[id]`
AC: AC-7, AC-8, AC-9, AC-10, AC-11
Files: `client/src/app/multi-agent/[id]/page.tsx`; `client/src/app/multi-agent/[id]/_components/{MultiRunView,AgentColumns,FindingGroups,DisagreementsSection}/*` (each: `<Name>.tsx`, `index.ts`, `styles.ts`, optional `constants.ts`/`helpers.ts`, `<Name>.test.tsx`)
Change:
- `page.tsx`: `"use client"`, `useParams<{ id: string }>()`, `AppShell` with a crumb, renders `MultiRunView`. The pattern follows `client/src/app/agents/[id]/page.tsx:17-56`.
- `MultiRunView`: calls `useMultiRun(id)`. It shows a loading placeholder, a full `ErrorState` only when there is no data, and an inline notice when `isError && data` (EC-11). The header holds PR `#number title`, agent names, wall-clock (`"—"` when null), total tokens, total cost and a status badge. Then it renders the three sections.
- `AgentColumns` (props: `agents`, `prNumber`): one column per agent with status, duration, tokens, cost, findings count and score. The name is `column.deletedAgent` when `agent_name` is null (EC-3). The run's `error` is shown as text. "View trace" sets `selectedRunId` and renders `RunTraceDrawer` (default export of `…/pulls/[number]/_components/RunTraceDrawer`) with `running={isInProgress(status)}`, one at a time (NFR-4). "Cancel" appears only while in progress and calls `useCancelRun` (`reviews.ts:104-108`) (A-12).
- `FindingGroups` (props: `groups`, `agents`, `multiRunId`): each row shows the representative's severity, title, `file:start–end` and the agents in the group. Expanding it renders each member's `FindingCard` with `onAction` → `useMultiRunFindingAction(multiRunId)` and `extraAction={<EvalCaseButton finding={m} />}`, the same wiring as `FindingsPanel.tsx:121-130`. Empty state `groups.empty` (EC-5).
- `DisagreementsSection` (props: `groups`, `agents`): a matrix with groups as rows and agents as columns, cells from `cell.*` messages, and a conflict marker. A `Toggle` "Show only conflicts" (local state) filters with `helpers.ts` `visibleGroups(groups, onlyConflicts)`, derived in render with no effect. No "why" text (NG3). Empty states: `disagree.empty` (no groups) and `disagree.noConflicts` (toggle on, none).
- All titles, descriptions and PR titles are rendered as React text nodes (NFR-9).
Test:
- `MultiRunView.test.tsx` (mock `@/lib/hooks/multi-agent`):
  - `renders the header with PR, agents, wall-clock "—" while running, tokens, cost, status (AC-7)`
  - `renders one column per agent with duration, tokens, cost, findings count, score (AC-7)`
  - `keeps the last data and shows the notice when the re-request failed (EC-11)`
  - `loading placeholder before the first data`
- `AgentColumns.test.tsx`:
  - `"View trace" opens RunTraceDrawer for that run with running=true only for an in-progress run (NFR-4)` (mock the drawer)
  - `deleted agent label when agent_name is null (EC-3)`
- `FindingGroups.test.tsx`:
  - `shows the representative and the group's agents; expanding shows one FindingCard per member (AC-9)`
  - `Accept on a member calls the finding action with its id`
  - `a title containing <img src=x onerror=…> renders as text, no img (NFR-9)`
  - `empty state with zero groups (EC-5)`
- `DisagreementsSection.test.tsx`:
  - `one cell per agent with severity / did not flag / failed / pending copy (AC-10)`
  - `conflict groups are marked (AC-10)`
  - `"Show only conflicts" on → only conflict groups; off → all again (AC-11)`
  - `toggling issues no request` (the `api` module mock's `get` is not called and the `useMultiRun` mock is not re-invoked with new args) (AC-11)
  - `toggle on with no conflicts → noConflicts empty state`
- AC-8 wiring is proven by `multi-agent.test.ts` (T-10). This page only consumes `useMultiRun`.
Verify: `pnpm typecheck && pnpm exec vitest run src/app/multi-agent` in `client/`
Skills: frontend-architecture, next-best-practices, react-best-practices, react-testing-library
Depends on: T-10, T-11

### T-14 — `/multi-agent` list, "New multi-agent review", sidebar item
AC: AC-12, AC-1
Files: `client/src/app/multi-agent/page.tsx`; `client/src/app/multi-agent/_components/{MultiRunListView,NewMultiRunDialog}/*`; `client/src/vendor/ui/nav.ts` (+1 line)
Change:
- `MultiRunListView`: `useMultiRuns()`. A table with PR `#number title`, agent names, status, wall-clock (`"—"`), cost (`"—"`) and start time, each row linking to `/multi-agent/[id]`. Plus loading and empty states and a "New multi-agent review" button (distinct label from the empty-state CTA, client INSIGHTS 2026-09-22).
- `NewMultiRunDialog`: a `Modal`. Step 1 picks a repo (`useRepos`) and a PR (`usePulls(repoId)`, `client/src/lib/hooks/core.ts:65-110`). Step 2 is `MultiAgentPicker` with `useAgentEstimates`; launch uses `useLaunchMultiRun`, then `router.push(`/multi-agent/${multi_run_id}`)`. Errors are handled as in T-12.
- `nav.ts:21-29`: append to WORKSPACE `{ key: "multi-agent", label: "Multi-Agent Review", icon: "Layers", href: "/multi-agent" }`. `activeKeyFor` already maps the path (`client/src/components/app-shell/helpers.ts:28`), and `shell.json:26` has the label.
Test:
- `MultiRunListView.test.tsx`:
  - `renders one row per run in the order received with PR, agents, status, wall-clock, cost, start time (AC-12)`
  - `each row links to /multi-agent/<id>`
  - `empty state when the list is empty`
  - `"New multi-agent review" opens the dialog`
- `NewMultiRunDialog.test.tsx`:
  - `after choosing a PR the picker is shown; launching posts that PR id with the ticked agentIds and navigates (AC-1, A-9)`
Verify: `pnpm typecheck && pnpm exec vitest run src/app/multi-agent` in `client/`
Skills: frontend-architecture, next-best-practices, react-best-practices, react-testing-library
Depends on: T-10, T-11

**Client group gate:** `pnpm typecheck && pnpm test && pnpm build` in `client/`.

## Traceability

| AC | task(s) | test (file › case) |
|---|---|---|
| AC-1 | T-1, T-2, T-7, T-8, T-9, T-10, T-11, T-12, T-14 | `multi-run-service.test.ts` › launch with 3 enabled agents creates one multi run and calls runReview … with its multiAgentRunId; `multi-run.it.test.ts` › POST {agentIds:[a,b,c]} → 200 with multi_run_id and 3 runs …; `multi-agent.test.ts` › useLaunchMultiRun posts { agentIds }; `RunReviewDropdown.test.tsx` › launching with two ticked agents posts … and navigates; manual: launch on PR #21 and land on `/multi-agent/<id>` |
| AC-2 | T-1, T-8, T-9, T-12 | `contract.test.ts` › MultiRunRequest rejects 1 id, 6 ids, a duplicate and a non-uuid; `multi-run-service.test.ts` › an id that is disabled, unknown or of another workspace → ValidationError and nothing is created; `multi-run.it.test.ts` › POST with 1 id, 6 ids or a duplicate → 422, counts unchanged; `RunReviewDropdown.test.tsx` › a validation_error keeps the modal open … |
| AC-3 | T-9, T-12 | `multi-run.it.test.ts` › POST {agentId} and POST {all:true} → the same keys as before, no multi_run_id, no multi_agent_runs row; `RunReviewDropdown.test.tsx` › single agent item still calls useRunReview with { prId, agentId } only; `server/test/reviews.it.test.ts` stays green |
| AC-4 | T-6 | `run-executor.test.ts` › starts every agent's model call before any of them finishes; › loads the diff once for two agents |
| AC-5 | T-6 | `run-executor.test.ts` › one agent failing does not stop the other; › a cancelled agent ends as cancelled while the other completes |
| AC-6 | T-5, T-8, T-9, T-10, T-11 | `estimate.test.ts` › mean duration and mean cost …, › no rows → both null; `multi-run-service.test.ts` › estimates returns one entry per enabled agent …; `helpers.test.ts` (MultiAgentPicker) › totalEstimate sums cost and takes the max duration; `MultiAgentPicker.test.tsx` › lists one checkbox per estimate … "—" when null |
| AC-7 | T-1, T-4, T-8, T-9, T-13 | `run-summary.test.ts` › wall-clock = latest finish − start, › totals add known tokens and costs; `multi-run-service.test.ts` › get returns pr, status, started_at, wall_clock_ms, totals and one agent entry per run …; `multi-run.it.test.ts` › GET /multi-runs/:id after the runs settle …; `MultiRunView.test.tsx` › renders the header …, › renders one column per agent … |
| AC-8 | T-10, T-13 | `multi-agent.test.ts` › useMultiRun re-requests every 2 s while an agent run is running; › stops re-requesting once no agent run is in progress; manual: on a running multi run, the Network tab shows `GET /multi-runs/<id>` every ~2 s and stops after the last agent finishes |
| AC-9 | T-3, T-8, T-13 | `grouping.test.ts` › same file, overlapping lines, similar titles … → one group; › … "unfinished review" vs "SSRF in fetch" → two groups; › two matching findings of the same agent never share a group; › representative is the highest severity …; › input arrays are not mutated; `FindingGroups.test.tsx` › shows the representative … expanding shows one FindingCard per member |
| AC-10 | T-4, T-8, T-13 | `disagreements.test.ts` › one cell per agent run in launch order; › conflict when a finished agent did not flag it; › conflict when member severities differ; › pending and failed never make a conflict; `DisagreementsSection.test.tsx` › one cell per agent with severity / did not flag / failed / pending copy |
| AC-11 | T-13 | `DisagreementsSection.test.tsx` › "Show only conflicts" on → only conflict groups; off → all again; › toggling issues no request |
| AC-12 | T-1, T-4, T-7, T-8, T-9, T-10, T-14 | `multi-run-service.test.ts` › list passes limit 20 and keeps … newest-first order …; `multi-run.it.test.ts` › GET /multi-runs after 21 launches → 20 items, newest first; `multi-agent.test.ts` › useMultiRuns(prId) requests /multi-runs?pr_id=…; `MultiRunListView.test.tsx` › renders one row per run … |

Every task appears in at least one row. T-2 and T-7 are wiring (no AC of their own) and enable AC-1, AC-6, AC-7 and AC-12 through T-8 and T-9.

## Skills for the implementer

| skill | task(s) | why |
|---|---|---|
| zod | T-1, T-8, T-9 | contract shapes, `refine` for distinct ids, inferred types, response schemas |
| drizzle-orm-patterns | T-2, T-7, T-9 | nullable FK with `set null`, `db:generate`, left joins, `inArray`, ordering, limit |
| onion-architecture | T-3, T-4, T-6, T-7, T-8, T-9 | route → service → repository; pure helpers have no I/O; executor stays the only runner |
| fastify-best-practices | T-9 | nested plugin registration, `params`/`querystring`/`response` schemas, rate-limit config, error envelope |
| typescript-expert | T-3, T-4, T-5, T-6 | pure-function typing, drizzle self-reference typing if needed |
| frontend-architecture | T-10, T-11, T-12, T-13, T-14 | `_components/<Name>/` layout, cross-route `src/components/multi-agent`, hooks-only data, the `multiAgent` namespace (no showcase entry) |
| react-best-practices | T-10, T-11, T-12, T-13, T-14 | derived filter state (no effect), controlled selection, polling in the query, one drawer at a time |
| react-testing-library | T-10, T-11, T-12, T-13, T-14 | hook tests with fake timers, component tests reading copy from `multiAgent.json` |
| next-best-practices | T-12, T-13, T-14 | client pages with `useParams`, `useRouter().push`, `next/link` |
| engineering-insights | any | record a non-obvious finding (e.g. TanStack polling after an error, drizzle self-reference) |

## Risks

| risk | where (file:line) | mitigation |
|---|---|---|
| Migrations: a hand edit corrupts the journal | root `CLAUDE.md` "Do not touch"; `server/AGENTS.md` | T-2 edits only `db/schema/runs.ts` and runs `pnpm db:generate`. The `.sql`, `_journal.json` and snapshot are committed unchanged. `db:migrate` is never run during `/run-plan`. |
| drizzle-kit prompts or drops on a mixed diff | server INSIGHTS 2026-09-22 (`INSIGHTS.md:63-65`) | the change is add-only (one column plus one FK). T-2 greps the generated file for `drop` / `rename`, which must find nothing. |
| `agentRuns` references the later-declared `multiAgentRuns` | `server/src/db/schema/runs.ts:8-33,43-52` | lambda reference; `AnyPgColumn` return annotation only if `tsc` complains |
| Route tests need a migrated DB while shared Postgres and ports are off-limits | `docs/hw7/requirements.md` "Гілки й порядок мержу"; `server/test/helpers/pg.ts:35-53` | the route test is a `*.it.test.ts` on a throwaway testcontainers DB (random port, own migrations, self-skip without Docker), the same as every existing `*.it.test.ts`. The unit gate (`--exclude '**/*.it.test.ts'`) proves every AC's logic without Docker. |
| Rows are created as `running`, not "queued" | `server/src/modules/reviews/repository/run.repo.ts:135`; `:28,98,109` | decision: keep `running`; `isInProgress` treats `null`/`queued`/`running` as in progress (spec Definitions) |
| Concurrency breaks trace-before-status ordering or logging | `run-executor.ts:155-186,395-410,420-434`; server INSIGHTS 2026-10-14 (`INSIGHTS.md:44-46`) | the per-run body is unchanged and `forRun` builds a fresh logger per run (`run-logger.ts:45-47`); the existing order tests stay green |
| Up to 5 concurrent model calls with no deadline | server INSIGHTS 2026-10-15 (`INSIGHTS.md:66-68,105-108`) | accepted: same per-agent behaviour as today; per-run cancel stays available (A-12) |
| An in-handler body parse looks like the banned pattern | server INSIGHTS 2026-10-14 (`INSIGHTS.md:47-49`); `server/specs/review-flow.md:38-43` | this route is the documented exception; a `ZodError` still maps to 422 (`app.ts:161-174`); no `safeParse` + manual 400 |
| `RunRequest` strips `agentIds`, so a naive change misroutes | `server/src/vendor/shared/contracts/platform.ts:273-277` | branch on the raw body's own `agentIds` key before `RunRequest.parse`; `platform.ts` untouched |
| Name collision with the legacy `MultiAgentRun` / `Conflict` exports | `server/src/vendor/shared/contracts/observability.ts:75-86` | new names only (`MultiRun*`, `FindingGroup`, …); legacy schemas untouched |
| The two vendor copies drift | root `CLAUDE.md` Cross-package gotchas | T-1 writes both copies and adds a byte-identity test |
| A runtime import from `@devdigest/shared` breaks the client build | `specs/pr-brief/plan.md` Risks (client uses `import type`) | client code imports contract types only; limits live in `MultiAgentPicker/constants.ts` |
| Findings have no insertion-order column | `server/src/db/schema/reviews.ts:29-47` | decision: within a run the order is `file, start_line, id`, which is deterministic (NFR-7) |
| `end_line` is `NOT NULL` in the DB but EC-9 assumes it can be missing | `server/src/db/schema/reviews.ts:36`; `contracts/findings.ts:53-54` | grouping reads `end_line ?? start_line` and also treats `end_line < start_line` as `start_line` |
| No finish timestamp per run; `durationMs` excludes the shared preparation | `run-executor.ts:200,355`; `runs.ts:15-18` | decision: finish = the review's `created_at` for done runs, else `ranAt + durationMs` (a failed run's finish is under-estimated by the preparation time) |
| An inner join drops reviews whose run was deleted | server INSIGHTS 2026-09-20 (`INSIGHTS.md:31-33`); `review.repo.ts:69-76` | every join through `reviews.run_id` is a `leftJoin` |
| Picker sits in a modal opened from the dropdown, not inline checkboxes in the menu | `client/src/vendor/ui/kit/Dropdown.tsx:12-15`; `kit/types.ts:5-16` | design-system change is outside Part A's files; NFR-1's content is kept and NG10 waives pixel parity. Recorded as a deviation from the literal "in the dropdown". |
| **Outside the ownership list:** the `/multi-agent/[id]` page imports page-local `FindingCard`, `EvalCaseButton` and `RunTraceDrawer` from `pulls/[number]/_components` (layering violation) | `.claude/skills/frontend-architecture/SKILL.md:109`; `client/src/app/repos/[repoId]/pulls/[number]/_components/{FindingCard,EvalCaseButton,RunTraceDrawer}` | NFR-2 requires these existing components. Moving them to `src/components/` is a refactor of PR-page files outside Part A, so they are imported read-only and unchanged. Follow-up: promote them. |
| No showcase entry for `MultiAgentPicker`, although `client/AGENTS.md` asks for one | `client/AGENTS.md` ("New or changed UI component → showcase") | user decision 2026-10-16: shared file, not needed for the homework; a follow-up can add it |
| Shared files edited by both features | `server/src/vendor/shared/index.ts:17-29`, `client/src/vendor/shared/index.ts:17-29`, `client/src/lib/hooks/index.ts:4-15`, `client/src/vendor/ui/nav.ts:21-29` | exactly one appended line each; `server/src/modules/index.ts` untouched (the routes register inside `reviews`) |
| Polling stops after an error | `client/src/lib/hooks/reviews.ts:29-35` pattern | `refetchInterval` reads `state.data`, which survives an error; `retry: false`; covered by the EC-11 hook test |
| Two SSE streams per column exceed the six-connection limit | NFR-4; `client/src/lib/hooks/reviews.ts:202-250` | no `useRunEvents` on the page; SSE only inside the one open `RunTraceDrawer` (`RunTraceDrawer.tsx:45-46`) |
| Correcting filter state in an effect flashes a wrong frame | client INSIGHTS 2026-09-20 (`INSIGHTS.md:13-15`) | `visibleGroups` is derived in render |
| Two buttons with one accessible name break RTL queries | client INSIGHTS 2026-09-22 (`INSIGHTS.md:65-68`) | distinct labels: "New multi-agent review" vs the empty-state CTA; "Run multi-agent review (N)" vs "Run all enabled agents" |
| `role="alert"` assertions pass for the wrong reason | client INSIGHTS 2026-09-22 (`INSIGHTS.md:36-38`) | tests assert on copy |
| New message keys look missing in a running dev server | client INSIGHTS 2026-09-20 (`INSIGHTS.md:50-53`) | hard reload during the manual check after `/run-plan` |
| `Checkbox` has no `disabled` prop | `client/src/vendor/ui/kit/Checkbox.tsx:5-16` | `toggle` refuses a sixth tick and shows a hint |
| Rate limits are off under test, so NFR-6's limit cannot be asserted in tests | `server/src/app.ts:121-123` | the launch reuses the same route and its `rateLimit` config (`routes.ts:32`); manual: 11 launches in one minute → 429 |
| Lock files | root `CLAUDE.md` "Do not touch" | no dependency change in either package |

## Out of scope

- Updating `server/README.md` (API map), `server/specs/review-flow.md`, `client/README.md` and `client/specs/pages.md`. No AC needs it; worth a follow-up after the merge.
- Promoting `FindingCard`, `EvalCaseButton` and `RunTraceDrawer` to `src/components/`. That is a refactor of PR-page files outside Part A; see Risks.
- A finish timestamp on `agent_runs`, or an order column for findings. NFR-5 allows only one schema change.
- Removing or reusing the legacy `MultiAgentRun` / `AgentColumn` / `Conflict` contracts in `observability.ts`. They are unused, and changing them gains nothing.
- Pre-filling the picker from previous runs, or remembering the selection across launches.
- An e2e flow, MCP exposure, and showing the multi run on the PR page beyond the one link. The requirements say no e2e.
- The live check on PR #21 (General Reviewer + Security + Performance vs. General Reviewer alone) and `docs/hw7/summary.md`. Those come after `/run-plan` and are not implementer tasks.
