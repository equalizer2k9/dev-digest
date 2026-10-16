# Plan verification — Multi-Agent Review (HW7, Part A)

> Written to this file, not `docs/hw7/plan-verification.md`: that path already holds the Part B
> (export-to-ci, SPEC-05) report from a parallel run, and was left untouched.

## 1. Inputs

| | |
|---|---|
| Spec | `specs/multi-agent-review/spec.md` — SPEC-04, `Status: approved` |
| Plan | `specs/multi-agent-review/plan.md` |
| Requirements | `docs/hw7/requirements.md`, Part A |
| Branch | `feat/multi-agent-review` (cherry-picked from the mixed local `feat/homework-7`) |
| Base | `d24a10f` (last commit before the run; merge-base with `main` is `c583b67`) |
| Head | `5e28dd2` |
| SHA map | `ffe29a1`→`2e444a5` · `859a00b`→`b2ab8a4` · `870053e`→`d287ebf` · `a9e9312`→`5e28dd2`; the SHAs below are the original ones |
| Feature commits | `ffe29a1` feat(server) · `859a00b` feat(client) · `870053e` fix(client): address review · `a9e9312` fix(server): address review |

`9438a7d`, `5f2a27a`, `f5884e1` (export-to-ci, Part B) sit between base and head. A parallel session committed them; they are not part of this run.

## 2. Matrix

Commits: server tasks T-1..T-9 → `ffe29a1` (T-8, T-9 also `a9e9312`); client tasks T-10..T-14 → `859a00b` (T-12, T-13 also `870053e`).

