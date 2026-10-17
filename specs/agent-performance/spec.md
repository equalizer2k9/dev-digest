# Spec: Agent Performance Dashboard
Spec ID: SPEC-06
Status: approved
Supersedes: —

Source: `docs/hw8/requirements.md`. Its decisions are referenced as `D1` to `D14`; they and its
"Не робимо" list are final and were not re-asked (fast mode). Points they do not settle are recorded
as assumptions `A-n` (section after Open questions), not as open questions. UI reference:
`docs/DevDigest Design (standalone).html` (v7) — artboard "Agent Performance (N11)" and the agent
editor's Stats tab. Where this spec departs from the requirements text or the design, the departure
is listed under "Divergences from requirements and design".

## Problem and user

The studio records every review run of every agent — model, duration, cost, status, source — and
every accept / dismiss decision on its findings, but shows none of it in aggregate. A workspace owner
who runs several review agents, locally and in CI, cannot answer "which agent is used most, what does
it cost, and are its findings accepted?", neither for one agent nor across all of them. The homework
text assumes an agent Stats tab already exists; it does not (no stats route, no Stats tab). The user
is the workspace owner who wants one global Agent Performance screen and a per-agent Stats tab whose
numbers agree with each other for the same period, computed only from data already stored, without
any model call, and honest about what is a DevDigest estimate and what is unknown.

## Goals / Non-goals

- G1. A global Agent Performance page, opened from the existing sidebar item, with KPI cards (Total
  runs, Total cost, Avg accept rate, Most-active agent), a per-agent table and a cost breakdown by
  agent and by model (D8–D10).
- G2. A new sixth agent editor tab, Stats, with the same metrics for one agent (D12).
- G3. One aggregation rule set for both views, so a dashboard row and the Stats tab of the same agent
  for the same period are equal by construction (D1).
- G4. A period selector — 1 day, 30 days, custom — that survives a reload and is carried from the
  dashboard to the Stats tab (D6, D12).
- G5. Honest numbers: averages only over runs that have the value, accept rate with its denominator,
  a low-sample flag, cost marked as a DevDigest estimate, and no fabricated zeros while loading, on
  error, or for an agent without runs (D3–D5, D8, D11).
- G6. Distinct loading, error, fully empty and "agent without runs" states (D8).
- G7. No review run and no model call caused by viewing, reloading, sorting or expanding (D10).

Non-goals:

- NG1. Reconciliation with OpenRouter (or any provider) billing; the cost shown is only the studio's
  token-price estimate (D11).
- NG2. Period-over-period deltas on KPI cards or table cells, and the up/down arrows of the design.
- NG3. Sparklines and the "last 5 runs" row expansion of the design; the row expansion shows the
  per-model breakdown instead (D10).
- NG4. On the Stats tab: findings by severity, findings by category, trend chart, most-used skills,
  most-pulled memory and run history table. Only the KPI cards and the period selector are built
  (D12 makes severity and trend optional; A-11).
- NG5. Sorting by any column other than accept rate (A-6).
- NG6. Background or timed refresh of the data (requirements "Не робимо").
- NG7. Any database schema change or migration; an index only if a query plan shows the need (D13).
- NG8. Counting eval runs: they are stored apart from review runs and are never part of these
  numbers (D2).
- NG9. Pixel parity with the design reference.

## User stories

- US-1. As a workspace owner, I want to open Agent Performance from the sidebar and see, for the last
  30 days by default, how many review runs ran, what they cost, how often findings were accepted, and
  which agent was most active.
- US-2. As a workspace owner, I want a table with one row per agent — runs, average cost, average
  duration, accept rate with its denominator, last run — sorted by accept rate, with agents that have
  too few decisions clearly marked and kept at the end.
- US-3. As a workspace owner, I want to see where the total cost went, by agent and by model, with
  every dollar accounted for and unpriced runs listed separately, and to expand an agent's row to see
  its own split by model.
- US-4. As a workspace owner, I want to switch to 1 day or a custom date range, keep that choice on
  reload, and press View on a row to open that agent's Stats tab for the same period with the same
  numbers.
- US-5. As a workspace owner, I want to tell apart "nothing ran in this period", "this agent did not
  run", "still loading" and "loading failed", and never see a zero that is not a real zero.

## Acceptance criteria (EARS)

Definitions.
- A **period** is a half-open UTC interval `[from, to)`.
- A **counted run** for a period is a review run of the caller's workspace whose status is completed
  (`done`) or failed (`failed`) and whose run time is within the period, from either source (local or
  CI). Runs that are still running or were cancelled are not counted (D2).
