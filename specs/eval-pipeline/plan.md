# Plan: Eval Pipeline for the review agent
Spec: SPEC-03 · Status: draft

Spec file: `specs/eval-pipeline/spec.md` (SPEC-03, approved 2026-10-15, 45 AC). The requirements in `docs/hw6/requirements.md` part 2 are background only. Where they differ, the spec wins.

## Goal

Add a server `eval` module:
- An accepted or dismissed finding becomes a frozen eval case of its agent.
- A background run reviews every case through the unchanged reviewer-core engine: one model call per case, with only the agent's configuration and the case's frozen input.
- Code computes the matches, statuses, recall, precision and citation accuracy. Scoring makes no model call.
- The module serves the run history, Compare (metric deltas, case status changes, prompt diff, skill difference) and a workspace dashboard.

The studio gets a "Turn into eval case" control, an Evals tab in the agent editor, a Compare page and the Eval Dashboard. `pnpm verify:l06` gates the feature.

## Decisions

| # | Decision | Evidence / reason |
|---|---|---|
| D-1 | **Additive schema only**, in `db/schema/eval.ts`.<br>`eval_cases` gains: `agent_id` (FK → `agents.id`, on delete cascade), `source_finding_id` (uuid, no FK, unique index), `created_at`.<br>`eval_runs` becomes one row per run: `case_id` loses NOT NULL (it stays unused), and it gains `workspace_id`, `agent_id` (FK cascade), `agent_version`, `provider`, `model`, `skills` jsonb, `status`, `has_errors`, `error`, `passed`, `total`, `results` jsonb, `finished_at`.<br>Existing columns are reused: `ran_at` = start, `recall` / `precision` / `citation_accuracy` (null = n/a), `cost_usd` (null = unknown), `duration_ms`.<br>A partial unique index on `eval_runs(agent_id) WHERE status = 'running'` enforces one running run per agent. | The tables are empty and unread (`server/src/db/schema/eval.ts:7-35`). An additions-only diff lets `db:generate` run unattended (server INSIGHTS 2026-09-22). Dropping or renaming a column would trigger drizzle-kit's interactive prompt. New columns are nullable or defaulted, so `db:migrate` works on any database. The FK cascades give AC-23, because `agents` is hard-deleted (`agents/repository.ts:76-82`). |
| D-2 | **Frozen input of a case.**<br>`input_diff` = `diff --git a/<p> b/<p>\n--- a/<p>\n+++ b/<p>\n<patch>`, the same shape as `diffFromPrFiles` (`reviews/diff-loader.ts:33-44`).<br>`input_meta` = `EvalFrozenMeta { pr_id, pr_number, pr_title, pr_description, file }`, with no author.<br>`expected_output` = `EvalExpectation`. `name` = the finding title. `owner_kind = 'agent'`, `owner_id = agent_id`. | R1, AC-3. `pr_id` exists only for the AC-45 zone check and never reaches the model. |
| D-3 | **Concurrency.**<br>AC-4: insert with `onConflictDoNothing` on `source_finding_id`; if nothing was inserted, re-read the existing case.<br>AC-45: case creation runs in one transaction that first locks the agent row (`SELECT … FOR UPDATE`), so the conflict check and the insert are serialised per agent.<br>AC-13: a unique violation (23505) on the partial index is answered with 409. | AC-4 and AC-13 require correctness when requests arrive at the same time. |
| D-4 | **"n/a" is `null`** in every contract: metrics, deltas and cost. | AC-31: "n/a" must be a value distinct from every number. A metric can still be a number in [0, 1]. |
| D-5 | **Contract placement and parity.**<br>Every Eval shape stays inside the two existing Eval regions:<br>• `knowledge.ts`, from `// ---- Eval ----` to the line before `// ---- Memory ----`;<br>• `eval-ci.ts`, from the `// Eval — case input …` banner to the line before the `// Compose Review` banner.<br>No new contract file and no `index.ts` edit.<br>The parity test checks that each region is equal in both copies, and that divergence outside the regions has not grown against a baseline recorded before T-S1. | AC-31, R16. Both files already differ outside their Eval parts (spec "Verified against the code": `eval-ci.ts:3`, `:144-171`, `:249`; `knowledge.ts` Agents section). |
| D-6 | **Task line.**<br>New `modules/_shared/task-line.ts` with `taskInstruction(prNumber, author \| null)`.<br>`reviews/helpers.ts` `taskLine(pull)` delegates to it, with byte-identical output.<br>Evals call `taskInstruction(n, null)`. | AC-10 ("without the author"). NFR-9: reviews keep the same prompt. Onion rule 10: `_shared` is the shared folder, so the eval module does not import from `reviews/`. |
| D-7 | **Hunk check at creation (AC-5)** reuses the engine's gate: `groundFindings([{ ...finding, kind: 'finding' }], parseUnifiedDiff(frozenDiff))` must keep the finding. | It is the same rule as review grounding (`reviewer-core/src/grounding.ts:52-84`), so the feature has no rule of its own. `parseUnifiedDiff` is pure and already imported this way by `reviews/diff-loader.ts:3`. |
| D-8 | **Run lifecycle.**<br>`startRun` reads the agent row, the agent's cases and its enabled linked skills once (`container.agentsRepo.linkedSkills`, filtered as `run-executor.ts:460-468`). It inserts the run as `running` with the skills recorded, answers 202, and starts the executor in the background.<br>The executor resolves `container.llm(provider)` before the first case. On failure the run is `failed` and no case is evaluated.<br>Cases are evaluated sequentially. Results are written in one UPDATE at the end.<br>An empty set is refused with 422 `eval_set_empty`. | AC-9, AC-15, EC-15, EC-16. EC-16: if the agent was deleted during the run, the final UPDATE matches 0 rows and nothing is stored. |
| D-9 | **Compare is computed on the server**: the line diff of the two versions' prompts (from `agentsRepo.getVersion`, `agents/repository.ts:181-187`) and the ordered skill difference (added / removed / reordered). The LCS is copied from `client/src/app/skills/[id]/_components/SkillDetailView/helpers.ts:20-60`. | One GET serves the whole page, and the server suite can prove AC-42 deterministically. |
| D-10 | **Interrupted runs** are reaped on boot in `app.ts` next to the review reaping (`app.ts:97-102`): `status='failed'`, `error='interrupted'`. | AC-15, EC-20. Same precedent as `run.repo.ts:105-112`. |
| D-11 | **Client structure.**<br>`FindingCard` stays presentational and gains an `extraAction` slot.<br>A page-local container `EvalCaseButton` is passed in by `FindingsPanel` and `DiffTab`.<br>Shared presentational components live in `src/components/eval/`: `EvalMetrics` and `EvalRunTable`, used by the Evals tab, Compare and the Dashboard. | `FindingCard` is in the gallery, which is mounted without a QueryClient (client INSIGHTS 2026-09-22; `Showcase.tsx:433`). The frontend-architecture placement rule. |
| D-12 | **Client routes.**<br>• Evals tab: `/agents/[id]?tab=evals`, validated by `TAB_KEYS` (`agents/[id]/page.tsx:28-29`).<br>• Dashboard: `/eval`.<br>• Compare: `/eval/compare?a=<runId>&b=<runId>`. | AC-6, AC-24, AC-29. `activeKeyFor` already maps `/eval` to `eval` (`app-shell/helpers.ts:35`). |
| D-13 | **Live status.** One overview query per agent, with `refetchInterval` 2500 ms only while a run in it is `running`. | NFR-13: status, metrics, history and case statuses all arrive in one poll. |
| D-14 | **Error text.** A case's error reason is cut to 500 characters. Logs carry ids, statuses, tokens, cost and the reason, never the frozen diff, the description or prompt text. Prompt sections are logged through `logPromptAssembly` (`platform/prompt-log.ts`); text previews appear only in verbose mode. | NFR-4. |

## Hand-off contract (server ⇄ client)

**What the client waits for:** only T-S1 (the server copy of the contracts). T-C1 then copies the two regions byte-for-byte. No client test needs a running API (they mock `../api` as `client/src/lib/hooks/reviews.test.ts:7-18` does), so the two groups run in parallel after T-S1. Only the final demo (T-V1) needs both groups finished.