| AC | task(s) | test (file › case) | commit | evidence (file:line) | status |
|---|---|---|---|---|---|
| AC-1 | T-1, T-2, T-7, T-8, T-9, T-10, T-11, T-12, T-14 | `multi-run-service.test.ts` › launch with 3 enabled agents creates one multi run and calls runReview … with its multiAgentRunId; `multi-run.it.test.ts` › POST {agentIds:[a,b,c]} → 200 with multi_run_id and 3 runs …; `multi-agent.test.ts` › useLaunchMultiRun posts { agentIds }; `RunReviewDropdown.test.tsx` › launching with two ticked agents posts … and navigates; manual: launch on PR #21 and land on `/multi-agent/<id>` | `ffe29a1`, `859a00b`, `a9e9312`, `870053e` | server: `routes.ts:34-45,62-64`; `multi-run/multi-run-service.ts:63-80`; `service.ts:114,126-134`; `repository/run.repo.ts:126,137`; `repository/multi-run.repo.ts:19-28`; `db/schema/runs.ts:33-36`; `0015_oval_skrulls.sql:1-2`. client: `lib/hooks/multi-agent.ts:36-47`; `RunReviewDropdown.tsx:56-69,108,137-149`; `NewMultiRunDialog.tsx:28-41,84-94`. Note: rows inserted as `running`, not `queued` (`run.repo.ts:138`) — plan decision, both "in progress" | PASS — live 2026-10-16: PR #21, 3 agents → `/multi-agent/74449604…` at once (`multi-agent/01-running.png`) |
| AC-2 | T-1, T-8, T-9, T-12 | `contract.test.ts` › MultiRunRequest rejects 1 id, 6 ids, a duplicate and a non-uuid; `multi-run-service.test.ts` › an id that is disabled, unknown or of another workspace → ValidationError and nothing is created; `multi-run.it.test.ts` › POST with 1 id, 6 ids or a duplicate → 422, counts unchanged; `RunReviewDropdown.test.tsx` › a validation_error keeps the modal open … | `ffe29a1`, `859a00b`, `a9e9312` | server: `vendor/shared/contracts/multi-agent.ts:15-22`; `routes.ts:37-41`; `multi-run-service.ts:51-61` (before insert `:69` < `:75`). client: `MultiAgentPicker/helpers.ts:23-30`; `MultiAgentPicker.tsx:88`; `RunReviewDropdown.tsx:61-67` | PASS |
| AC-3 | T-9, T-12 | `multi-run.it.test.ts` › POST {agentId} and POST {all:true} → the same keys as before, no multi_run_id, no multi_agent_runs row; `RunReviewDropdown.test.tsx` › single agent item still calls useRunReview with { prId, agentId } only; `server/test/reviews.it.test.ts` stays green | `ffe29a1`, `859a00b`, `a9e9312` | server: `routes.ts:36-37,65-76`; `service.ts:133`; `run.repo.ts:137`. client: `RunReviewDropdown.tsx:71-79,84-91,102-107` (no client test for `{all:true}` item) | PASS |
| AC-4 | T-6 | `run-executor.test.ts` › starts every agent's model call before any of them finishes; › loads the diff once for two agents | `ffe29a1` | `run-executor.ts:108-117` (diff once), `:127-135` (intent once), `:158-190` (`Promise.allSettled`); `service.ts:141`. No test asserts intent derived once | PASS |
| AC-5 | T-6 | `run-executor.test.ts` › one agent failing does not stop the other; › a cancelled agent ends as cancelled while the other completes | `ffe29a1` | `run-executor.ts:164-188,190` | PASS |
| AC-6 | T-5, T-8, T-9, T-10, T-11 | `estimate.test.ts` › mean duration and mean cost …, › no rows → both null; `multi-run-service.test.ts` › estimates returns one entry per enabled agent …; `helpers.test.ts` (MultiAgentPicker) › totalEstimate sums cost and takes the max duration; `MultiAgentPicker.test.tsx` › lists one checkbox per estimate … "—" when null | `ffe29a1`, `859a00b` | server: `repository/multi-run.repo.ts:176-195`; `multi-run/estimate.ts:4-22`; `multi-run-service.ts:163-173`; `multi-run/routes.ts:30-33`. client: `lib/hooks/multi-agent.ts:29-34`; `MultiAgentPicker/helpers.ts:9-20,32-41`; `MultiAgentPicker.tsx:53-78` | PASS |
| AC-7 | T-1, T-4, T-8, T-9, T-13 | `run-summary.test.ts` › wall-clock = latest finish − start, › totals add known tokens and costs; `multi-run-service.test.ts` › get returns pr, status, started_at, wall_clock_ms, totals and one agent entry per run …; `multi-run.it.test.ts` › GET /multi-runs/:id after the runs settle …; `MultiRunView.test.tsx` › renders the header …, › renders one column per agent … | `ffe29a1`, `859a00b`, `870053e` | server: `repository/multi-run.repo.ts:31-54,57-65`; `multi-run-service.ts:82-143`; `run-summary.ts:5-44`; `multi-run/routes.ts:35-42`; contract `multi-agent.ts:54-92`. client: `MultiRunView.tsx:54-77`; `AgentColumns.tsx:36-80` (findings `:57-60`, score `:61-64`). Client: `MultiRunView.test.tsx` › renders one column per agent … now asserts the findings count (3, and "—" while running). Live: columns 3 / 3 / 5 = `findings` rows per run in the DB (3 / 3 / 5), `multi-agent/02-done-columns.png` | PASS |
| AC-8 | T-10, T-13 | `multi-agent.test.ts` › useMultiRun re-requests every 2 s while an agent run is running; › stops re-requesting once no agent run is in progress; manual: on a running multi run, the Network tab shows `GET /multi-runs/<id>` every ~2 s and stops after the last agent finishes | `859a00b` | `lib/hooks/multi-agent.ts:18` (`MULTI_RUN_POLL_MS = 2000`), `:21-27`, `:50-58`; tests `multi-agent.test.ts:89-103,105-118,120-137` | PASS — live: 39 × `GET /multi-runs/:id`, every 2007–2011 ms, last at 78.2 s (run done at 76.9 s), none in the following 22 s |
| AC-9 | T-3, T-8, T-13 | `grouping.test.ts` › same file, overlapping lines, similar titles … → one group; › … "unfinished review" vs "SSRF in fetch" → two groups; › two matching findings of the same agent never share a group; › representative is the highest severity …; › input arrays are not mutated; `FindingGroups.test.tsx` › shows the representative … expanding shows one FindingCard per member | `ffe29a1`, `859a00b`, `870053e` | server: `multi-run/grouping.ts:20-80`; `multi-run/constants.ts:4,12-16`; `multi-run-service.ts:99-111`; `multi-run.repo.ts:88-92`. client: `FindingGroups.tsx:37-72`; `FindingGroups/helpers.ts:6-18`; `lib/hooks/multi-agent.ts:68-82` | PASS |
| AC-10 | T-4, T-8, T-13 | `disagreements.test.ts` › one cell per agent run in launch order; › conflict when a finished agent did not flag it; › conflict when member severities differ; › pending and failed never make a conflict; `DisagreementsSection.test.tsx` › one cell per agent with severity / did not flag / failed / pending copy | `ffe29a1`, `859a00b` | server: `multi-run/disagreements.ts:7-34`; `run-summary.ts:5-7`. client: `DisagreementsSection.tsx:37-59`; `DisagreementsSection/helpers.ts:11-13` (missing cell shown as "pending" — client fallback) | PASS |
| AC-11 | T-13 | `DisagreementsSection.test.tsx` › "Show only conflicts" on → only conflict groups; off → all again; › toggling issues no request | `859a00b` | `DisagreementsSection.tsx:19-20,24-27`; `DisagreementsSection/helpers.ts:6-8`; tests `DisagreementsSection.test.tsx:86-94,96-101,103-107` | PASS |
| AC-12 | T-1, T-4, T-7, T-8, T-9, T-10, T-14 | `multi-run-service.test.ts` › list passes limit 20 and keeps … newest-first order …; `multi-run.it.test.ts` › GET /multi-runs after 21 launches → 20 items, newest first; `multi-agent.test.ts` › useMultiRuns(prId) requests /multi-runs?pr_id=…; `MultiRunListView.test.tsx` › renders one row per run … | `ffe29a1`, `859a00b` | server: `multi-run.repo.ts:105-173` (workspace filter `:110-112`); `constants.ts:9`; `multi-run-service.ts:145-161`; `multi-run/routes.ts:20-27`. client: `lib/hooks/multi-agent.ts:60-65`; `MultiRunListView.tsx:27-102`; `vendor/ui/nav.ts:29` | PASS |