- A run is **priced** when its cost is known; an unknown cost is never treated as 0 (D3).
- A **decision** is an accept or a dismiss on a finding produced by a counted run; a finding with
  neither is **pending** (D4).
- An **agent row** is the set of metrics for one agent over its counted runs; runs whose agent was
  deleted form one **Deleted agent** row (D9).
- The **low-sample threshold** is a constant equal to 5 decisions (D5).

Aggregation (D1–D5, D7)
- AC-1 (D1). The system shall return, for any agent and period, Stats-tab metrics — runs, priced
  runs, total cost, average cost, average duration, accepted, dismissed, decided, accept rate and the
  low-sample flag — equal to that agent's row of the Agent Performance response for the same period.
- AC-2 (D2). The system shall count as runs of a period exactly the counted runs (Definitions): a run
  with status `running` or `cancelled`, a run of another workspace, and a run whose run time equals
  `to` or is before `from` shall not be counted.
- AC-3 (D6). WHEN a period is requested, the system shall resolve it as: 1 day → `[now − 24 h, now)`;
  30 days → `[now − 30 × 24 h, now)`; custom dates `from`, `to` (UTC calendar dates) → `[from 00:00Z,
  (to + 1 day) 00:00Z)`; no period given → 30 days.
- AC-4 (D3). The system shall compute each average (cost per run, duration per run) only over the
  counted runs that have that value, shall report the number of priced runs next to the number of
  runs, and shall return no value (not 0) for an average when no counted run has that value.
- AC-5 (D4). The system shall compute accept rate as accepted / (accepted + dismissed) over the
  findings of counted runs, shall exclude pending findings from the denominator, shall return the
  decided count with it, and shall return no value (not 0) when the decided count is 0.
- AC-6 (D5). WHEN the table is sorted by accept rate, in either direction, the system shall place
  every row whose decided count is below the low-sample threshold after every row at or above it.
- AC-7 (D7). The system shall name as Most-active agent the existing agent with the most counted runs
  in the period, and IF two or more agents share that count THEN the one with the latest counted run.

Totals and breakdown (D9, D10)
- AC-8 (D9, D10). The system shall make Total runs equal the sum of runs over all rows (Deleted agent
  row included), and Total cost equal each of: the sum of the cost of all rows, the sum of the priced
  lines of the by-agent breakdown, and the sum of the priced lines of the by-model breakdown — where
  each breakdown also has one "unpriced" line carrying the number of unpriced counted runs.

States (D8, D11)
- AC-9 (D8). IF an agent of the workspace has no counted run in a period that has counted runs THEN
  the system shall show that agent's row with "No runs in period" and no numeric metric value.
- AC-10 (D8). IF the period has no counted run at all THEN the system shall show the empty state "No
  runs in this period" with a suggestion to change the period, instead of the KPI cards, table and
  breakdown.
- AC-11 (D8). WHILE the dashboard's or Stats tab's data request is pending or after it has failed,
  the system shall show no numeric metric value (no `0`, `0%`, `$0.00`) in any KPI card, table cell
  or breakdown line; a failed request shall show an error message with a retry action.

No model calls (D10)
- AC-12 (D10). WHEN the dashboard or Stats tab is opened, reloaded or its period changed, the system
  shall issue only reads of its own performance data, and WHEN the table is sorted or a row expanded
  it shall issue no request at all — no request starts a review and no model is called.

## Edge cases

- EC-1. A CI run (source `ci`) stores no findings: it counts in runs, cost and duration (AC-2, AC-4)
  and adds nothing to accepted, dismissed or pending (AC-5). An agent run only in CI therefore has
  accept rate "no value" and is low sample (AC-5, AC-6).
- EC-2. A finding whose review is not linked to a run (older reviews) cannot be attributed to any run
  and is not counted in any decision or pending number (A-4).
- EC-3. A failed run is counted (AC-2); it usually has no findings and may have no cost.
- EC-4. A run of a multi-agent review is an ordinary run of its agent and is counted for that agent.
- EC-5. Every counted run of the period unpriced → Total cost and average cost show no value, the
  caption reads "0 of N priced", and each breakdown has only its unpriced line (AC-4, AC-8).
- EC-6. A run with no recorded model is grouped under one "unknown model" line of the by-model
  breakdown (A-8).
- EC-7. Only Deleted-agent runs in the period → the Deleted agent row and the breakdowns are shown;
  Most-active agent shows "—" (AC-7 counts existing agents only); every existing agent row shows "No
  runs in period" (AC-9).