**Routes** (module `eval`, all workspace-scoped; an id outside the caller's workspace → 404 `not_found` and nothing changes):

| Route | Request | Success | Errors |
|---|---|---|---|
| `POST /findings/:id/eval-case` | — | 201 `EvalCaseCreated` (`created: true`) · 200 the same shape with `created: false` for an existing case | 422 `eval_case_undecided`, `eval_case_no_agent`, `eval_case_no_patch`, `eval_case_no_hunk` · 409 `eval_case_conflict`, `details: { case_id, case_name }` |
| `GET /agents/:id/evals` | — | 200 `EvalAgentOverview` | 404 |
| `DELETE /agents/:id/evals/cases/:caseId` | — | 204 | 404 |
| `POST /agents/:id/evals/runs` | — | 202 `EvalRunRecord` (`status: 'running'`) | 409 `eval_run_in_progress` · 422 `eval_set_empty` · 404 |
| `GET /evals/compare?a=<uuid>&b=<uuid>` | — | 200 `EvalCompare` | 422 `eval_compare_invalid` (not both `completed`, the same id twice, or two different agents) · 404 |
| `GET /evals/dashboard` | — | 200 `EvalDashboard` | — |

**Contract shapes** (identical in both copies; `null` = n/a or unknown):

```ts
// knowledge.ts — Eval region
EvalMetric          = number(0..1) | null
EvalRun             : recall / precision / citation_accuracy → EvalMetric   (other fields unchanged)
EvalExpectationType = 'must_find' | 'must_not_flag'
EvalExpectation     = { type, file, start_line: int, end_line: int, title }
EvalFrozenMeta      = { pr_id, pr_number: int, pr_title, pr_description, file }   // server-side only
// eval-ci.ts — Eval region (EvalRunRecord, EvalTrendPoint, EvalDashboard reworked; no consumer today)
EvalCaseStatus    = 'passed' | 'failed' | 'error'
EvalRunStatus     = 'running' | 'completed' | 'failed'
EvalRunSkill      = { name, version: int }
EvalKeptFinding   = { file, start_line, end_line, title }
EvalCaseResult    = { case_id, name, type, file, start_line, end_line, status: EvalCaseStatus,
                      kept: int, dropped: int, kept_findings: EvalKeptFinding[], cost_usd: number|null, error: string|null }
EvalRunRecord     = { id, agent_id, agent_name, agent_version: int, provider, model, skills: EvalRunSkill[],
                      status: EvalRunStatus, has_errors: bool, error: string|null, started_at, finished_at: string|null,
                      recall: EvalMetric, precision: EvalMetric, citation_accuracy: EvalMetric,
                      passed: int, total: int, cost_usd: number|null }
EvalCaseRow       = EvalCase.pick({ id, name }) + { agent_id, expectation: EvalExpectation, source_finding_id: string|null,
                      created_at, latest_status: EvalCaseStatus | 'never_run' }
EvalCaseCreated   = { case: EvalCaseRow, agent_id, agent_name, created: bool }
EvalAgentOverview = { agent_id, agent_name, cases: EvalCaseRow[] /*newest first*/, runs: EvalRunRecord[] /*newest first*/ }
EvalCaseRef       = { case_id, name, type, file, start_line, end_line }
EvalCaseChange    = EvalCaseRef + { earlier: EvalCaseStatus, later: EvalCaseStatus }
EvalDiffLine      = { op: 'add' | 'remove' | 'context', text }
EvalCompare       = { agent_id, agent_name, earlier: EvalRunRecord, later: EvalRunRecord,   // ordered by started_at
                      delta: { recall, precision, citation_accuracy, cost_usd: number|null },  // later − earlier
                      changed: EvalCaseChange[], added: EvalCaseRef[], removed: EvalCaseRef[],
                      prompt: { status: 'changed' | 'unchanged' | 'unavailable', unavailable_versions: int[], lines: EvalDiffLine[] },
                      skills: { only_earlier: EvalRunSkill[], only_later: EvalRunSkill[], reordered: boolean } }
EvalDashboard     = { agents: { agent_id, name, enabled, cases_total: int, latest: EvalRunRecord|null }[],
                      recent_runs: EvalRunRecord[] /* ≤ 10, newest first */ }
```

**Client cache keys:** `["eval-overview", agentId]`, `["eval-compare", a, b]`, `["eval-dashboard"]`.

## Files

### Server group (`server/`, `server/src/vendor/shared`)

| path | new/modify | what changes | AC |
|---|---|---|---|
| `server/src/vendor/shared/contracts/knowledge.ts` | modify | Eval region (`:49-84`) per the shapes above | AC-31 |
| `server/src/vendor/shared/contracts/eval-ci.ts` | modify | Eval region (`:15-89`). The import line `:3` gains the new names. | AC-31 |
| `server/test/eval-contracts.test.ts` | new | shape cases + parity cases | AC-31 |
| `server/src/db/schema/eval.ts` | modify | D-1 columns and indexes | AC-4, AC-13, AC-20, AC-23 |
| `server/src/db/migrations/0014_*.sql`, `meta/0014_snapshot.json`, `meta/_journal.json` | generated | output of `pnpm db:generate`, committed unchanged | same |
| `server/src/modules/_shared/task-line.ts`, `task-line.test.ts` | new | `taskInstruction(prNumber, author \| null)` | AC-10 |
| `server/src/modules/reviews/helpers.ts` | modify | `taskLine` (`:92-102`) delegates, output unchanged | NFR-9 |
| `server/src/modules/eval/constants.ts` | new | error codes, `RUN_INTERRUPTED`, `RECENT_RUNS = 10`, `MAX_ERROR_CHARS = 500`, `MAX_DIFF_CELLS` | — |
| `server/src/modules/eval/scoring.ts`, `scoring.test.ts` | new | pure matching, statuses, metrics, cost | AC-17–19, AC-22, AC-35 |
| `server/src/modules/eval/helpers.ts`, `helpers.test.ts` | new | `frozenDiff`, `zonesIntersect`, `diffLines`, `compareRuns` | AC-45, AC-25–28 |
| `server/src/modules/eval/repository.ts` (+ `repository/*.repo.ts`) + `repository/case.repo.ts`, `repository/run.repo.ts` | new | `eval_cases` + `eval_runs` only, workspace-scoped; `repository.ts` composes the two entity repos, as in `modules/reviews/` (AGENTS.md Naming; cross-model F-4) | AC-4, AC-13, AC-20, AC-32 |
| `server/src/modules/eval/cases.ts`, `cases.test.ts` | new | `createCaseFromFinding` | AC-2–5, AC-45 |
| `server/src/modules/eval/run-executor.ts`, `run-executor.test.ts` | new | background run | AC-9–12, AC-14, AC-15, AC-20, AC-33, AC-34 |
| `server/src/modules/eval/service.ts`, `service.test.ts` | new | start, overview, delete, compare, dashboard, reap | AC-6–9, AC-13, AC-16, AC-21, AC-24–30 |
| `server/src/modules/eval/routes.ts` | new | the six routes | AC-32 |
| `server/src/modules/eval/eval.it.test.ts` | new | tables, cases, workspace boundaries | AC-2–5, AC-7, AC-23, AC-32, AC-36, AC-45 |
| `server/src/modules/eval/eval-runs.it.test.ts` | new | runs, Compare, dashboard, AC-42 twin | AC-9, AC-12, AC-13, AC-15, AC-16, AC-29, AC-30, AC-34, AC-42 |
| `server/src/modules/index.ts` | modify | one import + entry `evals` (`:14`, `:29-43`) | — |
| `server/src/app.ts` | modify | eval reap after `:97-102` | AC-15 |
| `server/package.json` | modify | `verify:l06` script | AC-39 |
| `server/test/eval-boundary.test.ts` | new | feature files never name `evals/` | AC-37 |

### Client group (`client/`, `client/src/vendor/shared`)

| path | new/modify | what changes | AC |
|---|---|---|---|
| `client/src/vendor/shared/contracts/knowledge.ts`, `eval-ci.ts` | modify | the same two regions, byte-identical; the import line `:3` gains the same names | AC-31 |
| `client/src/lib/hooks/evals.ts`, `evals.test.ts`; `client/src/lib/hooks/index.ts` | new / modify | six hooks; one `export *` line | AC-2, AC-7–9, AC-36, AC-38 |
| `client/messages/en/eval.json` | modify | new keys; `evalsTab.emptyCases` replaced; `caseEditor` left untouched (NG2) | NFR-15 |
| `client/messages/en/agents.json` | modify | `editor.tabs.evals` | AC-6 |
| `client/src/components/eval/EvalMetrics/{EvalMetrics.tsx,index.ts,helpers.ts,styles.ts,EvalMetrics.test.tsx,helpers.test.ts}` | new | three metrics + N/M; format helpers | AC-18, AC-19, AC-21, NFR-10 |
| `client/src/components/eval/EvalRunTable/{EvalRunTable.tsx,index.ts,styles.ts,EvalRunTable.test.tsx}` | new | run rows; optional agent column; optional selection | AC-21, AC-22, AC-24, AC-30 |
| `client/src/components/showcase/Showcase.tsx` (+ `constants.ts`, verify it exists) | modify | gallery entries for the two components | — |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`, `FindingCard.test.tsx` | modify | `extraAction` slot in the actions row (`:91-112`) | AC-1 |
| `.../pulls/[number]/_components/EvalCaseButton/{EvalCaseButton.tsx,index.ts,helpers.ts,EvalCaseButton.test.tsx}` | new | container: hook, toast, error text | AC-1, AC-2, AC-4, AC-5, AC-45 |
| `.../pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx` (`:120-129`), `DiffTab/DiffTab.tsx` (`:84-90`) + their tests' hook mocks | modify | pass `extraAction` | AC-1 |
| `client/src/app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx,AgentEditor.test.tsx}` | modify | fourth tab `evals` (`constants.ts:11-15`, `AgentEditor.tsx:26-32`, test `:79-87`) | AC-6 |
| `.../AgentEditor/_components/EvalsTab/{EvalsTab.tsx,index.ts,helpers.ts,styles.ts,EvalsTab.test.tsx,helpers.test.ts}` | new | cases, run, status line, metrics, history, Compare selection | AC-6–9, AC-13, AC-21, AC-22, AC-24 |
| `client/src/app/eval/compare/page.tsx`, `_components/EvalCompareView/{…, EvalCompareView.test.tsx, helpers.ts, helpers.test.ts}` | new | Compare page | AC-24–28 |
| `client/src/app/eval/page.tsx`, `_components/EvalDashboardView/{…, EvalDashboardView.test.tsx}` | new | Eval Dashboard | AC-29, AC-30, AC-38 |
| `client/src/vendor/ui/nav.ts`, `nav.test.ts` (verify it exists) | modify | SKILLS LAB item `eval` (`nav.ts:34-41`) | AC-29 |

Not touched:
- `reviewer-core/**` (NG8);
- applied migrations `0000`–`0013`;
- every lock file (no new dependency);
- `devdigest-mcp/`, `e2e/`;
- the repo-root `evals/` package (AC-37);
- `SkillDetailView/constants.ts:12` (NG4).

## Tasks

### Order, sessions, critical path

- **Server implementer:** T-S1 … T-S10. **Client implementer:** T-C1 … T-C8. **Final step:** T-V1, done by the user and the coordinator.
- About 45 turns of work on the server and 35 on the client — more than one session's ~35-turn limit. Each group runs as **three** sequential sessions with a hard hand-off: a session ends only when its tasks are green (`typecheck` + their tests), and the next session starts fresh from the repo state (cross-model F-3).
  - Server A: T-S1 → T-S3 (contracts, schema + migration, pure scoring). Server B: T-S4 → T-S6 (helpers, repository + case creation, executor). Server C: T-S7 → T-S10 (reads, routes, integration tests, `verify:l06`).
  - Client A: T-C1 → T-C3 (contracts, hooks, messages + shared components). Client B: T-C4 → T-C5 (finding-card control, Evals tab cases + run). Client C: T-C6 → T-C8 (metrics + history, Compare, Dashboard).
  - If a session still runs out of turns, its last unfinished task is split at its test boundary and resumed in a new session — never continued in the same over-long one.
- **Critical path:** T-S1 → T-S2 → T-S5 → T-S6 → T-S8 → T-S9 → T-S10 → T-V1.
- **Client path:** T-S1 → T-C1 → T-C2 → T-C5 → T-C6 → T-C7. T-C3 comes before T-C5. T-C4, T-C7 and T-C8 can run in any order once T-C2 and T-C3 are done.
- T-S10 needs T-C1, because the parity suite is red until the client copy matches.

## Server group

### T-S1 — Eval contracts, server copy; shape and parity tests
AC: AC-31
Files: `server/src/vendor/shared/contracts/knowledge.ts`, `server/src/vendor/shared/contracts/eval-ci.ts`, `server/test/eval-contracts.test.ts`
First, before editing:
- Run `diff -rq server/src/vendor/shared client/src/vendor/shared` and record the list of differing files.
- For `knowledge.ts` and `eval-ci.ts`, count the lines that differ between the copies outside their Eval regions (D-5).
- Pin both results as constants in the test.

Then edit only the two regions, plus the import line `eval-ci.ts:3`. Keep the region marker lines unchanged.
Test: `server/test/eval-contracts.test.ts`
- describe `shapes`:
  - `EvalMetric` accepts 0, 0.5, 1 and `null`, and rejects 1.01, −0.1 and `'n/a'`;
  - the existing `EvalRun` fixture (`server/test/contracts.test.ts:161-170`) still parses, and so does a run with all three metrics `null`;
  - `EvalCaseResult` parses an `error` case with `cost_usd: null`;
  - `EvalRunRecord` rejects the status `'done'`;
  - `EvalCaseRow` accepts `latest_status: 'never_run'`;
  - `EvalCompare` parses with `prompt.status: 'unavailable'` and null deltas;
  - `EvalDashboard` parses the new shape.
- describe `parity` (red until T-C1):
  - the Eval region of `knowledge.ts` and of `eval-ci.ts` is the same text in both copies;
  - outside the regions, the count of differing lines per file is ≤ the pinned baseline;
  - the set of differing files under `vendor/shared` equals the pinned list.
Verify: in `server/`, `pnpm typecheck && pnpm exec vitest run test/eval-contracts.test.ts -t shapes test/contracts.test.ts`
Skills: zod, typescript-expert
Depends on: —
Risks: if `server/test/contracts.test.ts` stops compiling, fix the fixture types only. Keep the `EvalRun` fixture values unchanged.

### T-S2 — Schema and the generated migration
AC: AC-4, AC-13, AC-20, AC-23
Files: `server/src/db/schema/eval.ts`, `server/src/db/migrations/0014_*.sql` + `meta/0014_snapshot.json` + `meta/_journal.json` (generated), `server/src/modules/eval/eval.it.test.ts` (describe `eval tables`)
Change:
- Add the D-1 columns. Every new column is nullable or has a default.
- `status`: text with enum `running` / `completed` / `failed`, default `'running'`.
- `skills` and `results`: jsonb typed with `$type<>` from the T-S1 contracts.
- `uniqueIndex('eval_cases_source_finding_uq')` on `source_finding_id`.
- `index` on `eval_cases(agent_id)`.
- `uniqueIndex('eval_runs_agent_running_uq').on(agentId).where(sql\`status = 'running'\`)`.
- `index` on `eval_runs(agent_id, ran_at)`.
- `case_id` drops `.notNull()`.
- `eval.ts` newly imports `agents` from `./agents`.

Generate:
- Run `pnpm db:generate`.
- Check that `grep -inE "drop table|drop column|rename" src/db/migrations/0014_*.sql` prints nothing. The only non-add statement allowed is `ALTER COLUMN "case_id" DROP NOT NULL`.
- Check that the partial index has its `WHERE`.
- Commit the generated files unchanged.
Test: `eval.it.test.ts` › `eval tables`. Setup: `startPg` + `seed`, as `project-context.it.test.ts:16-31`.
- `information_schema` shows the new columns, and `eval_runs.case_id` is nullable (AC-20);
- a second case with the same `source_finding_id` is rejected (AC-4);
- a second `running` run of one agent is rejected, while one `running` and one `completed` coexist (AC-13);
- deleting the agent removes its cases and runs (AC-23).
Verify: in `server/`, `pnpm db:generate && pnpm typecheck && pnpm exec vitest run src/modules/eval/eval.it.test.ts` (Docker)
Skills: drizzle-orm-patterns, postgresql-table-design
Depends on: T-S1
Risks:
- verify: drizzle-kit 0.30.1 emits the `WHERE` of a partial unique index. If it does not, drop that index from the schema and enforce AC-13 in `insertRunning` with the agent-row lock of D-3.
- verify: `db:generate` asks no interactive question. If it does, stop and reshape the change as additions-only.

### T-S3 — Pure scoring
AC: AC-17, AC-18, AC-19, AC-22, AC-35
Files: `server/src/modules/eval/scoring.ts`, `server/src/modules/eval/scoring.test.ts`
Signatures:
- `countMatches(kept: EvalKeptFinding[], exp: EvalExpectation): number`
- `caseStatus(type: EvalExpectationType, matches: number): 'passed' | 'failed'`
- `scoreRun(results: EvalCaseResult[]): { recall, precision, citation_accuracy: EvalMetric; passed: number; total: number; has_errors: boolean }`
- `runCost(results: EvalCaseResult[]): number | null`

`scoring.ts` has type-only imports.
Test: `scoring.test.ts` (verify:l06 suite 1)
- `countMatches` (AC-17):
  - same file with ranges sharing one line → 1;
  - `end 10` against `start 11` → 0;
  - a reversed range (`20..15`) against `16..16` → 1;
  - another file → 0;
  - a different title, severity or category still matches.
- `caseStatus`: must_find with ≥1 match → passed; must_not_flag with 0 matches → passed; otherwise failed (AC-19).
- `scoreRun`:
  - recall, precision and citation accuracy follow the AC-18 formulas on a mixed fixture;
  - a kept finding of one case that lies on another case's `must_not_flag` zone does not count (own case only);
  - `error` cases are excluded from the metrics, counted in `total` and not in `passed` (AC-18, AC-19).
- n/a edge cases:
  - a set of only `must_not_flag` cases → recall `null` (EC-12);
  - no findings at all → precision and citation `null`, recall 0 (EC-12);
  - every finding dropped → citation 0, precision `null` (EC-13);
  - every case `error` → three `null`s, `passed` 0 (EC-14).
- `runCost` is the sum when every case cost is a number, and `null` when any is `null` — never a partial sum (AC-22).
- Determinism: `scoreRun` twice → deep-equal, and statuses recomputed from `kept_findings` equal the stored ones (NFR-2).
- Zero model calls:
  - the source text of `scoring.ts` has no non-type import from `adapters`, `platform/container` or `@devdigest/reviewer-core`;
  - scoring a 100-case fixture with a `MockLLMProvider` in scope leaves `calls` empty (AC-35).
Verify: in `server/`, `pnpm typecheck && pnpm exec vitest run src/modules/eval/scoring.test.ts`
Skills: typescript-expert
Depends on: T-S1

### T-S4 — Task line without the author; frozen diff and zone helpers
AC: AC-10, AC-45 (enables T-S5, T-S6)
Files: `server/src/modules/_shared/task-line.ts`, `server/src/modules/_shared/task-line.test.ts`, `server/src/modules/reviews/helpers.ts`, `server/src/modules/eval/helpers.ts`, `server/src/modules/eval/helpers.test.ts`
Signatures:
- `taskInstruction(prNumber: number, author: string | null): string`
- `frozenDiff(path: string, patch: string): string`
- `zonesIntersect(a: { pr_id; file; start_line; end_line }, b: same): boolean`
Test:
- `task-line.test.ts`:
  - `taskLine({ number: 482, author: 'alice' })` equals today's text byte-for-byte, with the literal copied from `reviews/helpers.ts:93-100` (NFR-9);
  - `taskInstruction(482, null)` equals that text minus ` by alice` and contains `#482` (AC-10).
- `helpers.test.ts` (part 1):
  - `frozenDiff` gives the D-2 header plus the patch;
  - `parseUnifiedDiff` of it yields one file holding every hunk;
  - a 5 000-line patch stays whole (EC-7);
  - `zonesIntersect`: same PR and file with overlapping or touching ranges → true; another PR → false; another file → false (AC-45).
Verify: in `server/`, `pnpm typecheck && pnpm exec vitest run src/modules/_shared/task-line.test.ts src/modules/eval/helpers.test.ts test/prompt-callers.test.ts`
Skills: onion-architecture, typescript-expert
Depends on: T-S1

### T-S5 — Repository and case creation
AC: AC-2, AC-3, AC-4, AC-5, AC-45, AC-32, AC-36
Files: `server/src/modules/eval/constants.ts`, `server/src/modules/eval/repository.ts` (+ `repository/*.repo.ts`), `server/src/modules/eval/cases.ts`, `server/src/modules/eval/cases.test.ts`
Signatures:
- `EvalRepository(db)` with:
  - `caseBySourceFinding(workspaceId, findingId)`;
  - `createCaseExclusive(values, decide: (agentCases) => EvalCaseRowLike | null)`. It runs in one transaction: lock the agent row `FOR UPDATE`, load the agent's cases, call `decide`, then insert with `onConflictDoNothing` on `source_finding_id`. It returns `{ kind: 'created' | 'existing' | 'conflict', … }`.
  - `listCases(workspaceId, agentId)`;
  - `deleteCase(workspaceId, agentId, caseId)`;
  - the run methods are added in T-S6.
- `createCaseFromFinding(container, repo, workspaceId, findingId): Promise<EvalCaseCreated>`

Flow:
1. `container.reviewRepo.findingContext` (`review.repo.ts:118-132`). A missing finding, or a PR of another workspace → `NotFoundError`.
2. An existing case for the finding → return it with `created: false`.
3. Undecided finding → `eval_case_undecided`.
4. `review.agentId` null, or `agentsRepo.getById(workspaceId, …)` misses → `eval_case_no_agent`.
5. `reviewRepo.getPrFiles(pull.id)` has no row for `finding.file` with a non-blank patch → `eval_case_no_patch`.
6. The D-7 gate does not keep the finding → `eval_case_no_hunk`.
7. `createCaseExclusive`, where `decide` finds an opposite-type case with `zonesIntersect` → 409 `eval_case_conflict`. Its details hold `{ case_id, case_name }` of the existing case.

Messages are fixed text and never echo the patch.
Test: `cases.test.ts` (verify:l06 suite 2). The container is a stub with `reviewRepo` / `agentsRepo` fakes, the repository is `vi.mock`-ed, and `container.llm` is a spy.
- accepted finding → `must_find`; the expectation's file, lines and title equal the finding's; `name` = title; `source_finding_id` = finding id; `created: true` with the agent id and name (AC-2).
- dismissed finding → `must_not_flag` (AC-2).
- stored frozen input (AC-3, EC-8):
  - `input_diff` = `frozenDiff(file, patch)` with every hunk;
  - `input_meta` = PR id, number, title, description and file;
  - no `author` key, and the author string appears in no stored value;
  - an empty PR body gives `pr_description: ''`.
- an existing case → returned with `created: false`, and the insert is not called. This holds after a flipped decision too (AC-4, EC-2).
- each refusal returns its code and the insert is not called (AC-5):
  - undecided;
  - `agentId: null`;
  - the agent is gone;
  - no file row, a `null` patch or a whitespace patch (EC-6);
  - lines outside every hunk (EC-5);
  - no agent and no patch → one of the two reasons (EC-1).
- zone conflict (AC-45, EC-4, EC-26):
  - an existing `must_find` at 153-180 and a new `must_not_flag` at 156-188, same file and PR → 409 naming the existing case;
  - the reverse order → 409;
  - the same type on the same lines → created.
- a finding of another workspace → `NotFoundError`, and `getPrFiles` is not called (AC-32).
- `container.llm` is never called (AC-36).
Verify: in `server/`, `pnpm typecheck && pnpm exec vitest run src/modules/eval/cases.test.ts`
Skills: onion-architecture, drizzle-orm-patterns, security
Depends on: T-S2, T-S4
Risks: verify the `vi.mock` repository pattern in `server/src/modules/brief/service.test.ts` before copying it.

### T-S6 — Run start and background executor
AC: AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-20, AC-22, AC-33, AC-34
Files: `server/src/modules/eval/run-executor.ts`, `server/src/modules/eval/run-executor.test.ts`, `server/src/modules/eval/service.ts`, `server/src/modules/eval/service.test.ts`, `server/src/modules/eval/repository.ts` (+ `repository/*.repo.ts`)
Signatures:
- repository:
  - `insertRunning(values): Promise<EvalRunRow | null>` (`null` on unique violation 23505);
  - `finishRun(runId, values): Promise<boolean>`;
  - `failRun(runId, reason)`;
  - `reapInterrupted(): Promise<number>`.
- `EvalService(container)`:
  - `startRun(workspaceId, agentId, logger?)` → `EvalRunRecord`;
  - `reapInterrupted()`.
- `EvalRunExecutor(container, repo)`:
  - `execute(run, agent, cases, skills: SkillPart[], logger?)`.

Per case, call `reviewPullRequest` (mirror `reviews/run-executor.ts:261-324`) with:
- `systemPrompt`, `model`, `strategy: agent.strategy`;
- `diff: parseUnifiedDiff(case.input_diff)`, `llm`;
- `skills` only when non-empty;
- `prTitle`; `prDescription` only when non-empty;
- `task: taskInstruction(pr_number, null)`;
- `countTokens`, `onPromptAssembled` → `logPromptAssembly`, `onLlmCall` → `logLlmCall`.

Never pass `callers`, `repoMap`, `intent`, `specs`, `memory` or `sessionId`.
Per-case result:
- kept = `outcome.review.findings`;
- dropped = `outcome.dropped.length`;
- cost = `outcome.costUsd`;
- a throw → `error` with the reason cut to `MAX_ERROR_CHARS`.

At the end, `scoreRun` + `runCost` feed one `finishRun`. A top-level crash → `failRun`.
Test: `run-executor.test.ts` uses a recording LLM: a subclass of `MockLLMProvider` (`adapters/mocks.ts:64-111`) with per-call fixtures and the request messages captured.
- 3 cases → exactly 3 `completeStructured` calls, and one `finishRun` with `status: 'completed'` (AC-34).
- each request's messages deep-equal `assemblePrompt({ system, skills, diff: frozen, prTitle, prDescription, task, … }).messages` from reviewer-core (AC-11).
- AC-33: the frozen diff, the PR title and the PR description each sit in their own untrusted block, and the system text contains `INJECTION_GUARD`.
- AC-33, EC-23 (cross-model F-6): a diff, title and description that contain forged opening/closing delimiters and instruction text stay inside their own untrusted blocks — the forged delimiters are neutralised by the engine and no trusted section is opened or closed by them.
- AC-10: no repo-skeleton, callers, intent or project-context section; the expectation title (a unique string) and the PR author are absent.
- a model finding outside every hunk is dropped by the gate (`kept 0, dropped 1`) (AC-11).
- two executions with the same configuration give identical messages per case (AC-12).
- configuration and cases are read once (AC-9, EC-10, EC-15): changing the agent's prompt in the fake after the start, or deleting a case, changes nothing; every call uses the start prompt and the deleted case is still evaluated.
- the LLM throws on case 2 → case 2 is `error` with its reason, case 3 is evaluated, `has_errors: true`, status `completed` (AC-14, EC-18).
- structured-output retries exhausted on case 2, and a provider timeout error on case 2 (two tests, cross-model F-7) → each gives one `error` result for case 2, later cases are evaluated, the run completes with `has_errors: true` (AC-14).
- `container.llm` rejects with `ConfigError` → `failRun` with that reason, zero calls, no results (AC-15, EC-18).
- stored record (AC-20, EC-11):
  - agent id, version, provider, model;
  - `skills` = the enabled linked skills in order, name and version;
  - metrics, passed, total, cost;
  - per case: name, type, location, kept, dropped, `kept_findings`, cost, error.
- `costUsd: null` from the mock → case cost and run cost are `null` (AC-22, EC-19).
- `finishRun` returning `false` (agent deleted) → no throw, nothing else written (EC-16).
- every log record carries the run, agent and case ids, and, with the default (non-verbose) log level, no log field contains the frozen diff, the description or the system prompt (NFR-4). The existing verbose local prompt logging stays as it is — its exception in NFR-4 is not re-tested here (cross-model F-9).

Test: `service.test.ts` (part 1)
- `startRun` with 0 cases → 422 `eval_set_empty`, nothing inserted (AC-8).
- `insertRunning` returns `null` → 409 `eval_run_in_progress`, and the executor is not started (AC-13).
- a disabled agent starts (AC-16).
- the answer is `status: 'running'` before any LLM call (AC-9).
- another workspace's agent → `NotFoundError` (AC-32).
Verify: in `server/`, `pnpm typecheck && pnpm exec vitest run src/modules/eval/run-executor.test.ts src/modules/eval/service.test.ts`
Skills: onion-architecture, security, typescript-expert
Depends on: T-S3, T-S4, T-S5
Risks:
- verify: the untrusted source labels and section headings in `reviewer-core/src/prompt.ts:79-90` and `:258-333` before asserting on them.
- verify: whether a provider timeout exists in `adapters/llm/openai.ts`, `adapters/llm/anthropic.ts` and `reviewer-core/src/llm/openrouter.ts`. If one has none, record it under Risks of the report. Do not add a race timeout.
- verify: postgres.js exposes the unique violation as `err.code === '23505'`.

### T-S7 — Reads: overview, delete, Compare, dashboard
AC: AC-6, AC-7, AC-21, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-38
Files: `server/src/modules/eval/helpers.ts`, `server/src/modules/eval/helpers.test.ts`, `server/src/modules/eval/service.ts`, `server/src/modules/eval/service.test.ts`, `server/src/modules/eval/repository.ts` (+ `repository/*.repo.ts`)
Signatures:
- `diffLines(before, after): EvalDiffLine[]`
- `compareRuns(a: RunWithResults, b: RunWithResults, prompts: { [version]: string | null }): Omit<EvalCompare, 'agent_id' | 'agent_name'>`
- service methods `overview`, `deleteCase`, `compare`, `dashboard`
- repository methods `listRuns(workspaceId, agentId)`, `runsByIds(workspaceId, ids)`, `dashboardRows(workspaceId)`, `recentRuns(workspaceId, 10)`; agent names via a `leftJoin` on `agents`
Test: `helpers.test.ts` (part 2)
- `diffLines`: equal texts → all `context`; one changed line → `remove` + `add`; above `MAX_DIFF_CELLS` → replace-all (AC-27).
- `compareRuns`:
  - `earlier` and `later` are ordered by `started_at`, whatever the argument order, and every delta is later − earlier (AC-25);
  - a metric `null` on either side → delta `null`, and the same for cost (AC-25, AC-22);
  - `changed`, `added` and `removed` are computed by `case_id` (AC-26);
  - prompt status: the same version → `unchanged` (EC-21); a missing snapshot → `unavailable` with that version listed (EC-22); otherwise `changed` with lines (AC-27);
  - skills: the same version with different skills → `only_earlier` / `only_later` by name and version; the same skills in a different order → `reordered: true` with both ordered lists, because order changes the prompt (`agent_skills.order`) (AC-28, EC-11; cross-model F-1).

Test: `service.test.ts` (part 2)
- overview (AC-6, AC-21, NFR-11):
  - cases newest first;
  - `latest_status` comes from the latest **completed** run, not from a newer running or failed one;
  - a case missing from that run is `never_run`;
  - runs newest first.
- `deleteCase` is scoped to the workspace and the agent, and touches no run row (AC-7).
- `compare` (AC-24, AC-32):
  - a run of another workspace → `NotFoundError`;
  - one run `running`, two different agents, or `a === b` → 422 `eval_compare_invalid`;
  - prompts come from `agentsRepo.getVersion`.
- `dashboard` (AC-29, AC-30, AC-38, EC-25):
  - only agents with ≥1 case, a disabled one included;
  - `latest` = the latest completed run or `null`;
  - `recent_runs` ≤ 10, newest first, across agents;
  - nothing but `eval_runs` and `eval_cases` data.
Verify: in `server/`, `pnpm typecheck && pnpm exec vitest run src/modules/eval/helpers.test.ts src/modules/eval/service.test.ts`
Skills: onion-architecture, drizzle-orm-patterns
Depends on: T-S3, T-S5
Risks: verify the `MAX_DIFF_CELLS` value in `client/src/app/skills/[id]/_components/SkillDetailView/constants.ts` and use the same one.

### T-S8 — Routes, registration, boot reap; integration tests for cases and workspace boundaries
AC: AC-2, AC-3, AC-4, AC-5, AC-7, AC-23, AC-31, AC-32, AC-36, AC-45
Files: `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts`, `server/src/app.ts`, `server/src/modules/eval/eval.it.test.ts`
Change:
- Routes follow the hand-off table. They are transport only, with zod `params` / `querystring` and `response` schemas, in the style of `project-context/routes.ts:29-73`. Case params: `{ id: uuid, caseId: uuid }`. Compare query: `{ a: uuid, b: uuid }`.
- The run route passes `req.log` as the logger.
- `app.ts` gets a second try/catch reap, `new EvalService(container).reapInterrupted()`.
Test: `eval.it.test.ts` (verify:l06 suite 4). It uses `buildApp` with `MockLLMProvider` overrides, as `project-context.it.test.ts:141-170`.
- `POST /findings/:id/eval-case`: accepted → 201 `must_find`; dismissed → 201 `must_not_flag`; a repeat → 200 with the same id (AC-2, AC-4).
- two concurrent POSTs for one finding → one 201 and one 200, one row (AC-4).
- the refusals give their 422 codes, and the table is unchanged (AC-5).
- EC-26 data on the same file → 409 with the existing case's name in `details` (AC-45).
- the stored case is byte-equal after each of these (AC-3, EC-9):
  - re-sync (delete the `pr_files` rows and insert a new patch);
  - a new `head_sha`;
  - `DELETE /reviews/:id`;
  - a flipped decision;
  - the overview shows the same expectation.
- `DELETE` of a case → gone from the overview, and an earlier run row stays byte-equal (AC-7).
- every eval route with another workspace's agent, case, run or finding id → 404 `not_found`, row counts unchanged (AC-32, NFR-5).
- `DELETE /agents/:id` → its cases and runs are gone (AC-23).
- these leave `llm.calls` empty and the `eval_runs` count unchanged (AC-36):
  - GET of the overview, compare and dashboard;
  - `GET /pulls/:id/reviews`;
  - POST and DELETE of a case.
- every 2xx body parses with its contract schema (AC-31).
Verify: in `server/`, `pnpm typecheck && pnpm exec vitest run src/modules/eval` (Docker)
Skills: fastify-best-practices, onion-architecture, security
Depends on: T-S5, T-S6, T-S7

### T-S9 — Integration tests for runs, Compare, dashboard and the AC-42 twin
AC: AC-9, AC-12, AC-13, AC-15, AC-16, AC-25, AC-29, AC-30, AC-34, AC-42
Files: `server/src/modules/eval/eval-runs.it.test.ts`
Test: `eval-runs.it.test.ts` (verify:l06 suite 4)
- `POST /agents/:id/evals/runs` → 202 `running`; poll the overview until `completed`; 3 cases → 3 model calls (AC-9, AC-34).
- a gated LLM whose call waits on a test-held promise + two concurrent POSTs → one 202 and one 409 `eval_run_in_progress`, one running row (AC-13, EC-17).
- a disabled agent → 202, and the run completes (AC-16, EC-25).
- a row inserted as `running`, then a second `buildApp` → the row is `failed` with `error: 'interrupted'`, and a new POST → 202 (AC-15, EC-20).
- AC-12: run, then change each of these, then run again → the recorded messages per case are equal:
  - the PR title and body;
  - the `pr_files` patch;
  - a new `pr_intent` row;
  - a project-context attachment on the agent.
- **AC-42 twin.** The stub returns findings by system prompt: plain → none; containing `TARGET-A` → a finding at case A (`must_find`); also containing `FLAG-ALL` → findings at A and B (`must_not_flag`). The prompt is changed through `PUT /agents/:id` (bumps the version).
  - v1 → v2: Compare has `delta.recall > 0`, `prompt.status: 'changed'`, and lines with `remove` and `add`.
  - v2 → v3: `delta.precision < 0`, and `changed` lists B going from `passed` to `failed` (AC-42; twin of AC-43, AC-44).
  - `delta.precision` is `null` when one side is n/a (AC-25).
- dashboard after the runs: the agent row has the latest version and metrics, and `recent_runs` is newest first and ≤ 10 (AC-29, AC-30).
Verify: in `server/`, `pnpm exec vitest run src/modules/eval/eval-runs.it.test.ts` (Docker)
Skills: drizzle-orm-patterns, fastify-best-practices
Depends on: T-S8
Risks: `buildApp` reaps every running row on boot (`app.ts:97-102` + D-10). Keep the interrupted test sequential and give it no in-flight run of another test.

### T-S10 — `verify:l06` and the feature-side boundary check
AC: AC-37, AC-39, AC-40
Files: `server/package.json`, `server/test/eval-boundary.test.ts`
Change: `"verify:l06": "vitest run src/modules/eval/scoring.test.ts src/modules/eval/cases.test.ts test/eval-contracts.test.ts src/modules/eval/eval.it.test.ts src/modules/eval/eval-runs.it.test.ts"`. The suites, in order:
1. scoring — `scoring.test.ts`;
2. case creation — `cases.test.ts`;
3. contract parity — `test/eval-contracts.test.ts`;
4. integration of the routes and the workspace boundaries — the two `*.it.test.ts` files together form this one suite (split only to keep T-S8 and T-S9 small).

The boundary test is not part of `verify:l06`: AC-39 fixes the four suites. It runs in `pnpm test` (cross-model F-2, partly accepted).

The integration files skip themselves without Docker (`test/helpers/pg.ts:23-33`).
Test: `server/test/eval-boundary.test.ts`. It reads only the feature's own files:
- `server/src/modules/eval/**`;
- `server/test/eval-contracts.test.ts`;
- `client/src/lib/hooks/evals.ts`, `client/src/components/eval/**`, `client/src/app/eval/**`, `.../EvalsTab/**`, `.../EvalCaseButton/**`;
- the `verify:l06` script.

It asserts that none imports or names a path under the repo-root `evals/` (AC-37, feature side). A second case covers the `evals/` side (cross-model F-8): it reads `evals/**/*.{ts,mjs,json,yml}` as plain text and asserts none names the server `eval` module, its tables or its routes. This is test code reading files as text; the feature's runtime code still never reads `evals/`.
Verify, all in `server/`:
- `pnpm verify:l06` exits 0 with Docker up (AC-40);
- `DOCKER_HOST=tcp://127.0.0.1:1 pnpm verify:l06` exits 0 with the integration suites skipped (AC-39);
- the same with `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` unset (AC-39);
- `pnpm typecheck && pnpm test`;
- `git diff --stat main -- ../reviewer-core` is empty (AC-11, NG8).