## 3. Open rows

- **AC-7 — closed 2026-10-16** by a findings-count assertion in `MultiRunView.test.tsx` and the live check (§7).

Related non-AC gaps from the client verifier (not in the matrix):
- NFR-2 PARTIAL — loading placeholder only at page level (`MultiRunView.tsx:27-46`), not per section.
- NFR-9 PARTIAL — a few separators hard-coded in JSX (`": "` at `MultiRunView.tsx:62`, `FindingGroups.tsx:46,53`; `" / "` at `AgentColumns.tsx:50`, `MultiRunView/helpers.ts:13`; `#` prefix) instead of message keys. Untrusted text is rendered as plain text (tested: `FindingGroups.test.tsx:93-98`, `AgentColumns.test.tsx:73-76`).

Optional coverage noted by the server verifier: AC-4 test that intent (`ensureForReview`) is derived once; AC-12 integration case that another workspace's runs are absent from `GET /multi-runs`.

## 4. Reviews

### Architecture review

- Rounds: initial review + 1 fix round (re-review of the fix only).
- Initial: 2 CRITICAL, 3 WARNING (major), 2 SUGGESTION.
- Fixed (all 5 CLOSED in re-review):
  - CRITICAL `FindingGroups.tsx:9` / `AgentColumns.tsx:10` — cross-route import of pulls-page `_components` → `FindingCard`, `EvalCaseButton`, `RunTraceDrawer` promoted to `client/src/components/{findings,eval,run-trace}/` (`870053e`).
  - WARNING `server/src/modules/reviews/routes.ts:47` — `Schema.parse` in handler → `ReviewRunBody` route body schema (`a9e9312`).
  - WARNING `routes.ts:31` — `new ReviewRepository(container.db)` in route → `container.reviewRepo` (`a9e9312`).
  - WARNING `multi-run/routes.ts:15` — service via plugin opts → `new MultiRunService(container)` (`a9e9312`).