- EC-8. Two agents with the same name → two rows, told apart by their View links; the Deleted agent
  row has no View link (A-9).
- EC-9. A custom period with `from` after `to`, a malformed date, or only one of the two → the
  server rejects the request as invalid; the page, given such a URL, falls back to 30 days (A-2).
- EC-10. A custom period entirely in the future → the empty state (AC-10).
- EC-11. A run exactly at `from` is counted; a run exactly at `to` is not (AC-2, AC-3).
- EC-12. A decision changed after the period ended (accepted later, or switched from accept to
  dismiss) → the current decision state counts, not the state at the end of the period (A-5).
- EC-13. The Stats tab of an agent of another workspace, or of an unknown agent → "not found".
- EC-14. A workspace with no agents at all → the empty state of AC-10 (no runs can exist except
  Deleted-agent runs, EC-7).

## Non-functional requirements

- NFR-1 (Design N11). Dashboard page: header "Agent Performance" with the period selector button
  (calendar icon) offering "1 day", "30 days" and "Custom" (two date inputs). KPI cards in this order:
  "Total runs", "Total cost", "Avg accept rate", "Most-active agent"; card captions name the active
  period (e.g. "30D"). Total cost card shows "N of M priced". Avg accept rate card shows "x / y
  decided". Most-active card shows the agent name and its run count.
- NFR-2 (Design N11). Table columns in this order: Agent · Runs · Avg cost · Avg dur. · Accept · Last
  run · View. Accept cell shows the percentage and "x / y decided"; a row below the low-sample
  threshold shows a small neutral "low sample" chip next to it. Avg cost shows "N of M priced" when
  N < M. Last run is a relative time with the absolute UTC time as tooltip. The Accept header shows
  the sort direction arrow. "No runs in period" rows are muted and placed after all rows with runs.
- NFR-3 (D10). Row expansion: clicking a row (not View) toggles an inline panel with that agent's
  by-model lines (model, runs, cost) and its unpriced line, taken from the response already loaded.
  More than one row may be expanded at a time.
- NFR-4 (Design N11). "Cost breakdown" block with two parts, "By agent" and "By model", each as a
  donut plus a legend of lines with amount and share; the "unpriced" line is listed in the legend
  with its run count and no amount and is not a donut slice.
- NFR-5 (D11). A badge "Estimated by DevDigest (token prices)" is shown on the Total cost card and on
  the Cost breakdown block, and on the Stats tab's cost card; no text anywhere calls the cost billed
  or reconciled.
- NFR-6 (D12). Agent editor: a sixth tab "Stats" placed as in the design (Config, Skills, Context,
  Evals, Stats, CI). It shows the cards "Total runs", "Avg cost / run" (with "N of M priced"), "Avg
  duration", "Accept rate" (with "x / y decided" and the low-sample chip) and the same period
  selector; it has its own loading, error and "No runs in this period" states (AC-10, AC-11 apply to
  it).
- NFR-7 (D6, D12). The selected period is held in the page URL's query, so a reload keeps it. View on
  a dashboard row opens that agent's Stats tab with the same period in its URL; the Stats tab then
  shows the numbers of AC-1. Covered by a component test of the View link.
- NFR-8. Formatting: money in USD with 2 decimals (4 below $0.01), rates as whole percentages,
  durations in seconds with one decimal (minutes above 60 s). A value that is absent (AC-4, AC-5,
  AC-9) is shown as "—", never as 0.
- NFR-9 (D13). No new table and no migration. Every number is computed on request from the stored
  runs and findings; nothing aggregated is stored or cached on the server.
- NFR-10 (D10). The server side of both views makes no call to the model adapter or the review
  pipeline; an integration test with the mocked model adapter asserts zero calls.
- NFR-11. Workspace scoping: both views read only runs, agents and findings of the caller's
  workspace.
- NFR-12. Performance: one request returns the whole dashboard (cards, rows, per-row model lines,
  both breakdowns) for a 30-day period within 1 s on the seeded database.
- NFR-13. Every caption and static text comes from the studio's message files; agent and model names
  are shown as plain text.