The `evals/` side is now covered by the second boundary test case (above), not by a manual grep.
Skills: —
Depends on: T-S3, T-S5, T-S8, T-S9, T-C1
Risks:
- verify: `server/vitest.config.ts` includes `test/**` and `src/**`.
- verify: `pgvector/pgvector:pg16` is already in the local Docker image cache. Otherwise testcontainers makes a network pull, which breaks AC-39's "no network request".

## Client group

### T-C1 — Client copy of the Eval contracts
AC: AC-31
Files: `client/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/eval-ci.ts`
Change: copy the two Eval regions from the server copy byte-for-byte. Add the same new names to the import line `eval-ci.ts:3`. Nothing else changes.
Test: `server/test/eval-contracts.test.ts` › `parity` (written in T-S1) is now green.
Verify: in `client/`, `pnpm typecheck`; in `server/`, `pnpm exec vitest run test/eval-contracts.test.ts` (read-only use of server/)
Skills: zod
Depends on: T-S1

### T-C2 — Data hooks
AC: AC-2, AC-7, AC-8, AC-9, AC-36, AC-38
Files: `client/src/lib/hooks/evals.ts`, `client/src/lib/hooks/evals.test.ts`, `client/src/lib/hooks/index.ts`
Signatures (types are `import type` from `@devdigest/shared`):
- `useEvalOverview(agentId)`: `refetchInterval: (q) => q.state.data?.runs.some(r => r.status === 'running') ? 2500 : false`
- `useCreateEvalCase()`
- `useDeleteEvalCase(agentId)`
- `useRunEval(agentId)`
- `useEvalCompare(a, b)`
- `useEvalDashboard()`
Test: `evals.test.ts` (`../api` mocked as `hooks/reviews.test.ts:7-18`)
- `useEvalOverview('a1')` makes one GET to `/agents/a1/evals`; `null` disables it. With fake timers: a second GET after 2.5 s while a run is `running`, none when all runs are completed (NFR-13).
- `useCreateEvalCase().mutateAsync('f1')` POSTs `/findings/f1/eval-case`, then invalidates `["eval-overview", agent_id]` and `["eval-dashboard"]` (AC-2).
- `useDeleteEvalCase('a1')` DELETEs `/agents/a1/evals/cases/c1`. A rejection leaves the cache unchanged (AC-7, NFR-14).
- `useRunEval('a1')` POSTs `/agents/a1/evals/runs` and puts the returned running run first in the overview cache (AC-8, AC-9).
- `useEvalCompare` is disabled unless both ids are present, and requests `/evals/compare?a=…&b=…`. `useEvalDashboard` GETs `/evals/dashboard`.
- mounting the read hooks issues GETs only (AC-36). Every URL used is under `/agents/:id/evals`, `/evals/` or `/findings/:id/eval-case` (AC-38).
Verify: in `client/`, `pnpm typecheck && pnpm exec vitest run src/lib/hooks/evals.test.ts`
Skills: frontend-architecture, react-testing-library
Depends on: T-C1

