# Plan verification — Agent Performance Dashboard (HW8)

## 1. Inputs

| | |
|---|---|
| Spec | `specs/agent-performance/spec.md` — SPEC-06, Status: approved |
| Plan | `specs/agent-performance/plan.md` |
| Requirements | `docs/hw8/requirements.md` (D1–D14) |
| Branch | `feat/hw8-agent-performance` |
| Base | `639b564` docs(specs): agent performance — repository integration test, local-only accept rate |
| Head | `4f1a31f` feat(client): agent performance dashboard and agent Stats tab |
| Commits | `e3e82b6` feat(server) — server group T-S1..T-S7 · `4f1a31f` feat(client) — client group T-C1..T-C9 |

## 2. Matrix

Tasks and tests come from the plan's Traceability table. Evidence and status come from the merged server and client verifier matrices. For an AC checked by both verifiers, the evidence of both is listed and the status is the worse of the two.

| AC | task(s) | test (file › case) | commit | evidence (file:line) | status |
|---|---|---|---|---|---|
| AC-1 | T-S1, T-S3, T-S5, T-S6, T-C8 | `routes.test.ts` › stats equals the agent's dashboard row, no model call; `helpers.test.ts` › toAgentStats equals its row; `service.test.ts` › stats equals the dashboard row; `StatsTab.test.tsx` › URL period, response values | e3e82b6, 4f1a31f | server: `service.ts:48-52`, `helpers.ts:252-256`, `observability.ts:158-202`, `routes.test.ts:75-95` · client: `StatsTab.tsx:28-30,55-83`, `PerformanceTable.tsx:67-75`, `StatsTab.test.tsx:78-92`, `PerformanceTable.test.tsx:114-120` | PASS |
| AC-2 | T-S2, T-S3, T-S4 | `helpers.period.test.ts` › bounds, statuses, workspace, sources; `helpers.test.ts` › excluded runs add nothing; `agent-performance-repository.it.test.ts` › real SQL statuses, `[from, to)`, foreign workspace | e3e82b6 | `repository.ts:48-55`, `constants.ts:7`, `helpers.ts:62-71,182`, `helpers.period.test.ts:59-82`, `helpers.test.ts:60-73`, `agent-performance-repository.it.test.ts:84-104,141-143` | PASS |
| AC-3 | T-S1, T-S2, T-S5, T-C1, T-C4 | `agent-performance-contracts.test.ts` › PerfPeriodQuery; `helpers.period.test.ts` › 1d/30d/custom/default; `service.test.ts` › default 30 d; `lib/agent-performance.test.ts` › invalid URL → 30d; `PeriodSelector.test.tsx` | e3e82b6, 4f1a31f | server: `helpers.ts:48-59`, `constants.ts:9-14`, `observability.ts:104-130` · client: `lib/agent-performance.ts:22-47`, `PeriodSelector.tsx:17,32-66`, `page.tsx:11-12` | PASS |
| AC-4 | T-S1, T-S3, T-C1 | `helpers.test.ts` › priced / timed averages, null; client `agent-performance.test.ts` › `formatUsd(null)` → "—" | e3e82b6, 4f1a31f | server: `helpers.ts:129-131,145-146,156-159` · client: `lib/agent-performance.ts:59-74`, `AgentPerformanceView.tsx:52,56`, `PerformanceTable.tsx:100-107`, `StatsTab.tsx:58-69` | PASS |
| AC-5 | T-S1, T-S3, T-S4, T-C1, T-C3, T-C5 | `helpers.test.ts` › 3/(3+1), pending excluded, null, CI-only, pooled; `.it.test.ts` › decisions via `reviews.run_id`, unlinked review not counted, CI run 0/0/0; client `formatRate(null)`; `PerformanceTable.test.tsx` › local-only tooltip | e3e82b6, 4f1a31f | server: `helpers.ts:132-136,151-152,204-206,236`, `repository.ts:35-47`, `.it.test.ts:106-136,146-167` · client: `AgentPerformanceView.tsx:63-68`, `PerformanceTable.tsx:53,111-112`, `StatsTab.tsx:74-79`, `agentPerformance.json:46` | PASS |
| AC-6 | T-S3, T-C5 | `helpers.test.ts` › low_sample < 5; `PerformanceTable/helpers.test.ts` › low-sample last both directions; `PerformanceTable.test.tsx` › Accept click | e3e82b6, 4f1a31f | server: `constants.ts:4`, `helpers.ts:154` · client: `PerformanceTable/helpers.ts:15-24`, `PerformanceTable.tsx:26,29,55`, `helpers.test.ts:42-77` | PASS |
| AC-7 | T-S3, T-C7 | `helpers.test.ts` › tie → later run, Deleted not eligible, null; `AgentPerformanceView.test.tsx` › Most active name + runs or "—" | e3e82b6, 4f1a31f | server: `helpers.ts:218-240`, `helpers.test.ts:145-165` · client: `AgentPerformanceView.tsx:72-81`, `AgentPerformanceView.test.tsx:160-172` | PASS |
| AC-8 | T-S3, T-S4, T-C6 | `helpers.test.ts` › totals = Σ rows = Σ by_agent = Σ by_model; `.it.test.ts` › run without agent, totals over real rows; `CostBreakdown/helpers.test.ts`; `CostBreakdown.test.tsx` | e3e82b6, 4f1a31f | server: `helpers.ts:82-105,186-216,242-243,167`, `.it.test.ts:169-181` · client: `CostBreakdown/helpers.ts:20-66`, `CostBreakdown.tsx:32,71,74-75` | PASS |
| AC-9 | T-S3, T-C5, T-C7 | `helpers.test.ts` › zero-run row, null metrics; `PerformanceTable.test.tsx` › "No runs in period", no digit; `AgentPerformanceView.test.tsx` › agent without runs | e3e82b6, 4f1a31f | server: `helpers.ts:141-168,198`, `helpers.test.ts:200-210` · client: `PerformanceTable.tsx:77-87`, `PerformanceTable.test.tsx:87-92`, `AgentPerformanceView.test.tsx:153-158` | PASS |
| AC-10 | T-C7, T-C8 | `AgentPerformanceView.test.tsx` › totals.runs 0 → empty state; `StatsTab.test.tsx` › runs 0 → empty state | 4f1a31f | `AgentPerformanceView.tsx:37-44,96`, `StatsTab.tsx:45-52`, `agentPerformance.json:7-10`, tests `AgentPerformanceView.test.tsx:140-151`, `StatsTab.test.tsx:117-123` | PASS |
| AC-11 | T-C4, T-C7, T-C8 | `AgentPerformanceView.test.tsx` › loading / error without numbers + retry; `StatsTab.test.tsx` › same; `KpiCard.test.tsx` › null → "—"; manual: throttled network | 4f1a31f | `AgentPerformanceView.tsx:26-34`, `StatsTab.tsx:36-44`, `KpiCard.tsx:21`, tests `AgentPerformanceView.test.tsx:121-138`, `StatsTab.test.tsx:100-115`, `KpiCard.test.tsx:8-12` | PARTIAL — needs runtime check · **runtime check run (§5): passed** |
| AC-12 | T-S5, T-S6, T-C2, T-C7 | `routes.test.ts` › zero MockLLMProvider calls; `service.test.ts` › no adapter touched; `hooks/agent-performance.test.ts` › GET only; `AgentPerformanceView.test.tsx` › sort/expand issue no request; manual: Network tab | e3e82b6, 4f1a31f | server: `routes.ts:18-34`, `service.ts:34-52`, `repository.ts:24-56`, `routes.test.ts:92-94`, `service.test.ts:95-102` · client: `hooks/agent-performance.ts:11-26`, `PerformanceTable.tsx:26-37`, `AgentPerformanceView.test.tsx:190-206` | PARTIAL — needs runtime check · **runtime check run (§5): passed** |

