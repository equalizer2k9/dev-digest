# Plan: Agent Performance Dashboard
Spec: `specs/agent-performance/spec.md` (SPEC-06, Status: approved)

## Goal

Add one server module, `agent-performance`. It serves `GET /agent-performance` and `GET /agents/:id/stats`. Both routes go through one pure aggregation over the counted runs of the workspace, so a Stats response is by construction the agent's row of the dashboard (D1). The studio gets an `/agent-performance` page (KPI cards, a per-agent table with client-side sort and row expansion, and a cost breakdown by agent and by model) and a sixth agent-editor tab, Stats. Both keep their period in the URL. No schema change, no migration, no new dependency (D13). No path reaches the model adapter (D10).

## Decisions

| # | Decision | Evidence / reason |
|---|---|---|
| D-1 | **One new module `server/src/modules/agent-performance/` owns both routes.** `/agents/:id/stats` is registered there, as `ci` already registers `/agents/:id/ci/*` in its own module. It is not added to `agents/routes.ts`. Agents are read through `container.agentsRepo` (onion rule 10). | `server/src/modules/ci/routes.ts:33-58` (precedent). `server/src/modules/index.ts:31-47` (registry). `platform/container.ts:101-103` (`agentsRepo`). Splitting the two routes across `agents` and a new module would need a cross-module import of the aggregation, or a second copy of it. One module keeps D1 true by construction. |
| D-2 | **Stats = a projection of the dashboard.** `service.stats(ws, agentId, q)` checks the agent (404), computes `performance(ws, q)` and returns `toAgentStats(perf, agent)`. It never re-aggregates one agent's runs separately. | AC-1. NFR-12 allows one workspace query per request. |
| D-3 | **The repository returns one row per run in `[from, to)`; the pure function decides what counts.** The SQL already filters on workspace, `[from, to)` and status `done`/`failed`. The pure `isCountedRun(run, ws, period)` applies the same rule again, so the status, workspace and bounds rules can be unit-tested. | AC-2. Statuses: `reviews/repository/run.repo.ts:138,149,97,108`. |
| D-4 | **Decision counts per run come from SQL aggregates.** The join is `agent_runs` ⟕ `reviews` on `reviews.run_id = agent_runs.id` (and the workspace), then ⟕ `findings`, grouped by `agent_runs.id`. The counts are `count(findings.id) filter (where accepted_at is not null)`, `… dismissed_at …`, `… both null …` (pending), plus one per severity, each `.mapWith(Number)`. | A-4 / EC-2: findings of reviews with no run link are never joined. `reviews.run_id` has no FK → use a LEFT join (server INSIGHTS 2026-09-20). Use `count(findings.id)`, not `count(*)`, so a run without findings counts 0. `mapWith(Number)` precedent: `skills/repository.ts:66`. |
| D-5 | **Money is summed in integer units.** `COST_SCALE = 1e9` (nano-USD): each run's cost becomes `Math.round(cost * 1e9)`, every sum (row, totals, each breakdown line) is an integer sum, and `/1e9` is applied only when the DTO is built. | AC-8: summing floats in a different grouping order differs in the last bits. Tests compare sums with `toBeCloseTo(x, 9)`. |
| D-6 | **The contract is extended additively in `contracts/observability.ts`, byte-identical in both copies.** `AgentStats` (`:96-119`, unused anywhere today) gains fields. The new shapes go in the same file. Both barrels already export it (`vendor/shared/index.ts:26`), so `index.ts` is not touched. | Spec input table. Parity pin `server/test/eval-contracts.test.ts:169-174,238-248` (observability.ts must stay out of the differing list). |
| D-7 | **Breakdown lines hold priced runs only.** A line is `{ key, label, runs: priced runs, cost_usd }`, and each breakdown carries one `unpriced_runs` count. A row's expansion uses the same `PerfCostBreakdown` type (`row.by_model`). | AC-8, NFR-3, NFR-4, EC-5, EC-6 (`key: null` = unknown model). |
| D-8 | **Sorting is client-only.** The server returns rows in a stable order (existing agents by name, then the Deleted agent). The client's pure `sortRows(rows, dir)` applies A-6, using the `low_sample` flag computed on the server. | AC-6, AC-12 (sorting sends no request). |
| D-9 | **The client validates the period itself.** `client/src/lib/agent-performance.ts` mirrors the `PerfPeriodQuery` rules (as `feature-models.ts` mirrors the shared registry). An invalid or partial URL falls back to 30 days. | The client may import only types from `@devdigest/shared` (`client/src/lib/feature-models.ts:6-11`). EC-9, A-2. |
| D-10 | **Sidebar item.** The spec calls it "existing", but `NAV` has no `agent-performance` entry; only `activeKeyFor` knows the key (`components/app-shell/helpers.ts:37`, `vendor/ui/nav.ts:21-53`). Append `{ key: "agent-performance", label: "Agent Performance", icon: "BarChart", href: "/agent-performance" }` to the `CI` group, after CI Runs. The design files Agent Performance under "CI & Export — N11/N12/N13". | G1, NFR-1. This adds a nav item, not a requirement. |
| D-11 | **`Donut` gets an optional `legend?: boolean` (default `true`).** The cost breakdown renders its own legend: an NFR-8 amount, a share, and the unpriced line with no amount. | `vendor/ui/charts/Donut.tsx:43-53` always prints `$value.toFixed(2)` for every segment. The default keeps the showcase (`Showcase.tsx:328`) unchanged. |
| D-12 | **A new money formatter for this feature: `formatUsd`** (2 decimals, 4 below $0.01, `null` → "—"). `lib/cost.ts` `formatCost` is not changed. | NFR-8 differs from `client/src/lib/cost.ts:6-10` (3 decimals below $1), which other screens use. |

### API (module `agent-performance`; workspace-scoped; no body; reads only)

| Route | Query | 200 | Errors |
|---|---|---|---|
| `GET /agent-performance` | `PerfPeriodQuery` | `AgentPerformance` | 422 invalid period (EC-9) |
| `GET /agents/:id/stats` | `IdParams` + `PerfPeriodQuery` | `AgentStats` | 404 unknown or foreign agent (EC-13) · 422 |

### Contract shapes (`contracts/observability.ts`, identical in both copies)