### T-C3 — Messages and shared presentational components
AC: AC-18, AC-19, AC-21, AC-22, AC-30 (display parts)
Files: `client/messages/en/eval.json`, `client/src/components/eval/EvalMetrics/*`, `client/src/components/eval/EvalRunTable/*`, `client/src/components/showcase/Showcase.tsx` (+ its `constants.ts` if present)
Messages:
- reuse the `dashboard.*`, `evalsTab.*` and `page.*` keys where the wording fits;
- replace `evalsTab.emptyCases` with a text about "Turn into eval case" on an accepted or dismissed finding;
- add: `na`, `passedCount`, `type.mustFind`, `type.mustNotFlag`, `status.running|completed|failed|passed|failed|error|neverRun`, `hasErrors`, `statusLine.running`, `statusLine.failed`, `history.*`, `compare.*`, `turnInto.*` (label, hint, success, `errors.<code>`), `deleteConfirm.*`, `loadError`, `retry`, `dashboard.agentsTitle`, `dashboard.empty`;
- keep `caseEditor` (NG2).

Helpers in `EvalMetrics/helpers.ts`:
- `formatMetric(v) → "83%" | null`
- `formatDeltaPp(d) → "+12 pp" | "−5 pp" | "0 pp" | null` (U+2212 for minus)
- `formatPassed(passed, total)`
- `formatCostDelta(d) → "+$0.012" | null`