- CRITICAL / major still open: none.
- minor/nit (shown to the user, not sent to the implementer):
  - SUGGESTION `client/src/components/multi-agent/MultiAgentPicker/helpers.ts:32` — `formatCost`/`formatDuration` are a fourth copy of general formatters (also in `CiRunsTable/helpers.ts`, `RunTraceDrawer/helpers.ts`).
  - SUGGESTION `client/src/lib/hooks/multi-agent.ts:21` — `isInProgress`/`hasInProgress` duplicate the server rule in `run-summary.ts`; may drift.
  - SUGGESTION (fix re-review) `server/src/modules/reviews/routes.ts:50` + `multi-run/routes.ts:18` — two `MultiRunService` instances; a `container.multiRunService` getter would dedupe.
  - SUGGESTION (fix re-review) `routes.ts:34-45` — `ReviewRunBody` belongs in module schemas / `_shared/schemas.ts`; the `as` casts at `:43-44` could go.
  - INFO (fix re-review) `multi-run-service.ts:47` — `new ReviewService(container)` still builds its own `ReviewRepository` (stateless, harmless).

### Security review

- Rounds: initial review only (no CRITICAL/major → no fix round, no re-review).
- Verdict: PASS. Workspace scoping, A-11 generic 422, rate limit, plain-text rendering and failure isolation checked clean.
- CRITICAL / major still open: none.
- minor/nit (shown to the user):
  - SUGGESTION `server/src/modules/reviews/multi-run/grouping.ts:62` — titles re-tokenised on every comparison, run on every 2 s poll; precompute word sets / cap findings.
  - SUGGESTION `server/src/modules/reviews/routes.ts:39` — rate limit counts requests, not agent runs (10 launches × 5 agents/min); `Promise.allSettled` has no concurrency cap.
  - INFO `server/src/modules/reviews/routes.ts:132,139,66` — pre-existing cancel / trace / events routes take only a run id, no workspace check; now surfaced from the multi-agent page.

## 5. Checks

| Command (package) | When | Result |
|---|---|---|
| `pnpm typecheck` (server) | after server group | pass |
| `pnpm test` (server, incl. `*.it.test.ts` on Docker) | after server group | 85 files, 1000 tests passed |
| `pnpm typecheck` (client) | after server group (contract copy) | pass |
| `pnpm typecheck` (client) | after client group | pass |
| `pnpm test` (client) | after client group | 82 files, 665 tests passed |
| `pnpm typecheck` + `pnpm test` (client) | after fix round 1 | pass; 82 files, 665 tests passed |
| `pnpm typecheck` + `pnpm test` (server) | after fix round 1 | pass; 85 files, 1000 tests passed |
| `pnpm exec vitest run src/modules/reviews/multi-run/multi-run.it.test.ts test/reviews.it.test.ts` (server) | verifier runtime check | 2 files, 18 tests passed (Docker, not skipped) |
| `pnpm exec vitest run src/lib/hooks/multi-agent.test.ts src/components/multi-agent src/app/multi-agent ".../RunReviewDropdown"` (client) | verifier runtime check | 10 files, 51 tests passed |
| `pnpm build` (client) | verifier runtime check | build succeeded |
| Manual: launch on PR #21 → `/multi-agent/<id>`; Network tab shows `GET /multi-runs/<id>` every ~2 s, stops after last agent | AC-1 / AC-8 manual | **run 2026-10-16** on `feat/multi-agent-review` — see §7 |
| `pnpm typecheck` + `pnpm test` + `pnpm build` (client), after the live-check fixes | 2026-10-16 | pass; 76 files, 624 tests |

Server and client checks ran on a working tree that also held the parallel Part B session's uncommitted edits at the time of the first server check.

## 6. Deviations

### Server group (T-1..T-9)
- `vendor/shared/index.ts` (both copies): `multi-agent` export sits before `adapters.js`, not at the very end; still +1 line.
- Test fixtures (`FindingRow`, `GroupMember`) hand-written with `as` casts.
- `rangesOverlap` accepts null/undefined `end_line` (falls back to `start_line`, EC-9) though the contract field is non-nullable.
- `multi-run.repo.ts` reuses `AgentRunRow` from `db/rows.ts`; `listMultiRuns` also returns `reviewCreatedAt` so the list wall-clock uses the same finish rule as `get`.
- `launch` has no transaction (as planned); pull/repo read twice (once in launch, once in `runReview`).
- Fix round: body validated by a `ReviewRunBody` route schema (`z.unknown().transform`) instead of in-handler `parse` (T-9); `MultiRunService` constructor is `(container, deps?)` instead of `(container, repo, reviews)` (T-8).
- `MULTI_RUN_MIN_AGENTS` / `MULTI_RUN_MAX_AGENTS` declared in `multi-run/constants.ts:5-6` but unused; contract uses literals 2 and 5.