```ts
PerfPeriodPreset = '1d' | '30d' | 'custom'
PerfIsoDate      = string /^\d{4}-\d{2}-\d{2}$/ refined to a real calendar date
PerfPeriodQuery  = { period?: PerfPeriodPreset (default '30d'), from?: PerfIsoDate, to?: PerfIsoDate }
                   // superRefine: 'custom' ⇔ from AND to present; from <= to; 1d/30d/absent carry neither
PerfPeriod       = { preset: PerfPeriodPreset, from: string /*ISO datetime*/, to: string /*exclusive*/ }
PerfCostLine     = { key: string|null, label: string|null, runs: int /*priced*/, cost_usd: number }
PerfCostBreakdown= { lines: PerfCostLine[], unpriced_runs: int }
AgentStats      += { period: PerfPeriod, priced_runs: int, unpriced_runs: int, decided: int,
                     low_sample: boolean, last_run_at: string|null, by_model: PerfCostBreakdown }
                   // existing avg_latency_ms = average duration; trend stays [] (A-11)
AgentPerformanceRow = AgentStats.omit({agent_id, agent_name, period})
                      .extend({ agent_id: string|null, agent_name: string|null })   // null = Deleted agent
PerfTotals       = { runs, priced_runs, unpriced_runs: int, total_cost_usd: number|null,
                     accepted, dismissed, decided: int, accept_rate: number|null }   // pooled, A-3
PerfMostActive   = { agent_id: string, agent_name: string, runs: int } | null
AgentPerformance = { period: PerfPeriod, totals: PerfTotals, most_active: PerfMostActive,
                     rows: AgentPerformanceRow[], by_agent: PerfCostBreakdown, by_model: PerfCostBreakdown }
```

## Files

Two groups. The **server** group (T-S1 to T-S7) runs first. The **client** group (T-C1 to T-C9) can start after T-S1 lands, because it needs only the contract types. Each file belongs to exactly one group.

### File ownership