`null` renders `t('na')`.
`EvalRunTable` props: `{ runs: EvalRunRecord[]; showAgent?: boolean; selectable?: boolean; selected?: string[]; onToggle?(id) }`. Cost uses `RunCostBadge` from `@devdigest/ui` (`vendor/ui/primitives/RunCostBadge.tsx:13`).
Test:
- `EvalMetrics/helpers.test.ts`: the formats above (NFR-10).
- `EvalMetrics.test.tsx`: three metrics and "5/8 passed"; a `null` metric shows "n/a", never "0%" (AC-18, AC-19).
- `EvalRunTable.test.tsx`:
  - columns: start time, status, has-errors mark, agent version, three metrics, N/M, cost (AC-21);
  - `cost_usd: null` → "—", never "$0.00" (AC-22);
  - the agent column only with `showAgent` (AC-30);
  - only `completed` rows have a checkbox (AC-24);
  - a name holding `<img src=x onerror=…>` renders as text with no `img` element (NFR-8).
- `client/src/test/smoke.test.tsx` still mounts the gallery.
Verify: in `client/`, `pnpm typecheck && pnpm test`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-C1

### T-C4 — "Turn into eval case" on the finding card
AC: AC-1, AC-2, AC-4, AC-5, AC-45
Files: `.../pulls/[number]/_components/FindingCard/FindingCard.tsx`, `FindingCard.test.tsx`; `.../_components/EvalCaseButton/{EvalCaseButton.tsx,index.ts,helpers.ts,EvalCaseButton.test.tsx}`; `.../_components/FindingsPanel/FindingsPanel.tsx` + test; `.../_components/DiffTab/DiffTab.tsx` + test
Change:
- `FindingCard` gets `extraAction?: React.ReactNode`, rendered after Dismiss in `s.actions` (`FindingCard.tsx:91-112`).
- `EvalCaseButton({ finding })` is enabled only when `accepted_at` or `dismissed_at` is set. When disabled, it shows the hint as `title` + `aria-describedby`.
- On click it runs `useCreateEvalCase`:
  - success → `notify.success(<Link href={`/agents/${agent_id}?tab=evals`}>…</Link>)`. `notify` takes a ReactNode (`lib/toast.tsx:12-13,35-40`).
  - error → `notify.error(t(errorKey(code), { name: details?.case_name }))`, with `errorKey` in `helpers.ts`.