- NFR-14 (D14). Tests: the pure aggregation function (reconciling sums, unpriced cost, low sample,
  most-active tie, Deleted agent, period bounds); a route test (for one agent, its Stats response
  equals its dashboard row); component tests (loading, empty, agent without runs, error without
  zeros, sort and expand issue no request); one repository integration test on real Postgres
  (statuses, period bounds, foreign workspace, run without agent, findings joined through the
  review's run link, decisions, CI run without findings). Each AC maps to at least one of them
  (Traceability).
- NFR-15 (V-2, A-13). Wherever accept rate is shown (the Avg accept rate card, the table's Accept
  column, the Stats tab's Accept rate card), a caption or tooltip states that it covers local reviews
  only, because CI runs store no findings.

## Inputs and provenance

No model call is made in this feature; nothing is sent to any model.

| Input | Used by | Tag | Source |
|---|---|---|---|
| Review runs: agent, workspace, run time, model, duration, cost (null = no known price), status, source | AC-1–AC-4, AC-7, AC-8 | `[reused: review runs, written by local reviews and CI ingest]` | `server/src/db/schema/runs.ts:8-37` (`agent_id` set null on agent delete :13, `cost_usd` :22, `status` :23, `source` :26) |
| Run status values `running` / `done` / `failed` / `cancelled` | AC-2 | `[reused: run lifecycle]` | `server/src/modules/reviews/repository/run.repo.ts:138` (insert `running`), `:149` (complete `done`/`failed`/`cancelled`), `:97` (cancel), `:108` (stale → `failed`) |
| CI runs (status `done`, source `ci`, no findings) | AC-2, EC-1 | `[reused: CI ingest of SPEC-05]` | `server/src/modules/ci/repository.ts:208-209` |
| Finding decisions (accepted / dismissed timestamps, mutually exclusive) | AC-5, AC-6 | `[reused: finding accept / dismiss]` | `server/src/db/schema/reviews.ts:45-46`; exclusivity in `server/src/modules/reviews/repository/review.repo.ts:141,154` |
| Finding → run link (finding → review → run; the review's run link is nullable, no foreign key) | AC-5, EC-2 | `[reused: review records]` | `server/src/db/schema/reviews.ts:20` (`run_id`), `:31` (`review_id`) |
| Agents of the workspace (names, existence) | AC-7, AC-9, NFR-6 | `[reused: agents]` | `server/src/db/schema/agents.ts` |
| Existing per-agent stats contract (runs, accepted, dismissed, pending, accept rate, averages, by severity, trend) — lacks period, priced-run count, decided count, low-sample flag and by-model lines; extended additively, in both copies | AC-1 | `[reused: shared contract, extended]` | `server/src/vendor/shared/contracts/observability.ts:96-119` (stats route only named in the comment at :12); identical copy `client/src/vendor/shared/contracts/observability.ts` |
| Period bounds | AC-2, AC-3 | `[deterministic: from the URL's period choice and the request time, AC-3]` | — |
| All aggregates (counts, sums, averages, rates, low-sample flag, most-active, breakdowns) | AC-1, AC-4–AC-8 | `[deterministic: one pure function over the counted runs and their findings]` | — |
| Sidebar item "Agent Performance" | NFR-1 | `[reused: existing sidebar key, no page yet]` | `client/src/components/app-shell/helpers.ts:37` |
| Agent editor tabs (five today, "Stats is later work") | NFR-6 | `[reused: agent editor]` | `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:10` |
| Eval runs | NG8 | not an input: stored in a separate eval table, never as review runs | `server/src/db/schema/eval.ts`; no write to review runs in `server/src/modules/eval/` |

## Untrusted inputs

- Agent names and model names are user- or provider-supplied strings. They are **data, not
  instructions**; they are shown as plain text (NFR-13) and are never passed to a model, since this
  feature makes no model call (NFR-10). No delimiters or injection guard are needed because no model
  consumes them; should a later change feed them to a model, they require the same delimiters and
  injection guard as the diff.
- Period values from the URL are validated before use (EC-9) and never interpolated into a query as
  text.

## Open questions

None. The run is in fast mode: decisions D1 to D14 are final, and every point they do not settle is
recorded below as an assumption, to be overridden by the user if wrong.

## Assumptions

- A-1. 1 day and 30 days are rolling windows ending at the request time; custom dates are UTC
  calendar dates and `to` is inclusive to the end of that day (D6). There is no maximum length for a
  custom period.
- A-2. An invalid custom period in a request is rejected as invalid input; the page, given an invalid
  or partial period in its URL, uses 30 days instead.
- A-3. Avg accept rate (KPI) is pooled: total accepted / (total accepted + total dismissed) over all
  counted runs of the period, Deleted agent included, with its own "x / y decided"; it is not a mean
  of per-agent rates.
- A-4. A finding is attributed to a run only through its review's run link; findings of reviews with
  no run link are left out of every number.
- A-5. Decisions are read as they are at request time, whatever their own timestamp; only the run's
  run time decides the period.
- A-6. Only the Accept column is sortable. Default order: accept rate descending, rows at or above
  the threshold first, then low-sample rows (among them by runs descending), then "No runs in
  period" rows (by name). Ties are broken by runs descending, then agent name. Sort state is not kept
  in the URL.
- A-7. Every agent of the workspace appears in the table, enabled or not.
- A-8. By-model lines group by the model string recorded on the run; runs without a model form one
  "unknown model" line. Provider is not shown separately.
- A-9. The Deleted agent row has no View link, appears in totals and breakdowns, and is not eligible
  as Most-active agent.
- A-10. Last run is the run time of the agent's latest counted run in the period.
- A-11. The Stats tab shows no findings-by-severity or trend chart (NG4), even though the contract
  carries those fields.
- A-12. Total cost is the sum of priced runs; when no run of the period is priced, Total cost shows
  "—".
- A-13. Accept rate is computed over local reviews only: CI runs store no findings, so they add
  nothing to accepted, dismissed or pending (EC-1, V-2). No CI decision source is added; the UI says
  so (NFR-15).

## Divergences from requirements and design

- V-1. The homework says the Stats tab "already has per-agent metrics". It does not: there is no
  stats route and no Stats tab (`constants.ts:10`). Both are built here, on one aggregation (D1, D12).
- V-2. CI runs carry no findings, so accept rate reflects local reviews only; CI runs count in runs,
  cost and duration (EC-1).
- V-3. Findings of reviews without a run link are not attributable and are excluded (A-4).
- V-4. Design deltas, sparklines, Stats-tab skills, memory, severity, category and run history are
  dropped (NG2–NG4).
- V-5. The design's row expansion ("last 5 runs" sparkline, "avg Xs · $Y") is replaced by the agent's
  by-model breakdown from the same response (D10, NFR-3).
- V-6. The design's mock numbers do not reconcile (by-agent sum ≠ total); this spec requires they do
  (AC-8).

## Out of scope

- Billing reconciliation with OpenRouter; charts other than the cost breakdown; export; background
  refresh (requirements "Не робимо").
- Changes to how runs, costs or decisions are recorded, to CI ingest, or to the eval pipeline.
- The demo video and the pull request themselves (delivery, not behaviour).

## Traceability

| Decision | Covered by | Test level (D14) |
|---|---|---|
| D1 one aggregation for both routes | AC-1 | route test: Stats == dashboard row |
| D2 run = done or failed, in period, local + CI; evals excluded | AC-2, EC-1, EC-3, NG8 | pure function (status, source, bounds) + repository integration test (statuses, bounds, foreign workspace) |
| D3 averages over priced / timed runs, "N of M priced" | AC-4, EC-5, A-12 | pure function (null cost) |
| D4 accept rate with denominator, pending excluded; local reviews only | AC-5, A-3, A-4, A-13, NFR-15 | pure function + repository integration test (decisions via run link, CI run without findings) + component test (local-only caption) |
| D5 low sample < 5, sorted last | AC-6, NFR-2 | pure function + component sort test |
| D6 1 d / 30 d / custom, UTC, `to` inclusive, default 30 d, in URL | AC-3, AC-2, EC-9, EC-11, NFR-7, A-1, A-2 | pure function (period bounds) + component test |
| D7 most-active, tie → latest run | AC-7, A-9 | pure function (tie) |
| D8 agent without runs vs empty dashboard; loading / error without zeros | AC-9, AC-10, AC-11 | component tests |
| D9 Deleted agent row | AC-8, EC-7, A-9 | pure function (Deleted agent) + repository integration test (run without agent) |
| D10 breakdowns reconcile, unpriced line, expansion from same response, no model calls | AC-8, AC-12, NFR-3, NFR-4, NFR-10 | pure function (sums) + component test (no request) + route test (no model call) |
| D11 cost badge "Estimated by DevDigest (token prices)" | NFR-5, NG1 | component test |
| D12 Stats tab, same cards and selector, View with same period; severity / trend optional | AC-1, NFR-6, NFR-7, NG4, A-11 | component test (View link) |
| D13 no tables or migrations | NFR-9, NG7 | review of the change set |
| D14 tests | NFR-14, this table | — |

## Changelog

- 2026-10-17 — approved (SPEC-06).
- 2026-10-17 — NFR-14 adds a repository integration test on real Postgres (AC-2, AC-5, AC-8); A-13 and
  NFR-15: accept rate covers local reviews only, and the UI says so.