| owner | files |
|---|---|
| server | `server/src/modules/agent-performance/**`, `server/src/modules/index.ts` (one import + one entry), `server/test/agent-performance-contracts.test.ts` |
| server (**touched by both groups' code; edited only by the server group, in T-S1**) | `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts`. The client group only reads them; any later change goes back to the server group and edits both copies together |
| client | `client/src/lib/agent-performance.ts` (+ test), `client/src/lib/hooks/agent-performance.ts` (+ test), `client/src/lib/hooks/index.ts` (one line), `client/messages/en/agentPerformance.json`, `client/messages/en/agents.json` (one key), `client/src/components/agent-performance/**`, `client/src/app/agent-performance/**`, `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,AgentEditor.test.tsx}`, `.../AgentEditor/_components/StatsTab/**`, `client/src/vendor/ui/charts/Donut.tsx`, `client/src/vendor/ui/nav.ts` + `nav.test.ts`, `client/src/components/showcase/{Showcase.tsx,constants.ts}` (append only) |
| not touched | `server/src/db/schema/**`, `server/src/db/migrations/**`, every `package.json` and lock file, `contracts/*` other than `observability.ts`, both `vendor/shared/index.ts`, `server/src/modules/agents/**`, `server/src/modules/reviews/**`, `client/src/lib/cost.ts` |

| path | new/modify | what changes | AC |
|---|---|---|---|
| `server/src/vendor/shared/contracts/observability.ts` | modify | shapes above (additive) | AC-1, AC-3, AC-4, AC-5, AC-8 |
| `client/src/vendor/shared/contracts/observability.ts` | modify | byte-identical copy | same |
| `server/test/agent-performance-contracts.test.ts` | new | `PerfPeriodQuery` cases, nullable metrics, copies identical | AC-3, AC-4, AC-5 |
| `server/src/modules/agent-performance/constants.ts` | new | `LOW_SAMPLE_THRESHOLD = 5`, `COUNTED_STATUSES = ['done','failed']`, `DAY_MS`, `PRESET_DAYS = { '1d': 1, '30d': 30 }`, `DEFAULT_PRESET = '30d'`, `COST_SCALE = 1e9` | AC-2, AC-3, AC-6 |
| `server/src/modules/agent-performance/helpers.ts` | new | pure: `resolvePeriod`, `isCountedRun`, `aggregatePerformance`, `toAgentStats` | AC-1–AC-9 |
| `server/src/modules/agent-performance/helpers.period.test.ts` | new | period resolution + bounds | AC-2, AC-3 |
| `server/src/modules/agent-performance/helpers.test.ts` | new | aggregation | AC-1, AC-2, AC-4–AC-9 |
| `server/src/modules/agent-performance/repository.ts` | new | `AgentPerformanceRepository.runsInPeriod(ws, period)` (D-4) | AC-2, AC-5 |
| `server/src/modules/agent-performance/service.ts` + `service.test.ts` | new | `AgentPerformanceService`: `performance`, `stats` | AC-1, AC-3, AC-12 |
| `server/src/modules/agent-performance/routes.ts` + `routes.test.ts` | new | two GET routes; ONE route test | AC-1, AC-12 |
| `server/src/modules/index.ts` | modify | `import agentPerformance from './agent-performance/routes.js'` + entry | — |
| `client/src/lib/agent-performance.ts` + `agent-performance.test.ts` | new | `PeriodParams`, `parsePeriodParams`, `periodSearch`, `withPeriod`, `periodCaption`; `formatUsd`, `formatRate`, `formatDuration`, `formatRelative`, `formatUtc` | AC-3, AC-4, AC-5, NFR-8 |
| `client/src/lib/hooks/agent-performance.ts` + `agent-performance.test.ts` | new | `useAgentPerformance(period)`, `useAgentStats(agentId, period)` | AC-12 |
| `client/src/lib/hooks/index.ts` | modify | `export * from "./agent-performance";` | — |
| `client/messages/en/agentPerformance.json` | modify (rewrite) | every caption of the page and the Stats tab; the current keys are unused (only the route key exists, `app-shell/helpers.ts:37`) | NFR-13 |
| `client/messages/en/agents.json` | modify | `editor.tabs.stats` = "Stats" | NFR-6 |
| `client/src/vendor/ui/charts/Donut.tsx` | modify | optional `legend?: boolean` (D-11) | NFR-4 |
| `client/src/components/agent-performance/PeriodSelector/{PeriodSelector.tsx,index.ts,styles.ts,PeriodSelector.test.tsx}` | new | calendar button; 1 day / 30 days / Custom with two date inputs | AC-3, NFR-1 |
| `client/src/components/agent-performance/KpiCard/{KpiCard.tsx,index.ts,styles.ts,KpiCard.test.tsx}` | new | label, value-or-"—", caption, optional badge / chip | AC-11, NFR-5 |
| `client/src/components/showcase/Showcase.tsx`, `constants.ts` | modify (append only) | `PeriodSelector` + `KpiCard` section with fixtures, no network | — (`client/AGENTS.md:27`) |
| `client/src/app/agent-performance/page.tsx` | new | thin: reads the URL period, `router.replace` on change | NFR-7 |
| `client/src/app/agent-performance/_components/AgentPerformanceView/{AgentPerformanceView.tsx,index.ts,styles.ts,AgentPerformanceView.test.tsx}` | new | header, states, KPI cards, composes table + breakdown | AC-7, AC-10, AC-11, AC-12 |
| `client/src/app/agent-performance/_components/PerformanceTable/{PerformanceTable.tsx,index.ts,helpers.ts,helpers.test.ts,styles.ts,PerformanceTable.test.tsx}` | new | rows, Accept sort, expansion, View link | AC-6, AC-9, AC-12, NFR-2, NFR-3, NFR-7 |
| `client/src/app/agent-performance/_components/CostBreakdown/{CostBreakdown.tsx,index.ts,helpers.ts,helpers.test.ts,styles.ts,CostBreakdown.test.tsx}` | new | two donuts + legends, unpriced line | AC-8, NFR-4, NFR-5 |
| `client/src/vendor/ui/nav.ts`, `nav.test.ts` | modify | one CI-group item (D-10); update the pinned CI list (`nav.test.ts:82`) | G1 |
| `.../AgentEditor/constants.ts` | modify | `{ key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" }` between evals and ci; fix the comment at `:10` | NFR-6 |
| `.../AgentEditor/AgentEditor.tsx` | modify | `tab === "stats"` branch (`:28-38`) + header comment | NFR-6 |
| `.../AgentEditor/AgentEditor.test.tsx` | modify | six tabs in order; mock the new hook and `useSearchParams` | NFR-6 |
| `.../AgentEditor/_components/StatsTab/{StatsTab.tsx,index.ts,styles.ts,StatsTab.test.tsx}` | new | four cards + period selector + states | AC-1, AC-10, AC-11, NFR-6 |

## Tasks — group SERVER

### T-S1 — Contracts in both copies
AC: AC-1, AC-3, AC-4, AC-5
Files: `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts`, `server/test/agent-performance-contracts.test.ts`
Shape: as above. Write the server copy, then copy the file byte for byte. Update the module comment at `:12` to name both routes.
Test: `server/test/agent-performance-contracts.test.ts`
- `PerfPeriodQuery` accepts `{}`, `{period:'1d'}`, and `{period:'custom', from:'2026-10-01', to:'2026-10-01'}`.
- It rejects (EC-9): custom without `to`; `from > to`; `from:'2026-02-30'`; `from:'10/01/2026'`; `{period:'30d', from:…}`.
- `AgentStats` parses with `accept_rate: null`, `avg_cost_usd: null`, `avg_latency_ms: null`, `total_cost_usd: null`, `last_run_at: null` (AC-4, AC-5).
- `AgentPerformanceRow` accepts `agent_id: null`.
- `contracts/observability.ts` is byte-identical in both copies.
- The existing `test/eval-contracts.test.ts` › "the set of differing files equals the pinned list" stays green.

Verify: `pnpm typecheck && pnpm exec vitest run test/agent-performance-contracts.test.ts test/eval-contracts.test.ts` in `server/`; `pnpm typecheck` in `client/`
Skills: zod, typescript-expert
Depends on: —

### T-S2 — Period resolution (pure)
AC: AC-2, AC-3
Files: `server/src/modules/agent-performance/constants.ts`, `helpers.ts` (`resolvePeriod`, `isCountedRun`), `helpers.period.test.ts`
Signatures:
- `resolvePeriod(q: PerfPeriodQuery, now: Date): { preset; from: Date; to: Date }`
- `isCountedRun(run: PerfRunRow, workspaceId: string, p): boolean` — status in `COUNTED_STATUSES`, the same workspace, `from <= ranAt < to`.

Test: `helpers.period.test.ts` (fixed `now = 2026-10-17T12:00:00Z`)
- AC-3:
  - `{}` → `[now − 30×24 h, now)`, preset `30d`.
  - `1d` → `[now − 24 h, now)`.
  - custom `2026-10-01..2026-10-10` → `[2026-10-01T00:00Z, 2026-10-11T00:00Z)`.
  - custom with from = to → exactly one day.
- AC-2 / EC-11:
  - A run at `from` is counted; a run at `to` is not; a run 1 ms before `from` is not.
  - Status `running` → false; `cancelled` → false; `done` / `failed` → true (EC-3).
  - Another `workspaceId` → false.
  - Source `ci` and `local` are both counted.

Verify: `pnpm exec vitest run src/modules/agent-performance/helpers.period.test.ts` in `server/`
Skills: typescript-expert
Depends on: T-S1

### T-S3 — Aggregation (pure)
AC: AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9
Files: `server/src/modules/agent-performance/helpers.ts` (`aggregatePerformance`, `toAgentStats`), `helpers.test.ts`
Signatures:
- `PerfRunRow = { id, workspaceId, agentId: string|null, status: string|null, source, ranAt: Date, model: string|null, durationMs: number|null, costUsd: number|null, accepted, dismissed, pending, critical, warning, suggestion: number }`
- `aggregatePerformance({ workspaceId, period, runs: PerfRunRow[], agents: { id; name }[] }): AgentPerformance`
- `toAgentStats(perf, agent: { id; name }): AgentStats` — copies the matching row's metrics and adds `agent_id`, `agent_name` and `period`.

Rules:
- Filter with `isCountedRun`.
- One row per agent in `agents` (A-7), ordered by name. Runs whose `agentId` is null or not in `agents` go into one Deleted row (`agent_id: null`), placed last and present only if it has runs.
- Averages are taken only over runs that have the value (D-5 integer cost).
- `accept_rate = accepted / decided`, or null when `decided = 0`. `low_sample = decided < LOW_SAMPLE_THRESHOLD`.
- `last_run_at` = max `ranAt` (A-10).
- `findings_by_severity` = sums; `trend: []`.
- Totals are pooled (A-3).
- `most_active`: existing agents only, max runs; on a tie the later `last_run_at`, then name. Null when no existing agent ran.
- Breakdowns follow D-7, with lines sorted by cost descending.

Test: `helpers.test.ts`
- AC-1: for each agent, `toAgentStats(perf, a)` minus `agent_id` / `agent_name` / `period` deep-equals its row.
- AC-2: a fixture with `running`, `cancelled`, a foreign-workspace run and an out-of-period run → none of them is in runs, cost or decisions.
- AC-4 / EC-5:
  - 3 runs, one with `costUsd: null` → `priced_runs 2`, `avg_cost` = sum / 2, and `total_cost` excludes the null.
  - Every run unpriced → `total_cost_usd`, `avg_cost_usd` and totals cost all `null`; `unpriced_runs 3`; both breakdowns have `lines: []`.
  - Every `durationMs` null → `avg_latency_ms: null`.
- AC-5:
  - accepted 3, dismissed 1, pending 5 → rate 0.75, decided 4.
  - Only pending → `accept_rate: null`, `decided: 0`.
  - EC-1: a CI-only agent → `accept_rate: null`, `low_sample: true`, but runs / cost / duration still counted.
  - Totals `accept_rate` is pooled, not a mean of per-agent rates.
- AC-6: `decided` 4 → `low_sample: true`; 5 → `false`.
- AC-7:
  - Two agents with 3 runs each → the one with the later last run.
  - The Deleted row has the most runs → it is not chosen.
  - Only deleted runs → `most_active: null` (EC-7).
- AC-8:
  - `totals.runs` = Σ `rows.runs` (Deleted included).
  - `totals.total_cost_usd` ≈ Σ row cost ≈ Σ `by_agent.lines` ≈ Σ `by_model.lines` (`toBeCloseTo(…, 9)`), on a fixture of 0.1 + 0.2 style floats.
  - Each breakdown's `unpriced_runs` = `totals.unpriced_runs`.
  - Every row's `by_model` reconciles with its own cost.
  - A null model → one `key: null` line (EC-6).
- AC-9: an agent with no counted run → row present, `runs: 0`, every average / rate / cost / `last_run_at` null, `by_model.lines: []`.
- D9: a run whose agent is unknown → the Deleted row.
- EC-14: no agents and no runs → `totals.runs 0`, `rows: []`.

Verify: `pnpm exec vitest run src/modules/agent-performance` in `server/`
Skills: typescript-expert, zod
Depends on: T-S2

### T-S4 — Repository
AC: AC-2, AC-5 (SQL side; the logic is proved by T-S3 and fed through T-S6)
Files: `server/src/modules/agent-performance/repository.ts`
Signature: `class AgentPerformanceRepository { constructor(db: Db); runsInPeriod(workspaceId, { from: Date; to: Date }): Promise<PerfRunRow[]> }`
Query (D-4):
- `select` from `t.agentRuns` with `leftJoin(t.reviews, and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, workspaceId)))` and `leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))`.
- `where` `eq(t.agentRuns.workspaceId, ws)`, `inArray(t.agentRuns.status, COUNTED_STATUSES)`, `gte(t.agentRuns.ranAt, from)`, `lt(t.agentRuns.ranAt, to)`.
- `groupBy(t.agentRuns.id)`; six `count(${t.findings.id}) filter (where …)` columns, each `.mapWith(Number)`.
- Reads the tables of `schema/runs.ts:8-37` and `schema/reviews.ts:10-47` only. No write, and no import from another module.

Test: covered by T-S3 (rules) and T-S6 (wiring). Manual (T-S7): run it on the seeded DB and compare against a hand SQL count; `EXPLAIN ANALYZE` stays under 1 s (NFR-12). No index is planned (D13).
Verify: `pnpm typecheck` in `server/`
Skills: drizzle-orm-patterns, onion-architecture
Depends on: T-S3

### T-S5 — Service
AC: AC-1, AC-3, AC-12
Files: `server/src/modules/agent-performance/service.ts`, `service.test.ts`
Signature: `new AgentPerformanceService(container, deps?: { repo?: Pick<AgentPerformanceRepository,'runsInPeriod'>; now?: () => Date })`
- `performance(ws, q): Promise<AgentPerformance>`: `resolvePeriod(q, now())` → `Promise.all([repo.runsInPeriod, container.agentsRepo.list(ws)])` → `aggregatePerformance`.
- `stats(ws, agentId, q): Promise<AgentStats>`: `container.agentsRepo.getById(ws, agentId)`, throwing `NotFoundError('Agent not found')` when it is missing → `toAgentStats(await this.performance(ws, q), agent)`.
- Never calls `container.llm` / `github` / `git` / `jobs`.

Test: `service.test.ts` (fake repo; a stub container whose `llm`, `github` and `embedder` throw when touched; stub `agentsRepo`)
- AC-3: `performance(ws, {})` passes the repo `from = now − 30 d`, `to = now`; `period.preset === '30d'`.
- AC-1: `stats` equals the dashboard row of the same call's data.
- EC-13: `getById` → undefined → `NotFoundError`, and the repo is not called.
- NFR-11: the repo and `agentsRepo` receive the caller's `ws`.
- AC-12 / NFR-10: no throwing adapter getter was touched.

Verify: `pnpm typecheck && pnpm exec vitest run src/modules/agent-performance/service.test.ts` in `server/`
Skills: onion-architecture
Depends on: T-S4

### T-S6 — Routes, registration, the one route test
AC: AC-1, AC-12
Files: `server/src/modules/agent-performance/routes.ts`, `routes.test.ts`, `server/src/modules/index.ts`
Routes: as in the API table. `schema: { querystring: PerfPeriodQuery, response: { 200: … } }`, `IdParams` for `:id` (`_shared/schemas.ts:11`), `getContext` for the workspace. Shape follows `ci/routes.ts:29-73`. Invalid input → 422 through the app's validator (server INSIGHTS 2026-10-14).
Test: `routes.test.ts` — exactly ONE `it`, no DB.
- Setup:
  - `vi.mock('./repository.js')` with a fake `AgentPerformanceRepository` whose `runsInPeriod` returns a fixture: agent A with mixed priced, unpriced, accepted, dismissed and pending runs; agent B; one deleted-agent run; one `running` run.
  - `buildApp({ config, overrides: { auth: new MockAuthProvider(), llm: { openai: m1, anthropic: m2, openrouter: m3 } } })` with `MockLLMProvider`s (as `ci/routes.test.ts:24-35`).
  - `vi.spyOn(app.container.agentsRepo, 'list' | 'getById')` returns A, B and C.
- "GET /agents/:id/stats equals that agent's row of GET /agent-performance for the same period, and no model adapter is called":
  - Both requests use `?period=custom&from=2026-10-01&to=2026-10-10` → both return 200.
  - The stats body minus `agent_id` / `agent_name` / `period` deep-equals the A row minus `agent_id` / `agent_name`.
  - The `period` objects are equal.
  - `m1.calls`, `m2.calls`, `m3.calls` are all empty.

Verify: `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/`
Skills: fastify-best-practices, onion-architecture, zod
Depends on: T-S5

### T-S7 — Server gate
AC: — (enables T-S1 to T-S6)
Verify:
- `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` in `server/`.
- Manual, with `./scripts/dev.sh`:
  - `curl :3001/agent-performance` and `curl :3001/agents/<id>/stats` give the same numbers.
  - `EXPLAIN ANALYZE` of the T-S4 query takes < 1 s.
  - `git status` shows nothing under `server/src/db/`.

Depends on: T-S6

## Tasks — group CLIENT (starts after T-S1)

### T-C1 — Period + formatting helpers (pure)
AC: AC-3, AC-4, AC-5
Files: `client/src/lib/agent-performance.ts`, `client/src/lib/agent-performance.test.ts`
Signatures:
- `type PeriodParams = { period: '1d' | '30d' } | { period: 'custom'; from: string; to: string }`
- `parsePeriodParams(sp: { get(k: string): string | null }): PeriodParams` — D-9 rules; invalid → `{ period: '30d' }`.
- `periodSearch(p): string` — e.g. `period=custom&from=…&to=…`.
- `withPeriod(sp, p): string` — keeps the other params, e.g. `tab`.
- `periodCaption(p, t)` — "1D" / "30D" / "Oct 1 – Oct 10".
- `formatUsd(n|null)` — NFR-8, D-12. `formatRate(n|null)` — whole %. `formatDuration(ms|null)` — `12.3 s`, `2.1 min` above 60 s. `formatRelative(iso, now)`. `formatUtc(iso)`. Every formatter maps null → "—".

Contract types are `import type` only.
Test: `agent-performance.test.ts`
- EC-9: a missing `to`, `from > to`, `2026-02-30`, or garbage → `30d`; a valid custom round-trips through `periodSearch` → `parsePeriodParams`.
- `withPeriod` keeps `tab=stats`.
- NFR-8 / AC-4 / AC-5: `formatUsd(null)` → "—"; `formatUsd(0.004)` → "$0.0040"; `formatUsd(1.5)` → "$1.50"; `formatRate(null)` → "—"; `formatRate(0.756)` → "76%"; `formatDuration(65_000)` → minutes.

Verify: `pnpm typecheck && pnpm exec vitest run src/lib/agent-performance.test.ts` in `client/`
Skills: frontend-architecture, typescript-expert
Depends on: T-S1

### T-C2 — Data hooks
AC: AC-12
Files: `client/src/lib/hooks/agent-performance.ts`, `agent-performance.test.ts`, `client/src/lib/hooks/index.ts`
Signatures:
- `useAgentPerformance(p: PeriodParams)` → key `["agent-performance", periodSearch(p)]`, GET `/agent-performance?${periodSearch(p)}`.
- `useAgentStats(agentId, p)` → key `["agent-stats", agentId, periodSearch(p)]`, GET `/agents/${agentId}/stats?…`, `enabled: !!agentId`.
- No `refetchInterval` (NG6); the global `refetchOnWindowFocus: false` applies (`lib/providers.tsx:29`). Pattern: `lib/hooks/ci.ts:17-31`.

Test: `agent-performance.test.ts` (`../api` mocked as `ci.test.ts:21-22`)
- `useAgentPerformance({period:'1d'})` GETs `/agent-performance?period=1d` once and never POSTs.
- Re-rendering with a custom period issues exactly one more GET, with the new query.
- `useAgentStats("a1", {period:'30d'})` GETs `/agents/a1/stats?period=30d`.
- `useAgentStats(undefined, …)` issues no request.

Verify: `pnpm typecheck && pnpm exec vitest run src/lib/hooks/agent-performance.test.ts` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-C1

### T-C3 — Messages
AC: — (enables T-C4 to T-C8; NFR-13)
Files: `client/messages/en/agentPerformance.json` (rewrite), `client/messages/en/agents.json` (+ `editor.tabs.stats`)
Keys:
- `title`, `crumb`, `loading`, `loadError`, `retry`.
- `empty.title` = "No runs in this period", `empty.body` (suggests changing the period).
- `period.button|oneDay|thirtyDays|custom|from|to|apply|caption1d|caption30d`.
- `kpi.totalRuns|totalCost|avgAcceptRate|mostActive|priced` ("{priced} of {runs} priced"), `kpi.decided` ("{accepted} / {decided} decided").
- `table.agent|runs|avgCost|avgDuration|accept|lastRun|view|noRuns` ("No runs in period"), `table.deletedAgent`, `table.lowSample`, `table.sortAsc|sortDesc`.
- `breakdown.title|byAgent|byModel|unpriced` ("unpriced · {runs} runs"), `breakdown.unknownModel`.
- `costBadge` = "Estimated by DevDigest (token prices)".
- `stats.totalRuns|avgCost|avgDuration|acceptRate`.

None of these strings says "billed" or "reconciled" (NFR-5).
Test: every component test in T-C4 to T-C8 imports this file and asserts its copy.
Verify: `pnpm test` in `client/`
Depends on: —

### T-C4 — Shared PeriodSelector and KpiCard (+ Donut legend prop, showcase)
AC: AC-3, AC-11
Files: `client/src/components/agent-performance/PeriodSelector/*`, `client/src/components/agent-performance/KpiCard/*`, `client/src/vendor/ui/charts/Donut.tsx`, `client/src/components/showcase/Showcase.tsx`, `client/src/components/showcase/constants.ts`
Props:
- `PeriodSelector({ value: PeriodParams; onChange(p: PeriodParams): void })`: a `Dropdown`/`Button` with the `Calendar` icon. Custom shows two `<input type="date">` controls, each inside its own `<label>` (client INSIGHTS 2026-09-22). Apply is disabled while the range is invalid.
- `KpiCard({ label; value: string | null; caption?: string; badge?: ReactNode })` — `null` → "—".
- `Donut`: `legend = true` default (D-11).

Showcase: one group inside `NextIntlClientProvider` with `agentPerformance`, using fixture props. No hooks.
Test:
- `PeriodSelector.test.tsx`:
  - Choosing "1 day" → `onChange({period:'1d'})`.
  - Custom 2026-10-01..2026-10-10 + Apply → custom params.
  - from > to → Apply disabled and `onChange` not called.
- `KpiCard.test.tsx`: `value: null` → "—", and the card text has no digit; the caption and badge render.
- `client/src/test/smoke.test.tsx` still mounts the gallery.

Verify: `pnpm typecheck && pnpm exec vitest run src/components/agent-performance src/test/smoke.test.tsx` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-C1, T-C3

### T-C5 — PerformanceTable: sort, expansion, View link
AC: AC-6, AC-9, AC-12
Files: `client/src/app/agent-performance/_components/PerformanceTable/*`
Props: `{ rows: AgentPerformanceRow[]; period: PeriodParams }` (presentational). Sort direction and the set of expanded rows are local state.
`helpers.ts` (pure): `sortRows(rows, dir: 'desc' | 'asc')`, following A-6:
- Rows with runs > 0 and not low-sample come first, by rate in `dir`; ties by runs descending, then name.
- Then low-sample rows, by runs descending.
- Then rows with runs = 0, by name.
- The Deleted row sorts by the same rules.

Columns (NFR-2): Agent · Runs · Avg cost (+ "N of M priced" when N < M) · Avg dur. · Accept (% + "x / y decided" + "low sample" chip) · Last run (relative, `title` = UTC) · View.
- The Accept header is a button with the direction arrow.
- A row click (not View) toggles an inline panel built from `row.by_model` (lines + unpriced line); several rows can be open at once (NFR-3).
- View is `<a href="/agents/<id>?tab=stats&<periodSearch>">` (NFR-7). The Deleted row has no View link (A-9).
- A `runs === 0` row renders the agent name plus one muted cell "No runs in period" and no numbers (AC-9).

Test:
- `helpers.test.ts` — AC-6: in both `desc` and `asc`, every `low_sample` row comes after every non-low-sample row; zero-run rows come last; ties are broken by runs, then name.
- `PerformanceTable.test.tsx`:
  - AC-6: clicking Accept reverses the order, and the low-sample rows stay at the end.
  - AC-9: the zero-run row shows `table.noRuns` and its row text matches no `/\d/`.
  - NFR-3: a row click shows that row's model lines and the unpriced count; a second row also opens; clicking View does not toggle the row.
  - NFR-7: the View `href` equals `/agents/a1?tab=stats&period=custom&from=2026-10-01&to=2026-10-10`; the Deleted row has no link.
  - Names render as text (`<img …>` gives no `img` role).

Verify: `pnpm typecheck && pnpm exec vitest run src/app/agent-performance` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-C1, T-C3

### T-C6 — CostBreakdown
AC: AC-8
Files: `client/src/app/agent-performance/_components/CostBreakdown/*`
Props: `{ byAgent: PerfCostBreakdown; byModel: PerfCostBreakdown; total: number | null }`
`helpers.ts`:
- `donutSegments(b, colors)` — priced lines only; never the unpriced line.
- `legendLines(b, total, t)` — `{ label, amount: formatUsd, share: whole % }` plus a final unpriced line with its run count and no amount.
- `key: null` → `breakdown.unknownModel` for models and `table.deletedAgent` for agents.

Renders `Donut` with `legend={false}` and the `costBadge` (NFR-5).
Test:
- `helpers.test.ts`:
  - The unpriced line is not a segment.
  - The shares of the priced lines add up to 100 ±1.
  - The unpriced legend line carries the run count and `amount: null`.
  - With all runs unpriced → no segments and only the unpriced line (EC-5).
- `CostBreakdown.test.tsx`: both "By agent" and "By model" legends list every line; the badge text is shown.

Verify: `pnpm typecheck && pnpm exec vitest run src/app/agent-performance` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-C4

### T-C7 — Dashboard page, view, sidebar item
AC: AC-7, AC-10, AC-11, AC-12
Files: `client/src/app/agent-performance/page.tsx`, `client/src/app/agent-performance/_components/AgentPerformanceView/*`, `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts`
- `page.tsx` (`"use client"`, as `eval/compare/page.tsx:1-11`): `parsePeriodParams(useSearchParams())`, then `onPeriod = p => router.replace('/agent-performance?' + periodSearch(p))`. The root `Suspense` already wraps it (`app/layout.tsx:29-31`).
- `AgentPerformanceView({ period, onPeriod })`: `useAgentPerformance(period)`, inside `AppShell`, then:
  - While loading → `loading` copy + `Skeleton`. No card, table or breakdown is rendered.
  - On error → `ErrorState` with `loadError` and retry (`refetch`). No card, table or breakdown.
  - `totals.runs === 0` → the empty state (`empty.title` + `empty.body`) and the period selector only (AC-10, EC-10, EC-14).
  - Otherwise four `KpiCard`s in NFR-1 order:
    - Total runs.
    - Total cost: `formatUsd` + `kpi.priced` + `costBadge`.
    - Avg accept rate: `formatRate` + `kpi.decided`.
    - Most active: the name + its runs, or "—".
  - Each card caption carries `periodCaption`.
  - Then `PerformanceTable` and `CostBreakdown`.
- `nav.ts`: one item (D-10). Update `nav.test.ts:82` to the new CI list.

Test: `AgentPerformanceView.test.tsx` (hooks mocked as `EvalDashboardView.test.tsx:12-18`, except the last case)
- AC-11 loading: the loading copy is shown, and no text matches `/^(0|0%|\$0\.00)$/`, `/\$\d/` or `/\d%/`.
- AC-11 error: the `loadError` copy is shown, with the same no-number assertions; retry calls `refetch` once. Assert on copy, not on `role="alert"` (client INSIGHTS 2026-09-22).
- AC-10: `totals.runs 0` → `empty.title` is shown, and the KPI labels, table header and breakdown title are absent.
- AC-9 (screen level): data where agent C has 0 runs and others have runs → C's row shows `table.noRuns`, and the KPI cards are present.
- AC-7: Most active shows the agent name and its runs; `most_active: null` → "—".
- NFR-1 / NFR-5: the card labels appear in order; "2 of 3 priced"; "3 / 4 decided"; the badge is on the Total cost card.
- AC-12 "sort and expand issue no request": real hooks, `@/lib/api` mocked (`get` resolves the fixture), inside a `QueryClientProvider`. After the data shows, click the Accept header twice and two rows → `get` was called exactly once (`/agent-performance?period=30d`), and `post` / `put` / `del` were never called.

`nav.test.ts`: the CI group lists `ci-runs`, then `agent-performance`, with href `/agent-performance`, not repo-scoped and no g-chord.
Verify: `pnpm typecheck && pnpm exec vitest run src/app/agent-performance src/vendor/ui/nav.test.ts` in `client/`
Skills: frontend-architecture, next-best-practices, react-best-practices, react-testing-library
Depends on: T-C2, T-C5, T-C6

### T-C8 — Stats tab (6th editor tab)
AC: AC-1, AC-10, AC-11
Files: `.../AgentEditor/constants.ts`, `.../AgentEditor/AgentEditor.tsx`, `.../AgentEditor/AgentEditor.test.tsx`, `.../AgentEditor/_components/StatsTab/*`
- `TABS` order: config, skills, context, evals, **stats**, ci (NFR-6). `agents.json` provides `editor.tabs.stats`.
- `StatsTab({ agent })`:
  - `useSearchParams` → `parsePeriodParams`; `useRouter().replace('/agents/<id>?' + withPeriod(sp, p))`, which keeps `tab=stats`. The page's `setTab` already keeps the other params (`agents/[id]/page.tsx:30-34`).
  - `useAgentStats(agent.id, period)`. Data hooks are imported from `@/lib/hooks/agent-performance` only.
  - Cards:
    - Total runs.
    - Avg cost / run, with `kpi.priced` and the `costBadge`.
    - Avg duration.
    - Accept rate, with `kpi.decided` and the low-sample chip.
  - Plus a `PeriodSelector`.
  - Loading, error (with retry) and `runs === 0` → empty-state branches as in T-C7. No severity or trend (A-11).

Test: `StatsTab.test.tsx` (hook + `next/navigation` mocked)
- AC-1: `useAgentStats` is called with `("ag1", {period:'custom', from:'2026-10-01', to:'2026-10-10'})` when the URL holds that period; the cards show exactly `formatUsd(avg_cost_usd)`, `formatRate(accept_rate)`, `"3 / 4 decided"` and `"2 of 3 priced"` from the response.
- AC-11: loading and error each show no numeric value (same assertions as T-C7), and the error retry calls `refetch`.
- AC-10: `runs: 0` → `empty.title`, and no card label.
- Low-sample chip shown when `low_sample`; the badge is shown on the cost card (NFR-5).
- Choosing "1 day" → `replace` with `/agents/ag1?tab=stats&period=1d`.

`AgentEditor.test.tsx`:
- Replace "offers exactly five tabs" with "offers six tabs in order Config, Skills, Context, Evals, Stats, CI".
- Add `useSearchParams` to the `next/navigation` mock (`:21`) and a mock for `lib/hooks/agent-performance`.
- A `tab="stats"` case renders the Stats cards and not the Config form.

Verify: `pnpm typecheck && pnpm exec vitest run src/app/agents` in `client/`
Skills: frontend-architecture, next-best-practices, react-best-practices, react-testing-library
Depends on: T-C2, T-C4

### T-C9 — Client gate
AC: — (enables T-C1 to T-C8)
Verify:
- `pnpm typecheck && pnpm test && pnpm build` in `client/`.
- Manual, on the live stack:
  - Sidebar → Agent Performance; switch 1 day / 30 days / custom; reload keeps the period.
  - View → the Stats tab of the same agent shows the same numbers.
  - A future custom period shows the empty state.
  - The devtools Network tab shows only GETs to `/agent-performance` and `/agents/:id/stats`, and none on sort or expand.

Depends on: T-C7, T-C8, T-S7

## Execution order

1. T-S1. This unblocks the client group.
2. In parallel:
   - **Server:** T-S2 → T-S3 → T-S4 → T-S5 → T-S6 → T-S7.
   - **Client:** T-C1 and T-C3 in parallel, then T-C2 and T-C4, then T-C5 and T-C6, then T-C7 and T-C8, then T-C9.
3. T-C9's manual check needs T-S7.

## Traceability

| AC | task(s) | test (file › case) |
|---|---|---|
| AC-1 | T-S1, T-S3, T-S5, T-S6, T-C8 | `server/src/modules/agent-performance/routes.test.ts` › GET /agents/:id/stats equals that agent's row of GET /agent-performance for the same period, and no model adapter is called; `helpers.test.ts` › toAgentStats equals its row; `service.test.ts` › stats equals the dashboard row; `StatsTab.test.tsx` › hook called with the URL period, cards show the response values |
| AC-2 | T-S2, T-S3, T-S4 | `helpers.period.test.ts` › run at `from` counted, at `to` not; running / cancelled / other workspace excluded; local + ci counted; `helpers.test.ts` › excluded runs add nothing to runs, cost or decisions; manual: SQL count on the seeded DB (T-S7) |
| AC-3 | T-S1, T-S2, T-S5, T-C1, T-C4 | `agent-performance-contracts.test.ts` › PerfPeriodQuery accept / reject; `helpers.period.test.ts` › 1d / 30d / custom / default bounds; `service.test.ts` › default 30 d passed to the repo; `client/src/lib/agent-performance.test.ts` › invalid URL → 30d, round-trip; `PeriodSelector.test.tsx` › 1 day, custom, invalid range |
| AC-4 | T-S1, T-S3, T-C1 | `helpers.test.ts` › averages over priced / timed runs only, null when none, priced_runs reported; `agent-performance.test.ts` (client) › `formatUsd(null)` → "—" |
| AC-5 | T-S1, T-S3, T-S4, T-C1 | `helpers.test.ts` › 3/(3+1) with pending excluded, decided returned, null when decided = 0, CI-only agent, pooled totals; `agent-performance.test.ts` (client) › `formatRate(null)` → "—" |
| AC-6 | T-S3, T-C5 | `helpers.test.ts` › low_sample below 5; `PerformanceTable/helpers.test.ts` › low-sample rows last in both directions; `PerformanceTable.test.tsx` › Accept click keeps low-sample rows at the end |
| AC-7 | T-S3, T-C7 | `helpers.test.ts` › tie → latest run, Deleted row not eligible, only deleted runs → null; `AgentPerformanceView.test.tsx` › Most active shows the name + runs, or "—" |
| AC-8 | T-S3, T-C6 | `helpers.test.ts` › totals = Σ rows = Σ by_agent = Σ by_model, unpriced_runs on both breakdowns, null-model line; `CostBreakdown/helpers.test.ts` › unpriced line not a segment, shares sum to 100; `CostBreakdown.test.tsx` › both legends list every line |
| AC-9 | T-S3, T-C5, T-C7 | `helpers.test.ts` › agent without runs → row with runs 0 and null metrics; `PerformanceTable.test.tsx` › "No runs in period", no digit in the row; `AgentPerformanceView.test.tsx` › agent without runs beside agents with runs |
| AC-10 | T-C7, T-C8 | `AgentPerformanceView.test.tsx` › totals.runs 0 → empty state, no cards / table / breakdown; `StatsTab.test.tsx` › runs 0 → empty state |
| AC-11 | T-C4, T-C7, T-C8 | `AgentPerformanceView.test.tsx` › loading without numbers; error without numbers + retry; `StatsTab.test.tsx` › loading / error without numbers + retry; `KpiCard.test.tsx` › null value → "—"; manual: throttle the network and look at the cards |
| AC-12 | T-S5, T-S6, T-C2, T-C7 | `routes.test.ts` › zero `MockLLMProvider.calls` on both routes; `service.test.ts` › no adapter getter touched; `client/src/lib/hooks/agent-performance.test.ts` › GET only, one GET per period change; `AgentPerformanceView.test.tsx` › sort and expand issue no request; manual: Network tab (T-C9) |

## Skills for the implementer

| skill | task(s) | why |
|---|---|---|
| onion-architecture | T-S4, T-S5, T-S6 | route → service → repository; `container.agentsRepo` for agents; no adapter on this path |
| fastify-best-practices | T-S6 | zod `querystring` / `params`, response schemas, 422 / 404 envelopes |
| drizzle-orm-patterns | T-S4 | left joins, `count … filter`, `mapWith(Number)`, `inArray` / `gte` / `lt`; no schema change |
| zod | T-S1, T-S6 | additive contract, `superRefine` on the period, `omit` / `extend` row type |
| typescript-expert | T-S1–T-S3, T-C1 | DTO typing, pure-function signatures, type-only client imports |
| frontend-architecture | T-C1–T-C8 | `_components` layout, shared `components/agent-performance/`, hooks-only data, i18n, showcase |
| react-best-practices | T-C2, T-C4–T-C8 | local sort / expand state, derived values (no effect-driven state) |
| next-best-practices | T-C7, T-C8 | `useSearchParams` / `router.replace` in client pages under the root Suspense |
| react-testing-library | T-C2, T-C4–T-C8 | hook + component tests, copy-based assertions, request-count assertions |
| engineering-insights | any | record non-obvious findings (e.g. the count/filter over a left join, float reconciliation) |

## Risks

| risk | where (file:line) | mitigation |
|---|---|---|
| The parity pin fails if the two `observability.ts` copies differ by one byte | `server/test/eval-contracts.test.ts:169-174,238-248` | T-S1 copies the file and asserts byte identity; the server group owns both copies |
| `reviews.run_id` has no FK; an inner join, or `count(*)`, gives wrong decision counts | `server/src/db/schema/reviews.ts:20`; server INSIGHTS 2026-09-20 | D-4: left joins, `count(findings.id) filter …` |
| postgres.js returns `count` as a string | `server/src/modules/skills/repository.ts:66` | `.mapWith(Number)` on every count |
| Float sums do not reconcile across groupings | AC-8 | D-5 integer nano-USD sums; tests use `toBeCloseTo(…, 9)` |
| The repository SQL has no automated DB test (`.it` needs Docker) | `server/AGENTS.md` (integration split) | the rules are duplicated in the pure `isCountedRun` and tested; T-S7 manual SQL + `EXPLAIN` check |
| No index on `agent_runs (workspace_id, ran_at)` | `server/src/db/schema/runs.ts:8-37` | none planned (D13, NG7); T-S7 measures against NFR-12, and any index goes in a follow-up spec |
| Runs whose agent row is missing but `agent_id` is non-null (race with a delete) | `schema/runs.ts:13` | folded into the Deleted row (T-S3 case) |
| The client cannot import zod values from `@devdigest/shared` | `client/src/lib/feature-models.ts:6-11` | D-9: mirrored period rules; both sides tested |
| Two money formats in the studio | `client/src/lib/cost.ts:6-10` vs NFR-8 | D-12: new `formatUsd`; `formatCost` untouched |
| `Donut` legend prints `toFixed(2)` for every segment | `client/src/vendor/ui/charts/Donut.tsx:43-53` | D-11: optional `legend` prop, default unchanged; showcase still mounts |
| The spec's "existing sidebar item" is only an active-key mapping | `client/src/components/app-shell/helpers.ts:37`, `client/src/vendor/ui/nav.ts:47-52` | D-10: add the item; update the pinned CI list in `nav.test.ts:82` |
| `AgentEditor.test.tsx` asserts there is NO Stats tab | `AgentEditor.test.tsx:95-103` | T-C8 rewrites that case to six tabs and extends the `next/navigation` mock (`:21`) |
| `agentPerformance.json` already exists with unused keys | `client/messages/en/agentPerformance.json:1-32` | rewritten in T-C3; grep shows no reference in `client/src` |
| `ErrorState` carries `role="alert"`, so "no alert" assertions are meaningless | client INSIGHTS 2026-09-22; `vendor/ui/primitives/ErrorState.tsx:19` | assert on copy and on the absence of numbers |
| Showcase smoke test without a QueryClient | client INSIGHTS 2026-09-22; `client/src/test/smoke.test.tsx` | the showcase gets only presentational `PeriodSelector` / `KpiCard`, with no hooks |
| Choosing another agent in the editor sidebar drops the period | `client/src/app/agents/[id]/page.tsx:87` (`?tab=${tab}` only) | accepted: NFR-7 covers only View; tab switches keep it (`:30-34`) |
| `useSearchParams` in a static route needs a Suspense boundary for `next build` | `client/src/app/layout.tsx:29-31` | the root layout already wraps it; T-C9 runs `pnpm build` |
| An empty seeded DB has no `agent_runs`, so the demo shows only the empty state | `server/src/db/seed.ts` | the demo runs one review before recording; no seed change |
| Do not touch: migrations, `meta/_journal.json`, snapshots, lock files, `package.json`, `docker compose down -v`, `server/clones/` | root `CLAUDE.md` "Do not touch" | none planned; T-S7 checks `git status` under `server/src/db/` |

## Out of scope

- `*.it.test.ts` for the repository query: Docker is not run during plan execution. It is worth a follow-up, together with any index that EXPLAIN shows is needed.
- Filling `trend` (`[]`) and showing `findings_by_severity`. Severity is computed but not rendered (A-11).
- Carrying the period when switching agents in the editor sidebar (NFR-7 asks only for View).
- Updating `server/README.md` (API map), `client/README.md`, `client/specs/pages.md` and the AGENTS.md lines: docs, done at merge time.
- An e2e flow under `e2e/specs/`: no AC needs a real browser; the manual checks in T-C9 cover the demo.
- Changing `formatCost` or the other screens' money format.