- `FindingsPanel` (`:120-129`) and `DiffTab` (`:84-90`) pass `extraAction={<EvalCaseButton finding={f} />}`. The showcase passes nothing.
Test:
- `EvalCaseButton.test.tsx` (hooks module mocked):
  - undecided → disabled with the hint text (AC-1, NFR-12);
  - accepted, and dismissed → enabled (AC-1);
  - a click calls `mutate("f1")` once (AC-2);
  - success → the toast links to `/agents/a1?tab=evals` (AC-2);
  - `created: false` → the same confirmation (AC-4);
  - each 422 code → its reason text (AC-5);
  - 409 → a text that contains the conflicting case's name (AC-45, NFR-14).
- `FindingCard.test.tsx`: `extraAction` renders in the expanded actions row next to Accept and Dismiss (AC-1).
- `FindingsPanel.test.tsx`: every card renders the control (AC-1).
Verify: in `client/`, `pnpm typecheck && pnpm test`
manual: on a running stack, expand a finding; the control sits next to Accept · Dismiss.
Skills: frontend-architecture, react-testing-library
Depends on: T-C2, T-C3
Risks:
- verify which hook module paths `FindingsPanel.test.tsx:8` and `DiffTab.test.tsx:18` mock, and add `useCreateEvalCase` there.
- Two controls with the same accessible name: give the control a distinct label (client INSIGHTS 2026-09-22).

### T-C5 — Evals tab: cases, Run eval, live status
AC: AC-6, AC-7, AC-8, AC-9, AC-13, AC-15, AC-21, AC-36
Files: `client/messages/en/agents.json`; `.../AgentEditor/constants.ts`, `AgentEditor.tsx`, `AgentEditor.test.tsx`; `.../AgentEditor/_components/EvalsTab/{EvalsTab.tsx,index.ts,helpers.ts,styles.ts,EvalsTab.test.tsx,helpers.test.ts}`
Change:
- Add `{ key: "evals", labelKey: "editor.tabs.evals", icon: <IconName> }` to `TABS`. `AgentEditor` renders `EvalsTab` for it.
- `EvalsTab({ agent })`:
  - header: "Run eval (N)", disabled when N = 0 or a run is `running`;
  - status line `role="status" aria-live="polite"` for the newest run when it is `running`, or `failed` with its reason;
  - case list: name, type badge, `file:start-end`, latest status;
  - delete → `ConfirmDialog` (`components/confirm-dialog/ConfirmDialog/ConfirmDialog.tsx:35`) → `useDeleteEvalCase`;
  - states: loading, error + retry, empty.
- `helpers.ts`: `latestCompleted(runs)`, `statusLineRun(runs)`, `caseLocation(exp)`.
Test:
- `AgentEditor.test.tsx`: the three-tab case at `:79-87` becomes four tabs including "Evals"; `tab="evals"` renders the Evals tab and not the Config form (AC-6).
- `EvalsTab/helpers.test.ts`: `latestCompleted` skips a newer running or failed run; `statusLineRun` returns the newest run only when it is running or failed (AC-21).
- `EvalsTab.test.tsx` (`@/lib/hooks/evals` mocked):
  - rows show name, type, `file:line`, and status including "never run" (AC-6);
  - "Run eval (3)" calls the run mutation; it is disabled with 0 cases and while a run is running (AC-8, AC-13, NFR-12);
  - a running run → its status text in the polite live region; a failed newer run → its reason, e.g. "interrupted" (AC-21, AC-15, NFR-13);
  - Delete → dialog → Confirm calls the mutation and Cancel does not; a failed delete keeps the row and shows the error (AC-7, NFR-12, NFR-14);
  - loading, error with a retry that calls `refetch`, and the empty state with the new `emptyCases` text (NFR-14, NFR-15);
  - on mount, only `useEvalOverview` is called and no mutation runs (AC-36).
Verify: in `client/`, `pnpm typecheck && pnpm test`
Skills: frontend-architecture, react-best-practices, react-testing-library, next-best-practices
Depends on: T-C2, T-C3
Risks:
- verify: pick the tab icon from the existing `IconName` set in `client/src/vendor/ui/icons`.
- Assert on copy, not on `role="alert"` (client INSIGHTS 2026-09-22).

### T-C6 — Evals tab: metrics, history, Compare selection
AC: AC-21, AC-22, AC-24
Files: `.../EvalsTab/EvalsTab.tsx`, `.../EvalsTab/EvalsTab.test.tsx`
Change:
- `EvalMetrics` shows the latest completed run.
- `EvalRunTable selectable` shows the history.
- "Compare" is enabled only with exactly two selected runs and pushes `/eval/compare?a=<id>&b=<id>`.
- Selection is local state, cleared when a selected run leaves the list.
Test: `EvalsTab.test.tsx`
- the metrics and N/M of the latest completed run are shown, not those of a newer running run (AC-21);
- the history is newest first with every column (AC-21, NFR-11);
- unpriced → "—" (AC-22);
- two completed runs selected → Compare navigates to the URL with both ids (`next/navigation` mocked); one or three selected → disabled; running and failed runs cannot be selected (AC-24).
Verify: in `client/`, `pnpm typecheck && pnpm test`
Skills: react-best-practices, react-testing-library
Depends on: T-C5

### T-C7 — Compare page
AC: AC-24, AC-25, AC-26, AC-27, AC-28
Files: `client/src/app/eval/compare/page.tsx`, `client/src/app/eval/compare/_components/EvalCompareView/{EvalCompareView.tsx,index.ts,helpers.ts,styles.ts,EvalCompareView.test.tsx,helpers.test.ts}`
Change:
- A thin page reads `a` and `b` with `useSearchParams` and renders `EvalCompareView` inside `AppShell`. The crumbs are Skills Lab › Eval Dashboard › agent.
- The view shows:
  - delta cards for recall, precision and citation (pp) and cost (signed USD);
  - a run header per side: start time, version, model, skills with name and version, has-errors mark;
  - the changed / added / removed lists;
  - the prompt diff as `+` / `−` / ` ` lines in a `<pre>` of text nodes, or the "unchanged" or "unavailable" text;
  - the skill difference.
Test:
- `helpers.test.ts`: the sign and marker per diff op.
- `EvalCompareView.test.tsx`:
  - the hook is called with `a` and `b` from the URL (AC-24, reload);
  - deltas read "+12 pp", "−5 pp" and "n/a", and the cost delta is "n/a" when unknown (AC-25, NFR-10);
  - a changed case shows name, type, location and both statuses; the added and removed sections are present (AC-26);
  - `changed` → added and removed lines; `unchanged` → its text; `unavailable` → its text naming the version (AC-27, EC-21, EC-22);
  - a prompt line `<script>alert(1)</script>` renders as text with no `script` element (NFR-8);
  - the per-run headers and the only-earlier / only-later skill lists render (AC-28);
  - loading, error with retry, and a missing `a` or `b` → error copy (NFR-14).