### Client group (T-10..T-14)
- Added `isInProgress(status)` export in `lib/hooks/multi-agent.ts` (used by `AgentColumns`).
- `NewMultiRunDialog` has no separate "Next" step: picker appears once a repo and PR are chosen.
- `useMultiRunFindingAction` wraps `useFindingAction` and also invalidates `["multi-run", id]`; `["reviews", prId]` is not invalidated.
- Unused message keys removed (`newRun.next`, `newRun.back`, `newRun.close`, `picker.close`, `picker.launching`).
- Picker opens in a modal from the dropdown, not as inline checkboxes (plan Risks).
- `nav.test.ts`: existing WORKSPACE key-order expectation updated + new describe block (file not in plan's list).
- `AgentColumns/helpers.ts:3-10` maps an unknown status to "Pending"; `DisagreementsSection/helpers.ts:11-13` shows a missing cell as "pending".
- Fix round: `FindingCard`, `EvalCaseButton`, `RunTraceDrawer` moved to `src/components/` — the plan listed this move as out of scope and the PR `page.tsx` as not touched; importers in `page.tsx`, `page.test.tsx`, `FindingsPanel.tsx`, `DiffTab.tsx`, `Showcase.tsx` updated.
- Tests and code per task written together (not watched red first), except T-6 on the server, whose concurrency test was seen failing first.

## 7. Live check (2026-10-16, `feat/multi-agent-review`, PR #21)

General + Security + Performance, model `deepseek/deepseek-v4-flash` (OpenRouter). Screenshots in
[`multi-agent/`](multi-agent/).

| Check | Result | Screenshot |
|---|---|---|
| AC-1 launch → `/multi-agent/<id>` | at once, all three `Running` | 01 |
| AC-8 re-requests | 39 polls, 2007–2011 ms apart, stop after the last agent | — |
| AC-7 columns | 3 / 3 / 5 findings = DB; wall-clock 1m 17s; 16 886 / 9 707 tokens; $0.002 | 02 |
| Groups expand to originals; Show only conflicts (8 → 7 rows) | ok | 04, 08 |
| View trace | opens the drawer | 10 |
| Back: sidebar → list; PR page → "Latest multi-agent review" | ok | 06, 07 |

Bugs found and fixed (one round, client only, a test each):
1. The trace drawer from a column showed "Findings 0 · No findings for this run" while the stats said 3 — `AgentColumns` never passed the run's findings (`05-trace-before.png` → `10`). Test: `AgentColumns.test.tsx` › the trace drawer gets only the selected run's findings.
2. Expanded originals did not say which agent wrote each (`03` → `08`). Test: `FindingGroups.test.tsx` › each expanded original names the agent that wrote it.
3. The section was titled "Disagreements"; NFR-2, AC-11 and the design say "Where agents disagree" (`09`). Test: `MultiRunView.test.tsx` › titles the disagreements section ….

Observed, not a bug: "Missing `await` on `rm()` when deleting local clone" (General) and "Missing await on filesystem deletion in repo removal" (Security, Performance) overlap on `repos/service.ts:145` but stay two groups: their title Jaccard is 3/13 ≈ 0.23 < 0.3 (AC-9, D6).

### 1 agent vs 3 on the same PR

| | General alone | General + Security + Performance |
|---|---|---|
| Wall-clock | 39.9 s | 76.9 s (start → last finish; General 31.2 s, Performance 47.4 s, Security 76.9 s) |
| Tokens in / out | 5 007 / 2 429 | 16 886 / 9 707 (General 5 007 / 1 832) |
| Cost | $0.00138 | $0.00245 |

Multi / single: wall-clock ×1.9 (the slowest agent sets it, not the sum 155.5 s), tokens in ×3.4, out ×4.0, cost ×1.8. Cost grows less than tokens: the provider-reported cost per run differs (General $0.00121 vs Security $0.00054 at similar token counts), consistent with prompt caching on the provider side. The diff and intent are prepared once per multi run (AC-4); each agent still sends its own prompt, so input tokens scale with the number of agents.