Task rows from the verifiers: T-S1..T-S6 PASS, T-C1..T-C8 PASS; T-S7 PARTIAL and T-C9 PARTIAL (manual live-stack steps), both run in §5 and passed.

Counts (verifier statuses, copied): **PASS 10 · PARTIAL 2 · MISSING 0**. Both PARTIAL rows were "needs runtime check"; the check was run and passed (§5).

## 3. Open rows

- AC-11 — PARTIAL in the verifier matrix only because the throttled-network check was manual. Run in §5: during a 4 s API latency the page showed no KPI card and no `0`, `0%` or `$0.00`; with the API blocked it showed "Could not load agent performance." and Retry, no KPI, no zeros. Nothing left to close. Note: the loading snapshot did not contain the word "loading" (the dev page may still have been compiling, or the copy differs) — the AC's requirement (no numeric value) held.
- AC-12 — PARTIAL only because the Network-tab check was manual. Run in §5: two Accept-header clicks and two row expansions issued 0 API requests; the Stats tab issued only GETs. Nothing left to close.

## 4. Reviews

### Architecture review

- Rounds: 1 review, 0 fix rounds.
- Verdict: PASS — CRITICAL 0, WARNING 0, SUGGESTION 0, INFO 9.
- Fixed: nothing (nothing to fix).
- CRITICAL / major open: none.
- minor/nit: none. The INFO items confirm layering (route → service → repository; agents via `container.agentsRepo`; Drizzle only in the repository; pure `helpers.ts`; hook is the only `api` caller; type-only client imports from `@devdigest/shared`; placement of `StatsTab`, `KpiCard`, `PeriodSelector`; showcase append-only). One INFO asked to confirm byte identity of the two `observability.ts` copies — confirmed with `cmp` (§5).