Verify: in `client/`, `pnpm typecheck && pnpm test && pnpm build`
Skills: frontend-architecture, next-best-practices, react-testing-library
Depends on: T-C2, T-C3
Risks: verify `pnpm build` accepts `useSearchParams` in a client page without a Suspense boundary (precedent `agents/[id]/page.tsx:20`). If not, wrap the view in `<Suspense>`.

### T-C8 — Eval Dashboard and its navigation entry
AC: AC-29, AC-30, AC-38
Files: `client/src/vendor/ui/nav.ts`, `client/src/vendor/ui/nav.test.ts`, `client/src/app/eval/page.tsx`, `client/src/app/eval/_components/EvalDashboardView/{EvalDashboardView.tsx,index.ts,styles.ts,EvalDashboardView.test.tsx}`
Change:
- SKILLS LAB gets `{ key: "eval", label: "Eval Dashboard", icon: <IconName>, href: "/eval" }` after `conventions`, with no `gKey`. The palette label `nav.eval` already exists (`messages/en/shell.json:24`).
- The view shows an agents table (name, case count, latest version, metrics, N/M or "never run"; a click opens `/agents/<id>?tab=evals`) and "Recent runs" as `EvalRunTable showAgent`.
Test:
- `nav.test.ts`: SKILLS LAB holds `eval` with href `/eval` and label "Eval Dashboard" (AC-29).
- `EvalDashboardView.test.tsx`:
  - a disabled agent's row is listed;
  - "never run" shows for an agent without a completed run;
  - a row click pushes `/agents/a1?tab=evals` (AC-29, EC-25);
  - recent runs show the agent name, start time, status, version, metrics, N/M and cost, in the given order (AC-30);
  - only the dashboard payload is rendered (AC-38);
  - empty, loading and error-with-retry states (NFR-14).
Verify: in `client/`, `pnpm typecheck && pnpm test`
manual: on a running stack, "Eval Dashboard" appears under SKILLS LAB and is highlighted on `/eval`.
Skills: frontend-architecture, react-testing-library
Depends on: T-C2, T-C3
Risks: verify that `nav.test.ts` exists. If it does not, create it beside `nav.ts`.

## Final verification

### T-V1 — Demo v1 / v2 / v3 on real runs, and the final gate
AC: AC-40, AC-41, AC-43, AC-44
Who: the **user** labels findings and pays for the runs. The **coordinator / plan-verifier** observes and records.
Steps:
1. In `server/`, run `pnpm db:migrate`, then start `./scripts/dev.sh`.
2. Prerequisite (NG10): the user accepts and dismisses findings on PRs with a patch, then turns them into cases until the demo agent has ≥ 8 cases of both types. **AC-41 observed:** the Evals tab shows ≥ 8 cases, at least one `must_find` and one `must_not_flag`.
3. Run v1, then edit the prompt to target a missed `must_find` (v2) and run. Compare v1 ↔ v2. **AC-43 observed:** a positive recall delta and the prompt diff. Take a screenshot.
4. Set the prompt to "flag every style remark, unused import and name as WARNING" (v3) and run. Compare v2 ↔ v3. **AC-44 observed:** a negative precision delta, with `must_not_flag` cases going from passed to failed.
5. Restore v2's text (this creates a new version).
6. In `server/`, run `pnpm verify:l06` on the final commit → exit 0 (**AC-40**).

Record the observations and screenshots in `docs/hw6/` (the coordinator names the file).
Cost: each run makes N model calls for N cases. Opening pages, scoring and Compare make none.
Depends on: every task

## Traceability (coverage matrix)

| AC | task(s) | test (file › case) |
|---|---|---|
| AC-1 | T-C4 | `EvalCaseButton.test.tsx` › disabled with hint while undecided, enabled when accepted or dismissed; `FindingCard.test.tsx` › extra action beside Accept/Dismiss; `FindingsPanel.test.tsx` › every card has the control; manual: expanded card |
| AC-2 | T-S5, T-S8, T-C2, T-C4 | `cases.test.ts` › accepted → must_find, dismissed → must_not_flag, expectation, name, source; `eval.it.test.ts` › 201 both types; `evals.test.ts` › POST + invalidation; `EvalCaseButton.test.tsx` › toast links to `?tab=evals` |
| AC-3 | T-S5, T-S8 | `cases.test.ts` › frozen diff of every hunk, PR number/title/description, no author; `eval.it.test.ts` › case byte-equal after re-sync, new head, review delete, flipped decision |
| AC-4 | T-S2, T-S5, T-S8, T-C4 | `eval.it.test.ts` › unique index; concurrent POSTs → one 201 + one 200, one row; `cases.test.ts` › existing returned, no insert; `EvalCaseButton.test.tsx` › `created:false` same confirmation |
| AC-5 | T-S5, T-S8, T-C4 | `cases.test.ts` › each refusal code, nothing stored (EC-1, EC-5, EC-6); `eval.it.test.ts` › 422 codes, table unchanged; `EvalCaseButton.test.tsx` › reason text per code |
| AC-45 | T-S4, T-S5, T-S8, T-C4 | `helpers.test.ts` › `zonesIntersect`; `cases.test.ts` › conflict both directions, same type allowed; `eval.it.test.ts` › 409 naming the case (EC-26); `EvalCaseButton.test.tsx` › message names the case |
| AC-6 | T-S7, T-C5 | `service.test.ts` › `latest_status` from the latest completed run, `never_run`; `AgentEditor.test.tsx` › four tabs, `tab="evals"`; `EvalsTab.test.tsx` › row columns |
| AC-7 | T-S7, T-S8, T-C2, T-C5 | `service.test.ts` › scoped delete touches no run; `eval.it.test.ts` › case gone, earlier run unchanged; `evals.test.ts` › DELETE, rejection keeps cache; `EvalsTab.test.tsx` › ConfirmDialog confirm / cancel / failure |
| AC-8 | T-S6, T-C2, T-C5 | `service.test.ts` › empty set 422; `evals.test.ts` › POST run; `EvalsTab.test.tsx` › "Run eval (3)", disabled rules |
| AC-9 | T-S6, T-S9, T-C2 | `run-executor.test.ts` › config and cases read once (EC-10, EC-15); `service.test.ts` › `running` before any call; `eval-runs.it.test.ts` › 202 running, then completed; `evals.test.ts` › running run in cache |
| AC-10 | T-S4, T-S6 | `task-line.test.ts` › no author; `run-executor.test.ts` › no intent, skeleton, callers, project context, expectation or author in messages |
| AC-11 | T-S6, T-S10 | `run-executor.test.ts` › messages equal `assemblePrompt` output; off-hunk finding dropped by the gate; T-S10 › reviewer-core diff empty |
| AC-12 | T-S6, T-S9 | `run-executor.test.ts` › two runs, identical messages; `eval-runs.it.test.ts` › same messages after PR, patch, intent and context changes |
| AC-13 | T-S2, T-S6, T-S9, T-C5 | `eval.it.test.ts` › partial unique index; `service.test.ts` › 409, executor not started; `eval-runs.it.test.ts` › concurrent POSTs, one 202 + one 409; `EvalsTab.test.tsx` › button disabled while running |
| AC-14 | T-S6 | `run-executor.test.ts` › throwing case → error with reason, next case evaluated, `has_errors` |
| AC-15 | T-S6, T-S8, T-S9, T-C5 | `run-executor.test.ts` › `llm()` rejects → failed, zero calls; `eval-runs.it.test.ts` › boot reaps → "interrupted", new run starts; `EvalsTab.test.tsx` › reason in the status line |
| AC-16 | T-S6, T-S9 | `service.test.ts` › disabled agent starts; `eval-runs.it.test.ts` › disabled agent completes |
| AC-17 | T-S3 | `scoring.test.ts` › `countMatches` rules (file, overlap, reversed range, title ignored, own case only) |
| AC-18 | T-S3, T-C3 | `scoring.test.ts` › three formulas, n/a, error excluded (EC-12–14); `EvalMetrics.test.tsx` › "n/a", never "0%" |
| AC-19 | T-S3, T-C3 | `scoring.test.ts` › status table, N/M with error in M; `EvalMetrics/helpers.test.ts` › `formatPassed` |
| AC-20 | T-S2, T-S6 | `eval.it.test.ts` › run columns; `run-executor.test.ts` › stored record and per-case fields (EC-11) |
| AC-21 | T-S7, T-C3, T-C5, T-C6 | `service.test.ts` › runs newest first; `EvalRunTable.test.tsx` › columns; `EvalsTab.test.tsx` › metrics of the latest completed run, status line, history |
| AC-22 | T-S3, T-S6, T-S7, T-C3, T-C6 | `scoring.test.ts` › `runCost` sum or null; `run-executor.test.ts` › unpriced → null; `helpers.test.ts` › cost delta null; `EvalRunTable.test.tsx` › "—", never "$0.00" |
| AC-23 | T-S2, T-S8 | `eval.it.test.ts` › FK cascade; `DELETE /agents/:id` removes cases and runs |
| AC-24 | T-S7, T-C3, T-C6, T-C7 | `service.test.ts` › 422 unless two completed runs of one agent; `EvalsTab.test.tsx` › two selected → URL with both ids; `EvalCompareView.test.tsx` › ids read from URL |
| AC-25 | T-S7, T-S9, T-C7 | `helpers.test.ts` › later − earlier, n/a; `eval-runs.it.test.ts` › compare deltas; `EvalCompareView.test.tsx` › pp and cost formats |
| AC-26 | T-S7, T-C7 | `helpers.test.ts` › changed / added / removed by case id; `EvalCompareView.test.tsx` › lists render |
| AC-27 | T-S7, T-C7 | `helpers.test.ts` › `diffLines`, prompt status (EC-21, EC-22); `EvalCompareView.test.tsx` › diff, "unchanged", "unavailable", inert text |
| AC-28 | T-S7, T-C7 | `helpers.test.ts` › skill set difference (EC-11); `EvalCompareView.test.tsx` › run headers + skill lists |
| AC-29 | T-S7, T-S9, T-C8 | `service.test.ts` › agents with cases, disabled included; `eval-runs.it.test.ts` › dashboard row; `nav.test.ts` › SKILLS LAB `eval`; `EvalDashboardView.test.tsx` › rows, "never run", click → Evals tab; manual: sidebar entry |
| AC-30 | T-S7, T-S9, T-C3, T-C8 | `service.test.ts` › ≤10 newest across agents; `eval-runs.it.test.ts` › order; `EvalDashboardView.test.tsx` › recent runs with agent name |
| AC-31 | T-S1, T-C1, T-S8 | `eval-contracts.test.ts` › shapes (`null` ≠ number), region parity, divergence ≤ baseline; `eval.it.test.ts` › bodies parse |
| AC-32 | T-S5, T-S6, T-S7, T-S8 | `cases.test.ts` / `service.test.ts` › `NotFoundError` for other workspace; `eval.it.test.ts` › every route 404, nothing changed |
| AC-33 | T-S6 | `run-executor.test.ts` › diff, title, description each in its own untrusted block; `INJECTION_GUARD` in system |
| AC-34 | T-S6, T-S9 | `run-executor.test.ts` › 3 cases → 3 calls; `eval-runs.it.test.ts` › 3 calls end to end |
| AC-35 | T-S3 | `scoring.test.ts` › type-only imports; 100-case scoring leaves `calls` empty |
| AC-36 | T-S5, T-S8, T-C2, T-C5 | `cases.test.ts` › `llm` never called; `eval.it.test.ts` › reads and case create/delete → 0 calls, no run; `evals.test.ts` › read hooks issue GET only; `EvalsTab.test.tsx` › no mutation on mount |
| AC-37 | T-S10 | `eval-boundary.test.ts` › no feature file names `evals/`; manual (plan-verifier): `grep -rnE "modules/eval\|eval_cases\|eval_runs\|/evals/(runs\|compare\|dashboard)" evals/` empty |
| AC-38 | T-S7, T-C2, T-C8 | `service.test.ts` › dashboard reads only eval tables; `evals.test.ts` › only eval endpoints; `EvalDashboardView.test.tsx` › renders the payload only; manual: no harness eval names on the three pages |
| AC-39 | T-S10 | `pnpm verify:l06` runs the four suites; with Docker unreachable the integration suites skip (exit 0); no API keys set |
| AC-40 | T-S10, T-V1 | `pnpm verify:l06` exit 0 on the final commit |
| AC-41 | T-V1 | observed on real data by the user and the coordinator: ≥ 8 cases, both types (not automated) |
| AC-42 | T-S9 | `eval-runs.it.test.ts` › prompt-dependent stub: v1→v2 recall delta > 0 + prompt diff; v2→v3 precision delta < 0, B passed → failed |
| AC-43 | T-V1 (twin: AC-42) | observed on real runs: Compare v1 ↔ v2 shows a positive recall delta and the prompt diff; screenshot |
| AC-44 | T-V1 (twin: AC-42) | observed on real runs: Compare v2 ↔ v3 shows a negative precision delta, `must_not_flag` passed → failed |

