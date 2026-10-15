# Plan verification — SPEC-03 Eval Pipeline

## 1. Inputs

| | |
|---|---|
| Spec | [`specs/eval-pipeline/spec.md`](../../specs/eval-pipeline/spec.md) — Spec ID **SPEC-03**, Status: approved |
| Plan | [`specs/eval-pipeline/plan.md`](../../specs/eval-pipeline/plan.md) |
| Requirements | [`docs/hw6/requirements.md`](requirements.md), part 2 |
| Branch | `feat/homework-6` |
| Base | `45e5a17` (docs(hw6): PR #21 labels and the decoy round) |
| Head | `ff27967` (feature `dc23e42`; post-review fixes §7; demo and final verification §8) |

Commits of the run (local, not pushed):

| Commit | Session | Tasks |
|---|---|---|
| `f9e0700` | Server A | T-S1 … T-S3 |
| `4d4b110` | Client A | T-C1 … T-C3 |
| `b6b5c3d` | Server B | T-S4 … T-S6 |
| `7a9b74d` | Client B | T-C4 … T-C5 |
| `707e376` | Client C | T-C6 … T-C8 |
| `dc23e42` | Server C | T-S7 … T-S10 |

T-V1 (demo v1/v2/v3 on real runs) is a manual step for the user and is not part of this run.

## 2. Matrix

Evidence from two `plan-verifier` runs (server side, client side). Where an AC was checked by both, both
are cited and the worse status is kept. Paths are relative to `server/` (S) or `client/` (C).

| AC | task(s) | test (file › case) | commit | evidence (file:line) | status |
|---|---|---|---|---|---|
| AC-1 | T-C4 | `EvalCaseButton.test.tsx` › disabled with hint while undecided, enabled when decided; `FindingCard.test.tsx` › extra action; `FindingsPanel.test.tsx` › every card has the control; manual: expanded card | `7a9b74d` | C `…/FindingCard/FindingCard.tsx:43-44,94-116`; C `…/EvalCaseButton/EvalCaseButton.tsx:26,47-62`; C `…/FindingsPanel/FindingsPanel.tsx:129`; C `…/DiffTab/DiffTab.tsx:90` | PASS — runtime: `docs/hw6/ac1-undecided-disabled.png` (PR #21, undecided card: control beside Accept · Dismiss, disabled, `aria-describedby` hint "Accept or dismiss the finding first."), `docs/hw6/ac1-decided-enabled.png` (accepted card `48c18aaf`: control enabled) |
| AC-2 | T-S5, T-S8, T-C2, T-C4 | `cases.test.ts` › both types, expectation, name, source; `eval.it.test.ts` › 201 both types; `evals.test.ts` › POST + invalidation; `EvalCaseButton.test.tsx` › toast links to `?tab=evals` | `b6b5c3d` `dc23e42` `4d4b110` `7a9b74d` | S `modules/eval/cases.ts:61-62,92-118,142-147`; S `modules/eval/routes.ts:33-42`; C `lib/hooks/evals.ts:27-36`; C `EvalCaseButton.tsx:30-38,54` | PASS |
| AC-3 | T-S5, T-S8 | `cases.test.ts` › frozen diff, PR meta, no author; `eval.it.test.ts` › case byte-equal after re-sync, new head, review delete, flipped decision | `b6b5c3d` `dc23e42` | S `cases.ts:73,99-105`; S `repository/case.repo.ts` (insert/delete only, no update path) | PASS |
| AC-4 | T-S2, T-S5, T-S8, T-C4 | `eval.it.test.ts` › unique index; concurrent POSTs → one 201 + one 200; `cases.test.ts` › existing returned; `EvalCaseButton.test.tsx` › `created:false` | `f9e0700` `b6b5c3d` `dc23e42` `7a9b74d` | S `db/schema/eval.ts:44`; S `0014_complex_shaman.sql:21`; S `cases.ts:54-59`; S `case.repo.ts:45-71`; C `EvalCaseButton.tsx:33`; C `messages/en/eval.json:147` | PASS |
| AC-5 | T-S5, T-S8, T-C4 | `cases.test.ts` › each refusal code, nothing stored; `eval.it.test.ts` › 422 codes, table unchanged; `EvalCaseButton.test.tsx` › reason per code | `b6b5c3d` `dc23e42` `7a9b74d` | S `cases.ts:62,64-65,67-71,88-90,134-141`; S `eval/constants.ts:4-8`; C `…/EvalCaseButton/helpers.ts:3-14`; C `EvalCaseButton.tsx:40-43`; C `eval.json:149-156` | PASS |
| AC-45 | T-S4, T-S5, T-S8, T-C4 | `helpers.test.ts` › `zonesIntersect`; `cases.test.ts` › conflict both directions; `eval.it.test.ts` › 409 naming the case; `EvalCaseButton.test.tsx` › message names the case | `b6b5c3d` `dc23e42` `7a9b74d` | S `cases.ts:119-141`; S `eval/helpers.ts:30-37`; S `case.repo.ts:46-58`; C `EvalCaseButton/helpers.ts:17-21`; C `eval.json:154` | PASS |
| AC-6 | T-S7, T-C5 | `service.test.ts` › `latest_status`, `never_run`; `AgentEditor.test.tsx` › four tabs, `tab="evals"`; `EvalsTab.test.tsx` › row columns | `dc23e42` `7a9b74d` | S `service.ts:82-101`; S `cases.ts:23-33`; C `AgentEditor/constants.ts:15,19`; C `app/agents/[id]/page.tsx:28-29`; C `…/EvalsTab/EvalsTab.tsx:102-118` | PASS |
| AC-7 | T-S7, T-S8, T-C2, T-C5 | `service.test.ts` › scoped delete; `eval.it.test.ts` › case gone, run unchanged; `evals.test.ts` › DELETE; `EvalsTab.test.tsx` › ConfirmDialog | `dc23e42` `4d4b110` `7a9b74d` | S `case.repo.ts:75-92`; S `service.ts:104-107`; C `EvalsTab.tsx:63-69,114-116,143-152`; C `evals.ts:38-51` | PASS |
| AC-8 | T-S6, T-C2, T-C5 | `service.test.ts` › empty set 422; `evals.test.ts` › POST run; `EvalsTab.test.tsx` › "Run eval (3)", disabled rules | `b6b5c3d` `4d4b110` `7a9b74d` | S `routes.ts:59-68`; S `service.ts:44-47`; C `EvalsTab.tsx:58-61,75-83`; C `evals.ts:53-65` | PASS |
| AC-9 | T-S6, T-S9, T-C2 | `run-executor.test.ts` › config read once; `service.test.ts` › `running` first; `eval-runs.it.test.ts` › 202 then completed; `evals.test.ts` › running run in cache | `b6b5c3d` `dc23e42` `4d4b110` | S `service.ts:40-74`; S `routes.ts:65`; S `run-executor.ts:54-77`; C `evals.ts:22,57-60` | PASS |
| AC-10 | T-S4, T-S6 | `task-line.test.ts` › no author; `run-executor.test.ts` › no intent/skeleton/callers/context/expectation/author | `b6b5c3d` | S `run-executor.ts:141-152`; S `modules/_shared/task-line.ts:10-21` | PASS |
| AC-11 | T-S6, T-S10 | `run-executor.test.ts` › messages equal `assemblePrompt`; gate drops off-hunk finding; reviewer-core diff empty | `b6b5c3d` `dc23e42` | S `run-executor.ts:1,141`; `git diff --stat 45e5a17 -- reviewer-core` empty | PASS |
| AC-12 | T-S6, T-S9 | `run-executor.test.ts` › identical messages; `eval-runs.it.test.ts` › same messages after PR, patch, intent, context changes | `b6b5c3d` `dc23e42` | S `run-executor.ts:141-152` | PASS |
| AC-13 | T-S2, T-S6, T-S9, T-C5 | `eval.it.test.ts` › partial unique index; `service.test.ts` › 409; `eval-runs.it.test.ts` › concurrent POSTs → 202 + 409; `EvalsTab.test.tsx` › button disabled while running | `f9e0700` `b6b5c3d` `dc23e42` `7a9b74d` `73e5d42` | S `db/schema/eval.ts:82-84`; S `0014_complex_shaman.sql:23`; S `repository/run.repo.ts:31-48`; S `service.ts:66`; C `EvalsTab.tsx:79`; C `EvalsTab.tsx:61-70` (409 `eval_run_in_progress` → own message + `refetch()`) + `eval.json:165`; test `EvalsTab.test.tsx:129` › "AC-13: a run refused as in progress says so and refetches the overview" (fix `73e5d42`) | PASS |
| AC-14 | T-S6 | `run-executor.test.ts` › throwing case → error, next case evaluated, `has_errors`; › "%s on case 2 is one error result with a safe reason"; › "EC-27: a hung model call becomes error \"timeout\"" | `b6b5c3d` `515c0b8` | S `run-executor.ts:75-77,144,198`; S `eval/helpers.ts:24` (`caseErrorReason`: fixed phrase + code/class + HTTP status); S `eval/constants.ts:20` (`EVAL_CASE_TIMEOUT_MS` = 120 s, EC-27); S `scoring.ts:75` | PASS |
| AC-15 | T-S6, T-S8, T-S9, T-C5 | `run-executor.test.ts` › `llm()` rejects → failed, zero calls; `eval-runs.it.test.ts` › boot reap → "interrupted"; `EvalsTab.test.tsx` › reason in status line | `b6b5c3d` `dc23e42` `7a9b74d` | S `run-executor.ts:64-72`; S `run.repo.ts:85-92`; S `app.ts:105-111`; C `EvalsTab.tsx:86-95`; C `EvalsTab/helpers.ts:9-12` | PASS |
| AC-16 | T-S6, T-S9 | `service.test.ts` › disabled agent starts; `eval-runs.it.test.ts` › disabled agent completes | `b6b5c3d` `dc23e42` | S `service.ts:41-42` | PASS |
| AC-17 | T-S3 | `scoring.test.ts` › `countMatches` rules | `f9e0700` | S `scoring.ts:18-27`; S `run-executor.ts:174-180` | PASS |
| AC-18 | T-S3, T-C3 | `scoring.test.ts` › formulas, n/a, error excluded; `EvalMetrics.test.tsx` › "n/a", never "0%" | `f9e0700` `4d4b110` | S `scoring.ts:35,45-72`; C `components/eval/EvalMetrics/EvalMetrics.tsx:21-27`; C `EvalMetrics/helpers.ts:4-6` | PASS |
| AC-19 | T-S3, T-C3 | `scoring.test.ts` › status table, N/M; `EvalMetrics/helpers.test.ts` › `formatPassed` | `f9e0700` `4d4b110` | S `scoring.ts:29-32,73-74`; C `EvalMetrics.tsx:31-33`; C `EvalRunTable.tsx:74` | PASS |
| AC-20 | T-S2, T-S6 | `eval.it.test.ts` › run columns; `run-executor.test.ts` › stored record and per-case fields | `f9e0700` `b6b5c3d` | S `db/schema/eval.ts:51-79`; S `service.ts:58-65`; S `run.repo.ts:54-73`; S `run-executor.ts:111-127,185-193` | PASS |
| AC-21 | T-S7, T-C3, T-C5, T-C6 | `service.test.ts` › newest first; `EvalRunTable.test.tsx` › columns; `EvalsTab.test.tsx` › latest completed metrics, status line, history | `dc23e42` `4d4b110` `7a9b74d` `707e376` | S `service.ts:86-100`; S `eval/helpers.ts:40-61`; S `run.repo.ts:109-115`; C `EvalsTab.tsx:47,86-95,122-141`; C `EvalRunTable.tsx:54-77` | PASS |
| AC-22 | T-S3, T-S6, T-S7, T-C3, T-C6 | `scoring.test.ts` › `runCost`; `run-executor.test.ts` › unpriced → null; `helpers.test.ts` › cost delta null; `EvalRunTable.test.tsx` › "—" | `f9e0700` `b6b5c3d` `dc23e42` `4d4b110` `707e376` | S `scoring.ts:80-87`; S `run-executor.ts:125,191`; C `EvalRunTable.tsx:76` → `vendor/ui/primitives/RunCostBadge.tsx:24-29`; C `EvalCompareView.tsx:47,112` | PASS |
| AC-23 | T-S2, T-S8 | `eval.it.test.ts` › FK cascade; `DELETE /agents/:id` removes cases and runs | `f9e0700` `dc23e42` | S `db/schema/eval.ts:38,65`; S `0014_complex_shaman.sql:18,20` | PASS |
| AC-24 | T-S7, T-C3, T-C6, T-C7 | `service.test.ts` › 422 unless two completed runs; `EvalsTab.test.tsx` › URL with both ids; `EvalCompareView.test.tsx` › ids from URL | `dc23e42` `4d4b110` `707e376` | S `routes.ts:27,70-77`; S `service.ts:110-123`; C `EvalsTab.tsx:48-56,132`; C `EvalRunTable.tsx:42-52`; C `app/eval/compare/page.tsx:8-11` | PASS |
| AC-25 | T-S7, T-S9, T-C7 | `helpers.test.ts` › later − earlier, n/a; `eval-runs.it.test.ts` › compare deltas; `EvalCompareView.test.tsx` › pp and cost formats | `dc23e42` `707e376` | S `eval/helpers.ts:115-116,139,184-189`; C `EvalCompareView.tsx:43-48,107-116`; C `EvalMetrics/helpers.ts:9-14,21-26` | PASS |
| AC-26 | T-S7, T-C7 | `helpers.test.ts` › changed / added / removed; `EvalCompareView.test.tsx` › lists | `dc23e42` `707e376` | S `eval/helpers.ts:141-153`; C `EvalCompareView.tsx:73-87,124-140` | PASS |
| AC-27 | T-S7, T-C7 | `helpers.test.ts` › `diffLines`, prompt status; `EvalCompareView.test.tsx` › diff, "unchanged", "unavailable", inert text | `dc23e42` `707e376` | S `eval/helpers.ts:73-113,155-172`; S `service.ts:127-137`; C `EvalCompareView.tsx:142-164` | PASS |
| AC-28 | T-S7, T-C7 | `helpers.test.ts` › skill set difference; `EvalCompareView.test.tsx` › run headers + skill lists | `dc23e42` `707e376` | S `eval/helpers.ts:174-198`; C `EvalCompareView.tsx:50-71,118-121,166-172` | PASS |
| AC-29 | T-S7, T-S9, T-C8 | `service.test.ts` › agents with cases, disabled included; `eval-runs.it.test.ts` › dashboard row; `nav.test.ts` › SKILLS LAB `eval`; `EvalDashboardView.test.tsx` › rows, "never run", click; manual: sidebar entry | `dc23e42` `707e376` | S `run.repo.ts:143-178`; S `service.ts:151-166`; C `vendor/ui/nav.ts:42`; C `app/eval/page.tsx:4-6`; C `…/EvalDashboardView/EvalDashboardView.tsx:22,55-83` | PASS — runtime: `docs/hw6/ac29-eval-dashboard.png` ("Eval Dashboard" under SKILLS LAB, highlighted on `/eval`, page opens with its empty state) |
| AC-30 | T-S7, T-S9, T-C3, T-C8 | `service.test.ts` › ≤10 newest; `eval-runs.it.test.ts` › order; `EvalDashboardView.test.tsx` › recent runs with agent name | `dc23e42` `4d4b110` `707e376` | S `run.repo.ts:128-136`; S `eval/constants.ts:17`; C `EvalDashboardView.tsx:89-96`; C `EvalRunTable.tsx:30,69` | PASS |
| AC-31 | T-S1, T-C1, T-S8 | `eval-contracts.test.ts` › shapes, region parity, divergence ≤ baseline; `eval.it.test.ts` › bodies parse | `f9e0700` `4d4b110` `dc23e42` | S `vendor/shared/contracts/knowledge.ts:58-111`; S `vendor/shared/contracts/eval-ci.ts:3,32-199`; S `test/eval-contracts.test.ts:53-159,226-249`; C `vendor/shared/contracts/knowledge.ts:49-112`; C `vendor/shared/contracts/eval-ci.ts:15-203` | PASS |
| AC-32 | T-S5, T-S6, T-S7, T-S8 | `cases.test.ts` / `service.test.ts` › `NotFoundError`; `eval.it.test.ts` › every route 404, nothing changed | `b6b5c3d` `dc23e42` `515c0b8` `90d4f63` | S `cases.ts:47-48,134`; S `service.ts:41-42,83-84,104-106,114-117`; S `case.repo.ts:21,30,46-50,74-79` (lock and fallback scoped by workspace; test `eval.it.test.ts:359`); S `run.repo.ts:113,123,133,153`; S `service.ts:111-118` — workspace lookup before the same-id guard, so `compare?a=X&b=X` with a foreign X is 404 (final verifier found the 422; fixed `90d4f63`, test `service.test.ts` › "the same foreign id twice is a NotFoundError") | PASS |
| AC-33 | T-S6 | `run-executor.test.ts` › diff, title, description each in own untrusted block; `INJECTION_GUARD` | `b6b5c3d` | S `run-executor.ts:145,149-150` | PASS |
| AC-34 | T-S6, T-S9 | `run-executor.test.ts` › 3 cases → 3 calls; `eval-runs.it.test.ts` › 3 calls end to end | `b6b5c3d` `dc23e42` | S `run-executor.ts:75-77` | PASS |
| AC-35 | T-S3 | `scoring.test.ts` › type-only imports; 100-case scoring leaves `calls` empty | `f9e0700` | S `scoring.ts:1-7` | PASS |
| AC-36 | T-S5, T-S8, T-C2, T-C5 | `cases.test.ts` › `llm` never called; `eval.it.test.ts` › reads + case create/delete → 0 calls; `evals.test.ts` › GET only; `EvalsTab.test.tsx` › no mutation on mount | `b6b5c3d` `dc23e42` `4d4b110` `7a9b74d` | S `routes.ts:33-57,70-82`; C `evals.ts:17-24,67-80`; C `EvalCaseButton.tsx:25` | PASS |
| AC-37 | T-S10 | `eval-boundary.test.ts` › no feature file names `evals/`; manual grep of `evals/` empty | `dc23e42` | S `test/eval-boundary.test.ts:62-93`; verifier's grep of `evals/` for `modules/eval\|eval_cases\|eval_runs\|/evals/(runs\|compare\|dashboard)`: empty. Final verifier: `test/eval-boundary.test.ts:84-93` reads files under `evals/`, which AC-37's first sentence forbids; kept by plan decision (Deviations) | PARTIAL |
| AC-38 | T-S7, T-C2, T-C8 | `service.test.ts` › dashboard reads only eval tables; `evals.test.ts` › only eval endpoints; `EvalDashboardView.test.tsx` › payload only; manual: no harness eval names | `dc23e42` `4d4b110` `707e376` | S `run.repo.ts:143-178`; S `service.ts:82-166`; C `evals.ts:20,30,42,56,70,78`; C `EvalDashboardView.tsx:35-97` | PASS |
| AC-39 | T-S10 | `pnpm verify:l06` runs the four suites; integration skips without Docker; no API keys | `dc23e42` | S `package.json:12`; S `eval.it.test.ts:16-17`; S `eval-runs.it.test.ts:18-19`; S `test/helpers/pg.ts:23-33`. Verifier: PARTIAL, needs runtime check. **Runtime (coordinator):** no network + Docker unreachable + keys unset → exit 0, 52 passed / 22 skipped; keys unset + Docker up → exit 0, 74 passed | PASS (runtime) |
| AC-40 | T-S10, T-V1 | `pnpm verify:l06` exit 0 on the final commit | `dc23e42` | S `package.json:12`. Verifier: PARTIAL, needs runtime check. **Runtime (coordinator):** at `dc23e42`, exit 0, 5 files / 74 tests passed | PASS (runtime) |
| AC-41 | T-V1 | manual: ≥ 8 cases, both types | demo take (§8) | observed: General Reviewer set = 10 cases, 9 `must_find` + 1 `must_not_flag` (`4d9c1787`, `pulls/routes.ts:91`) | PASS |
| AC-42 | T-S9 | `eval-runs.it.test.ts` › prompt-dependent stub: v1→v2 recall delta > 0 + prompt diff; v2→v3 precision delta < 0, B passed → failed | `dc23e42` | S `eval-runs.it.test.ts:257-295` | PASS |
| AC-43 | T-V1 (twin: AC-42) | manual: Compare v1 ↔ v2, positive recall delta + prompt diff; screenshot | demo take (§8) | observed: Compare v1 ↔ v2 recall +11 pp, prompt diff with the added INV-1 line — `docs/hw6/compare-v1-v2.png` | PASS |
| AC-44 | T-V1 (twin: AC-42) | manual: Compare v2 ↔ v3, negative precision delta, `must_not_flag` passed → failed | demo take (§8) | observed: no real run showed a negative precision delta; the take compares v1 ↔ v3 (precision 0 pp, `must_not_flag` stayed passed) — `docs/hw6/compare-v1-v3.png` | MISSING |

**Counts (final, §8):** PASS 43 · PARTIAL 1 (AC-37) · MISSING 1 (AC-44).

## 3. Open rows

- **AC-44 — MISSING.** No real run showed a negative precision delta. The v3 prompt's noise hit the only
  `must_not_flag` zone (`pulls/routes.ts:91`) once in six attempts, and only in an unrecorded trial. The
  recorded take compares v1 ↔ v3 with precision Δ 0 pp, by the user's decision. To close it: a set with more
  `must_not_flag` cases whose zones v1 never touches, or a spec change to AC-44. AC-42, the deterministic
  twin, passes.
- **AC-37 — PARTIAL.** The boundary test reads `evals/` as text, which the plan chose (T-S10, cross-model
  F-8) and the spec's first sentence forbids. Recorded under Deviations in the plan.

The spec stays `approved`: it has a MISSING row.

## 4. Reviews

### Architecture review

- Rounds run: 1 review, 0 fix rounds. No CRITICAL or WARNING finding.
- Fixed: nothing (nothing to fix).
- CRITICAL / major still open: none.
- Asked specifically: is the dashboard's `latest` always the latest *completed* run? Yes. See
  `server/src/modules/eval/repository/run.repo.ts:158-171`, which filters on `status = 'completed'`. This
  matches AC-29.
- minor / nit (shown to the user, not sent to the implementer):
  - SUGGESTION — `server/src/modules/eval/run-executor.ts:10`, `server/src/modules/eval/cases.ts:11`:
    both import `parseUnifiedDiff` straight from `adapters/git/diff-parser.js`. It is pure, so no onion
    rule is broken, but it couples the module to an adapter folder.
  - INFO — `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.tsx:56`: the
    `latest?.status === "completed"` guard duplicates the server's rule. Either document it on the
    `EvalDashboard` contract or drop it.
  - INFO — `server/src/modules/eval/service.ts:32`: the service builds its own `EvalRepository` from the
    container. This is allowed; no action needed.

### Security review

- Rounds run: 1 review, 0 fix rounds. No CRITICAL or WARNING finding.
- Fixed: nothing.
- CRITICAL / major still open: none.
- Not covered: the reviewer did not read the engine's prompt assembly, so AC-33's delimiter handling
  rests on the server verifier and `run-executor.test.ts:172-198`.
- minor / nit (shown to the user, not sent to the implementer):
  - SUGGESTION — `server/src/modules/eval/repository/case.repo.ts:67-70`: the fallback select in
    `createCaseExclusive` filters only by `sourceFindingId`, with no `workspaceId`. It is not exploitable
    today, because the caller has already checked the workspace. Adding the filter keeps AC-32 safe if a
    second caller appears.
  - INFO — `reviewer-core/src/llm/openrouter.ts:91`: the upstream provider's error text goes into the
    stored run/case error, cut to `MAX_ERROR_CHARS`. No path puts the API key in it.
- Known gap, accepted by the plan and not reported as a finding: `reviewer-core`'s OpenRouter client has
  no request timeout, so a hung call stalls an eval run. The OpenAI and Anthropic adapters time out
  after 60 s.

## 5. Checks

All run by the coordinator.

| Command | Where / when | Result |
|---|---|---|
| `pnpm typecheck` | server, after each server session | pass |
| `pnpm test` | server, after Server A | 723 pass, 2 fail. The 2 failures are the Eval parity tests, red by design until T-C1 |
| `pnpm test` | server, after Server B | 67 files, 778 pass |
| `pnpm test` | server, after Server C (`dc23e42`) | 69 files, 821 pass |
| `pnpm typecheck` | client, after each client session | pass |
| `pnpm test` | client, after Client A / B / C | 60 files, 473 pass / 63 files, 507 pass / 66 files, 542 pass |
| `pnpm verify:l06` | server @ `dc23e42`, Docker up | exit 0 — 5 files, 74 passed |
| `DOCKER_HOST=tcp://127.0.0.1:1 pnpm verify:l06` | server @ `dc23e42` | exit 0 — 52 passed, 22 skipped |
| `verify:l06` with no network (`unshare -rn`), Docker unreachable, API keys unset | server @ `dc23e42` | exit 0 — 52 passed, 22 skipped |
| `verify:l06` with API keys unset, Docker up | server @ `dc23e42` | exit 0 — 74 passed |
| `verify:l06` with no network (`unshare -rn`), Docker socket reachable | server @ `dc23e42` | exit 1. "Failed to connect to Reaper": the network namespace hides the host's localhost, so testcontainers' mapped ports can't be reached. This comes from how the test was isolated, not from the feature; a real offline host keeps localhost |
| `git diff --stat 45e5a17 -- reviewer-core` | — | empty (NG8). Against `main` it is not empty, because of earlier branch history |
| `pnpm build` | client | reported pass by the Client C implementer; not re-run by the coordinator |
| Runtime check AC-1 / AC-29 | dev stack | first pass **not run**: the dev database lacked `0014_complex_shaman` (`GET /evals/dashboard` → 500). After the user's go-ahead: `cd server && pnpm db:migrate` → "migrations applied", `GET /evals/dashboard` → 200; studio checked in Chrome, screenshots in `docs/hw6/` |

## 6. Deviations

### Server group

- **Server A (T-S1 … T-S3)**
  - `EvalTrendPoint` was given a shape that the plan left open: `{ started_at, recall, precision,
    citation_accuracy, cost_usd }`. `EvalRunResult` was kept.
  - The `eval-ci.ts` import line was kept on one line to stay inside the parity baseline.
  - `eval_runs.workspace_id` and `agent_id` are nullable (additive-only rule).
  - T-S3: the tests and the code were written in one pass, so the tests were never seen failing first.
- **Server B (T-S4 … T-S6)**
  - `cases.test.ts` uses a fake repository object instead of `vi.mock`.
  - `MAX_DIFF_CELLS` (4 000 000) and the error codes are in `eval/constants.ts`.
  - `toCaseRow` is in `cases.ts` and `toRunRecord` in `helpers.ts`.
  - A finding with both `acceptedAt` and `dismissedAt` becomes `must_find`.
  - An existing case whose agent is gone is refused with `eval_case_no_agent`.
  - The AC-9 "read once" unit test is weak; the guarantee comes from the structure of `startRun`.
- **Server C (T-S7 … T-S10)**
  - `EvalService.createCase` was added, so the route stays transport-only.
  - Compare reports the prompt as `unchanged` when the two texts are equal, even across different
    versions (AC-27 wording).
  - `reordered` also fires when the two runs' skill sets differ.
  - Compare reads `system_prompt` straight from `configJson` rather than strict-parsing it.
  - In the AC-42 twin, v2→v3 lists 2 changed cases: B passed→failed and D failed→passed.
  - The boundary test matches import specifiers, not every `evals/` substring.
  - The plan's literal "reviewer-core diff against main is empty" cannot hold on this branch; it was
    checked against `45e5a17` instead.

### Client group

- **Client A (T-C1 … T-C3)**
  - The delete and run-eval hooks also invalidate the overview and the dashboard. Delete is
    pessimistic.
  - The leaf message keys and wording were chosen by the implementer.
  - The has-errors mark is a red "!".
  - `formatCostDelta(0)` returns "$0.000".
- **Client B (T-C4 … T-C5)**
  - New keys `deleteFailed` and `runFailed`. Delete and run errors show inline, not as toasts.
  - The disabled hint reuses `turnInto.errors.eval_case_undecided`, so `turnInto.hint` is unused.
  - The status region stays mounted while empty.
  - No spinner on "Run eval". The manual check of the running app was not done.
- **Client C (T-C6 … T-C8)**
  - `nav.ts` and `nav.test.ts` were edited together, so the nav test was never seen failing.
  - No `Suspense` was needed around `useSearchParams`.
  - Extra `compare.*` keys, a `dashboard.disabled` key and a "disabled" badge on dashboard rows, which
    the plan does not ask for.
  - Helpers `diffPrefix` and `skillLabel`.

## 7. After the first report (user's decisions, 2026-10-15)

| Commit | What |
|---|---|
| `3cdd519` | Spec: EC-27 (per-case deadline `EVAL_CASE_TIMEOUT_MS`, 120 s) and a Changelog section |
| `515c0b8` | Server: `withTimeout` around each case (EC-27); safe error reasons through the shared `_shared/error-kind.ts`, which the review Live Log also uses now; `createCaseExclusive` lock and fallback scoped by workspace |
| `73e5d42` | Client: AC-13 message "A run of this agent is already in progress." plus overview refetch; `turnInto.hint` removed |
| `9f3e60a` | Plan: Deviations section (diff-parser import, client "completed" guard, "disabled" badge kept) |

Review findings, final state:

- Security SUGGESTION `case.repo.ts:67-70` — **fixed** (`515c0b8`, test `eval.it.test.ts:359` and `cases.test.ts` › "a case of this finding held by another workspace is a NotFoundError").
- Security INFO, provider error text in stored reasons — **fixed**. A reason is now `timeout`, `output failed schema validation (<kind>)`, `provider returned no choices (<kind>)` or `model call failed (<kind>[, HTTP n])`.
- Architecture SUGGESTION (diff parser from the git adapter) and INFO (client "completed" guard) — **kept**, recorded under Deviations in the plan.
- Unplanned `turnInto.hint` — removed. Unplanned "disabled" badge — kept (AC-16, AC-29), recorded under Deviations.
- Accepted gap "OpenRouter has no request timeout" — **closed** for eval runs by EC-27. `reviewer-core/` is unchanged.

Checks after the fixes (coordinator):

| Command | Result |
|---|---|
| `pnpm typecheck` (server) | pass |
| `pnpm test` (server) | 70 files, 831 passed |
| `pnpm verify:l06` | exit 0 — 5 files, 76 passed |
| `pnpm typecheck` (client) | pass |
| `pnpm test` (client) | 66 files, 544 passed |
| `pnpm build` (client) | exit 0; `/eval`, `/eval/compare` prerendered |

Not seen red first: the EC-27 hung-call test and the AC-13 tests were written with or after their code.

## 8. Demo and final verification (2026-10-15)

**Demo** (`docs/hw6/record-hw6.mjs`, 142.9 s, 1440×900). General Reviewer, `openrouter / deepseek/deepseek-v4-flash`, set of 10 cases (9 `must_find`, 1 `must_not_flag`).

| Run | Agent version | Recall | Precision | Citation | N/M | Cost | Time |
|---|---|---|---|---|---|---|---|
| Calibration (8 cases, before the take) | v1 | 88% | 100% | 100% | 7/8 | $0.0046 | 5 min 19 s |
| v1 | v16 | 67% | 100% | 95% | 7/10 | $0.0039 | 6 min 6 s |
| v2 = v1 + INV-1 rule | v17 | 78% | 100% | 100% | 8/10 | $0.0042 | 6 min 33 s |
| v3 = v1 + "flag everything, at least three findings per file" | v18 | 78% | 100% | 100% | 8/10 | $0.0053 | 8 min 44 s |

- **Compare v1 ↔ v2:** recall +11 pp. The INV-1 case went failed → passed. Noise also flipped two cases: missing `await` failed → passed and SQL injection passed → failed.
- **Compare v1 ↔ v3:** precision 0 pp; the `must_not_flag` case stayed passed.
- **After the take:** the prompt was restored to v1 (agent v19).
- **Takes:** six, five of them stopped:
  - take 1 — the server bug fixed in `cfdfb03`;
  - takes 2 and 3 — no precision delta;
  - take 4 — no recall delta (INV-1 flipped, but noise flipped another case back);
  - take 5 — a script bug in the v2b branch.
- **Noise:** the same v1 prompt gave recall from 56% to 89% across takes, which is why deltas need repeated runs.

**Final verification** — two `plan-verifier`s, server ∥ client, at `62f974f`:
- Client: 27 / 0 / 0.
- Server: 42 / 2 / 1 (AC/EC rows, EC-27 included). Its gaps:
  - AC-32 — fixed (`90d4f63`);
  - AC-37 — kept, see Deviations;
  - AC-44 — open;
  - T-S9 — the twin's prompt edit appends rather than replaces; recorded under Deviations.

**Checks at `90d4f63`:**

| Package | Result |
|---|---|
| server | typecheck pass; `pnpm test` 70 files / 832 passed; `pnpm verify:l06` 76 passed, exit 0 |
| client | typecheck pass; `pnpm test` 66 files / 544 passed; `pnpm build` exit 0 (at `73e5d42`, no client change since) |