### Security review

- Rounds: 1 review, 0 fix rounds.
- Verdict: PASS — CRITICAL 0, WARNING 0, SUGGESTION 0.
- Checked: workspace scoping (WHERE on `agent_runs.workspace_id`, workspace on the `reviews` join, `getById(workspaceId, id)` → 404 for a foreign agent, workspace from `getContext` only); period validated by the route `querystring` schema, values reach SQL only as `Date` through Drizzle helpers; no `dangerouslySetInnerHTML`, names rendered as text; the only dynamic href is built from a server id and a re-validated period; no path to a model call; no logging of secrets.
- CRITICAL / major open: none. minor/nit: none.

## 5. Checks

| Command / check | Result |
|---|---|
| `server`: `pnpm typecheck` | pass |
| `server`: `pnpm exec vitest run --exclude '**/*.it.test.ts'` | 72 files, 930 tests passed |
| `server`: `pnpm exec vitest run test/agent-performance-repository.it.test.ts` (Docker 29.1.3, testcontainers) | 1 file, 1 test passed |
| `cmp server/src/vendor/shared/contracts/observability.ts client/src/vendor/shared/contracts/observability.ts` | identical |
| `client`: `pnpm typecheck` | pass |
| `client`: `pnpm test` | 97 files, 788 tests passed |
| `client`: `pnpm build` | pass; `/agent-performance` 5.96 kB |
| `git status --porcelain server/src/db/` | empty (no schema / migration change) |
| T-S7 live: `./scripts/dev.sh --db-only` (existing volume, 93 runs: 81 done local, 1 done ci, 11 failed), API on :3001, custom period 2026-01-01..2026-10-17 | `GET /agent-performance` totals: runs 93, priced 82, cost 0.095824888, decided 54, accept 0.685; Σ rows runs 93; Σ rows cost = Σ by_agent = Σ by_model = 0.095824888 |
| T-S7 live: `GET /agents/:id/stats` for all 5 agents vs their dashboard row, same period | equal for all 5 (minus id/name/period); period objects equal |
| T-S7 live: `EXPLAIN ANALYZE` of the runsInPeriod SQL (30 d) | Execution Time 0.251 ms; `GET /agent-performance` 1.7–3.6 ms (NFR-12 < 1 s) |
| T-C9 live, headless Chrome over CDP (isolated profile; script `cdp-check.mjs` in the session scratchpad), web on :3000 | dashboard shows "82 of 93 priced", "37 / 54 decided", cost badge, "Local reviews only — CI runs store no findings"; reload keeps `?period=custom&from=2026-01-01&to=2026-10-17` |
| T-C9 / AC-12: two Accept clicks + two row expansions | 0 API requests |
| T-C9 / AC-1: View → `/agents/<General Reviewer>?tab=stats&period=custom&from=2026-01-01&to=2026-10-17` | Stats tab shows "33 of 37 priced", "17 / 20 decided" = the dashboard row; requests: GET only (`/agents`, `/agents/:id`, `/repos`, `/repos/:id/pulls` of the editor page, `/agents/:id/stats?…`) |
| T-C9 / AC-10: future custom period 2030-01-01..2030-01-02 | "No runs in this period" shown |
| AC-11: 4 s network latency, snapshot at 2.5 s | no KPI card, no `0%` / `$0.00` |
| AC-11: API blocked (`Network.setBlockedURLs`) | "Could not load agent performance." + Retry; no KPI card, no zeros |