## Skills for the implementer

| skill | task(s) | why |
|---|---|---|
| onion-architecture | T-S4–T-S8 | route → service → repository; other modules only through `container.agentsRepo` / `reviewRepo`; `_shared` for the task line |
| fastify-best-practices | T-S8, T-S9 | zod params, querystring and response schemas; 202 / 409 / 422 envelope |
| drizzle-orm-patterns | T-S2, T-S5, T-S7, T-S9 | columns, partial unique index, `FOR UPDATE` transaction, `onConflictDoNothing`, `db:generate` |
| postgresql-table-design | T-S2 | nullable additive columns, FK cascades, index choice |
| zod | T-S1, T-C1 | nullable metrics, region-local shapes (never `safeParse(req.body)`, server INSIGHTS 2026-10-14) |
| typescript-expert | T-S1, T-S3, T-S4, T-S6 | pure typed scoring, reuse of engine types |
| security | T-S5, T-S6, T-S8 | untrusted blocks, no text in logs, workspace scoping, fixed error messages |
| frontend-architecture | T-C2–T-C8 | `components/eval/` vs route `_components`, fixed internals, i18n, showcase |
| react-best-practices | T-C3, T-C5, T-C6 | derived state (no effect-synced selection), polling via query options |
| next-best-practices | T-C5, T-C7 | `?tab=` and `useSearchParams` client pages |
| react-testing-library | T-C2–T-C8 | hook and component tests, queries by role and copy |
| engineering-insights | any | record a non-obvious finding (for example drizzle partial-index output) |

## Risks

| risk | where (file:line) | mitigation |
|---|---|---|
| Migration corrupts history or prompts interactively | root `CLAUDE.md` Do not touch; `server/src/db/migrations/**`; server INSIGHTS 2026-09-22 | Additive change only (D-1). The only non-add statement is `case_id DROP NOT NULL`. Use `pnpm db:generate`, the grep check, and commit unchanged. Never edit `0000`–`0013`, the journal or the snapshots. |
| Migrations are not applied on boot | `server/AGENTS.md` Gotchas | Run `pnpm db:migrate` after pulling the branch. State it in T-V1 and in the report. |
| Partial unique index not emitted by drizzle-kit 0.30 | `server/src/db/schema/eval.ts` | T-S2 checks the `WHERE` in the SQL. Fallback: an agent-row `FOR UPDATE` lock in `insertRunning`. |
| Parity test red between T-S1 and T-C1 | `server/test/eval-contracts.test.ts` | Expected. T-S1 verifies `-t shapes` only. T-C1 turns parity green. T-S10 depends on T-C1. |
| Two `vendor/shared` copies diverge further | root `CLAUDE.md` Cross-package gotchas | Region equality + pinned divergence baseline (D-5); no new contract file. |
| Reviews' prompt changes through the task-line refactor | `server/src/modules/reviews/helpers.ts:92-102` | Byte-equality test against the literal (T-S4); `test/prompt-callers.test.ts` stays green. |
| reviewer-core must stay unchanged | NG8; `reviewer-core/CLAUDE.md` Invariants | Use exports only (`reviewPullRequest`, `groundFindings`, `assemblePrompt`, `INJECTION_GUARD`, `index.ts:15-57`). T-S10 checks that the diff is empty. |
| Cross-module imports | onion-architecture rule 10 | Reads go through `container.agentsRepo` / `reviewRepo`; the task line lives in `_shared`. `parseUnifiedDiff` is a pure adapter helper (precedent `reviews/diff-loader.ts:3`). |
| Boot reap marks another test's run failed | `server/src/app.ts:97-102` | The interrupted test is sequential; each it file uses its own container (`startPg`). |
| `verify:l06` makes a network pull of the Postgres image | `server/test/helpers/pg.ts:35-40` | Pre-pull `pgvector/pgvector:pg16`. T-S10 notes it, and the plan-verifier confirms. |
| A model call hangs a case | provider adapters (verify) | AC-14 covers errors and timeouts the provider raises. A missing provider timeout is reported, not patched with a race (a raced call keeps billing). |
| Cost of the demo | NFR-1 | N calls per run only. A run is user-triggered (NG5). No "run all" and no auto-run. |
| `MockLLMProvider` returns one fixture regardless of the prompt | `server/src/adapters/mocks.ts:95-111` | T-S6 and T-S9 subclass it with per-call or prompt-dependent fixtures; the mock itself is unchanged. |
| A gallery component owning a mutation crashes the smoke test | client INSIGHTS 2026-09-22; `Showcase.tsx:433` | `FindingCard` stays presentational (`extraAction`); only `EvalMetrics` and `EvalRunTable` join the gallery. |
| `role="alert"` and duplicate-name assertions | client INSIGHTS 2026-09-22 | Assert on copy; give "Run eval (N)" and any empty-state CTA distinct labels. |
| Stale i18n in `next dev` | client INSIGHTS 2026-09-20 (`src/i18n/request.ts:20`) | Hard reload or restart during T-V1. |
| The agent editor test asserts no Evals tab | `AgentEditor.test.tsx:84` | T-C5 replaces that case. `SkillDetailView/constants.ts:12` stays (NG4). |
| A disabled control hides the actions of an undecided card | `FindingCard.tsx:77-113` | The control sits in the expanded actions row like Accept and Dismiss. |
| Line-based matching limit | NFR-16 | Accepted by the spec. AC-45 keeps opposite types off the same lines. |
| Solutions may sit in git history | root INSIGHTS 2026-09-20 (`git log -S`) | Implementers may look, but the spec and this plan win. Nothing is restored blindly. |
| Lock files and AGENTS.md budget | root `CLAUDE.md` | No dependency is added; no AGENTS.md edit is planned. |

## Out of scope

- A per-run detail endpoint (`GET /evals/runs/:id`). Compare and the overview carry what the UI needs.
- Parallel case execution inside a run (sequential keeps cost and rate limits predictable).
- Doc updates: the API map in `server/README.md`, `client/specs/pages.md`, `client/README.md`. They have no AC and are a follow-up.
- A `g` shortcut for the Eval Dashboard.
- Removing the unused `EvalCaseInput` / `EvalRunResult` shapes and the `caseEditor` strings (NG2).
- Setting SPEC-03 to `implemented`. The user does that after the plan-verifier matrix.

## Cross-model review (2026-10-15)

`openai/gpt-5.6-terra` via OpenRouter reviewed this plan against the spec and AGENTS.md
([docs/hw6/cross-model-review.md](../../docs/hw6/cross-model-review.md)). Accepted into this plan:
F-1 (ordered skill difference), F-3 (three sessions per group with hard hand-offs), F-4 (repository
layout), F-6 (forged-delimiter test), F-7 (retry-exhaustion and timeout tests), F-8 (`evals/`-side
boundary test), F-9 (log assertion at the default level). Partly accepted: F-2 (suite mapping made
explicit; the boundary test stays out of `verify:l06`). Not accepted: F-5 (the sidebar takes literal
labels from `vendor/ui/nav.ts` for every entry; the command palette already resolves `nav.eval`).