The chrome-devtools MCP browser could not be used (its profile was locked by another running instance), so the browser checks ran in a separate headless Chrome. The servers and Postgres started for these checks were stopped afterwards (`docker compose stop`, volume kept).

## 6. Deviations

### Server group (T-S1..T-S7)

1. `resolvePeriod`, `PeriodInput` and `AgentPerformanceService` take `Partial<Pick<PerfPeriodQuery, 'period'|'from'|'to'>>`, because the output type of `PerfPeriodQuery` has `period` required (default) and the plan's tests pass `{}`. No AC changes meaning.
2. T-S4: the repository and its integration test were written in the same step; the test was not seen failing first. It passed on its first run.
3. A bug in the service test's own stub (a default parameter swallowed `undefined`) was fixed in the test; no assertion was weakened.
4. Contract additions carry doc comments; `PerfPeriodPreset` and `PerfIsoDate` also export inferred types of the same name (naming convention).
5. T-S7 manual curl / EXPLAIN were skipped by the implementer; run by the main session (§5).
6. Open note: tests under `server/test/` are not covered by `pnpm typecheck` (tsconfig includes only `src/**`); vitest runs them.
7. Verifier note: `resolvePeriod` keeps `preset: 'custom'` with a 30-day window when called directly with custom but without both dates; unreachable through the routes (422).

### Client group (T-C1..T-C9)

1. `donutSegments` / `legendLines` take an extra argument (translated unknown label / `unknownKey`); `legendLines` takes optional `colors`.
2. Legend shares use largest-remainder rounding — priced shares sum to exactly 100 (stricter than the plan's ±1).
3. Extra message keys: `kpi.mostActiveRuns`, `table.expandedModels`, `breakdown.runs`, `breakdown.noCost`. Verifier: the `retry` key is defined but unused (ErrorState supplies its own label).
4. The period `Dropdown` trigger shows the current period, with `aria-label` "Period".
5. `parsePeriodParams` also rejects `1d`/`30d` carrying dates and dates without `period`, mirroring the server schema.
6. Test-only: the six-tab test checks DOM order via `getByText` (`Tabs` has no `role="tab"`); the View-link test calls `preventDefault` (jsdom has no navigation).
7. Tests were written in the same step as their code; no separate red run was recorded.
8. Open notes: the block inside `{legend && (…)}` in `Donut.tsx` is not re-indented (no behaviour change); no test asserts that the new sidebar item highlights on `/agent-performance` (`activeKeyFor` already maps the key).
9. T-C9 manual checks were skipped by the implementer; run by the main session (§5).
