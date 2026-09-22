# Review Flow

**Status:** implemented · **Package:** server (+ reviewer-core) · **Date:** 2026-09-20

The behaviour contract of a review cycle: from the HTTP call that starts it to the persisted
findings, the run row and the trace document. Unlike the other specs here, this one is written
*after* the code — it pins down what the current implementation guarantees so a change that breaks
one of these statements is recognisable as a behaviour change, not a refactor.

Every item below is an invariant with the code that makes it true. Layer boundaries and DI are in
[docs/architecture.md](../docs/architecture.md).

## Surface

| Method | Path | Handler | Purpose |
|---|---|---|---|
| POST | `/pulls/:id/review` | `src/modules/reviews/routes.ts:27-44` | start one run per target agent |
| GET | `/runs/:id/events` | `:48-92` | SSE live log for one run |
| GET | `/pulls/:id/runs/active` | `:95-98` | in-flight runs for a PR |
| GET | `/pulls/:id/runs` | `:101-104` | full run history for a PR |
| POST | `/runs/:id/cancel` | `:114-118` | request cancellation |
| DELETE | `/runs/:id` | `:107-111` | delete a run, its trace and its review |
| GET | `/runs/:id/trace` | `:121-126` | the single-document `RunTrace` |
| GET | `/pulls/:id/reviews` | `:129-132` | persisted reviews + findings |
| DELETE | `/reviews/:id` | `:135-140` | delete one review + its findings |
| POST | `/findings/:id/accept` · `/dismiss` | `:143-149` | finding actions |

The engine itself is `reviewPullRequest` from `@devdigest/reviewer-core`
(`reviewer-core/src/review/run.ts:123`). The server owns I/O; reviewer-core owns prompt assembly,
the LLM call, the reduce and the grounding gate.

## 1. Request and validation

**R1.** The trigger is `POST /pulls/:id/review`. `:id` is the **pull request** id (a `uuid`),
validated by `IdParams` (`src/modules/_shared/schemas.ts:11`) declared as the route's `params`
schema — a non-uuid is a `422 validation_error` before the handler runs.

**R2.** The body is optional and parsed **inside** the handler:
`const body = RunRequest.parse(req.body ?? {})` (`src/modules/reviews/routes.ts:32`). This is the
documented exception to "validate via route zod schemas" (server/CLAUDE.md) and the comment at
`:26` states why: both fields are optional and an empty body is valid. A body that is present but
malformed (e.g. `{"agentId": 42}`) throws a `ZodError`, which the shape-matching branch of the
error handler turns into `422` (`src/app.ts:138-152`).

**R3.** `RunRequest` is `{ agentId?: string, all?: boolean }`
(`src/vendor/shared/contracts/platform.ts:262-265`). Unknown keys are stripped, not rejected.

**R4.** Target resolution happens **before** the PR is looked up
(`src/modules/reviews/routes.ts:33-36` → `service.resolveTargets`,
`src/modules/reviews/service.ts:46-57`), so these rejections fire regardless of whether the PR
exists:

| Input | Result |
|---|---|
| `all: true` | every **enabled** agent in the workspace (`src/modules/agents/repository.ts:58-63`); `agentId` is ignored |
| `agentId` only | that agent, or `404 not_found` "Agent not found" if it is not in this workspace |
| neither | `400 invalid_run_request` "Provide agentId or all:true" |

**R5.** `all: true` with zero enabled agents is **not** an error: the response is `200` with
`runs: []`. The background executor still runs and still loads the diff with an empty job list
(`src/modules/reviews/run-executor.ts:55-106`); the per-agent loop simply never executes.

**R6.** After targets resolve, a PR that does not exist in the workspace is `404` "Pull request not
found" and a PR whose repo row is missing is `404` "Repo not found"
(`src/modules/reviews/service.ts:109-112`).

**R7.** The route is rate-limited to **10 requests per minute**
(`src/modules/reviews/routes.ts:29`), on top of the global 120/min. Both are disabled under
`NODE_ENV=test` (`src/app.ts:95-97`).

**R8.** The response is `{ pr_id, runs, reviews }` where each run is
`{ run_id, agent_id, agent_name }` and **`reviews` is always `[]`**
(`src/modules/reviews/service.ts:137`). The run is not awaited, so no review exists yet. The
`ReviewRunResponse` contract (`src/vendor/shared/contracts/review-api.ts:56-61`) describes the same
shape, but the route declares no `response` schema, so nothing enforces it at runtime — and the
contract's doc comment at `:44-47` ("the persisted reviews are also returned once the
(synchronous) run completes") no longer matches the code.

## 2. Orchestration

**O1.** One `agent_runs` row per target agent is created **synchronously, before the response**
(`src/modules/reviews/service.ts:119-129`), so `run_id` is available to the client immediately and
the SSE stream can be subscribed before any work happens.

**O2.** Execution is fire-and-forget: `void this.executor.executeRuns(...).catch(...)`
(`src/modules/reviews/service.ts:133-135`). It does **not** go through `JobRunner` — no `jobs` row,
no queue, no timeout, no retry, and no limit on how many reviews run at once. A crash in the
background chain is logged and nothing else.

**O3.** The diff is loaded **once for all target agents**, before the per-agent loop
(`src/modules/reviews/run-executor.ts:96-106`), through a `RunLogger` that fans out to every queued
run id (`:65-70`), so the shared pre-work appears in every agent's live log and in every agent's
persisted trace.

**O4.** Diff resolution prefers a real `git diff base...headSha` through the `GitClient` adapter and
falls back to reconstructing a unified diff from the persisted `pr_files.patch` rows when the git
call throws **or returns zero files** (`src/modules/reviews/diff-loader.ts:19-29`). A diff with no
files is not an error and does not stop the run.

**O5.** Agents run **sequentially**, in the order `resolveTargets` returned them
(`src/modules/reviews/run-executor.ts:108`). A failure in one agent never aborts the others:
`runOneAgent` persists its own failure and rethrows, and the loop only logs
(`:126-134`).

**O6.** Per agent, the provider is resolved from the container at run time
(`src/modules/reviews/run-executor.ts:159-163`), so a missing API key is a failed **run**, not a
failed request — see F3.

**O7.** The engine call passes: the agent's `systemPrompt` and `model`, the shared `diff`, the
resolved `llm`, `strategy` (`agent.strategy ?? REVIEW_STRATEGY`, the module default being
`'single-pass'` — `src/modules/reviews/constants.ts:12`), the optional context of C1–C3, the task
line, a `sessionId` of `owner/name#number:agentName`, an `onEvent` sink and a `checkCancelled`
callback (`src/modules/reviews/run-executor.ts:191-213`).

**O8.** The server never talks to an LLM directly in this flow. The only model call is
`llm.completeStructured({ schema: Review, schemaName: 'Review' })` inside reviewer-core
(`reviewer-core/src/review/run.ts:174-181`), once per chunk — and under `single-pass` there is
exactly one chunk (`reviewer-core/src/review/run.ts:144-147`).

**O9.** The grounding gate is mandatory and lives in reviewer-core: findings whose line range does
not intersect a real hunk of the same file are dropped, and the score is recomputed from the
survivors with `scoreFromFindings`, discarding the model's self-reported score
(`reviewer-core/src/review/run.ts:196-209`). The server persists only what came back kept.

## 3. Context assembly

**C1.** All three enrichments are gated twice — per agent by `agents.repo_intel`
(`src/db/schema/agents.ts:31`, read at `src/modules/reviews/run-executor.ts:169`) and globally by
`config.repoIntelEnabled`, which the facade checks inside each method
(`src/modules/repo-intel/service.ts:406`, `:419`, `:458`). When the agent opts out, the facade is
not called at all and the prompt is byte-identical to the repo-intel-off baseline.

| Slot | Source | Omitted when |
|---|---|---|
| callers digest | `repoIntel.getCallerSignatures(repoId, changedFiles, 10)` — `run-executor.ts:331-361` | no changed files, facade throws, or zero rows |
| repo skeleton | `repoIntel.getRepoMap(repoId)` — `:368-381` | result is `degraded` or blank |
| rank note | `repoIntel.getFileRank(repoId, changedFiles)` — `:388-405` | no rank rows, or no changed file at percentile ≥ 95 |

**C2.** Every enrichment is best-effort: each is wrapped so a thrown error becomes an `info` line in
the live log and an omitted section, never a failed run
(`src/modules/reviews/run-executor.ts:341-345`, `:377-380`, `:402-404`).

**C3.** An **unindexed repo degrades silently to diff-only.** `getRepoMap` returns
`{ degraded: true, reason: 'no_data' }` when there is no index state, no `last_indexed_sha`, or no
cache row for that sha and budget (`src/modules/repo-intel/service.ts:409-414`), and the executor
then omits the section. The run is normal in every other respect.

**C4.** The user message is assembled by reviewer-core in a fixed order — task, PR description,
skills, memory, repo skeleton, project context, callers, diff — and each untrusted block is
delimiter-wrapped (`reviewer-core/src/prompt.ts:104-120`). The server supplies `prDescription` only
when `pull.body` is non-empty (`src/modules/reviews/run-executor.ts:206`).

**C5.** The system prompt is always the agent's prompt **plus** `INJECTION_GUARD`, appended by
`assemblePrompt` (`reviewer-core/src/prompt.ts:86`). The server does not scan untrusted text for
injection attempts; the task line carries the same rule in prose
(`src/modules/reviews/helpers.ts:90-99`).

**C6.** Skills, memory and specs are accepted by the engine but the server passes **none** of them
today (`src/modules/reviews/run-executor.ts:191-213` has no `skills` / `memory` / `specs`), so
`prompt_assembly.skills|memory|specs` is `null` in every trace this flow writes.

**C7.** `pr_intent` is not part of this flow. `upsertIntent` / `getIntent` exist on the repository
(`src/modules/reviews/repository.ts:132-138`) but have no caller in `src/`.

## 4. Run lifecycle

**L1.** The status vocabulary is exactly four strings: `running`, `done`, `failed`, `cancelled`.
`running` is written by `createAgentRun` (`src/modules/reviews/repository/run.repo.ts:135`); the
other three are the TS union on `completeAgentRun`
(`src/modules/reviews/repository/run.repo.ts:147`).

**L2.** The database does **not** enforce this. `agent_runs.status` is plain
`text('status')` with no enum and no default (`src/db/schema/runs.ts:23`); the only guard is the
TypeScript union. (`agent_runs.source` *is* enum-constrained, defaulting to `'local'` — `:26`.)

**L3.** Legal transitions:

| From | To | Writer | Guard |
|---|---|---|---|
| — | `running` | `createAgentRun`, called by `ReviewService.runReview` (`service.ts:120`) | insert |
| `running` | `done` | `completeAgentRun` on the success path (`run-executor.ts:244-255`) | **none** — matches on `id` only |
| `running` | `failed` | `completeAgentRun` in the per-agent catch (`run-executor.ts:300-311`) | none |
| `running` | `failed` | `failAll` after a pre-work failure (`run-executor.ts:75-94`) | none |
| `running` | `failed` | `reapStaleRunningRuns` at boot (`run.repo.ts:105-112`) | `status = 'running'` |
| `running` | `cancelled` | `cancelRunIfRunning` from `POST /runs/:id/cancel` (`service.ts:88`) | `status = 'running'` |
| `running` | `cancelled` | `completeAgentRun` when the engine threw `RunCancelledError` (`run-executor.ts:296-311`) | none |

**L4.** Because `completeAgentRun` carries no status guard, a run that is cancelled in the DB and
then finishes anyway is **overwritten back to `done`**. This is reachable: `checkCancelled` is only
invoked before each chunk's LLM call (`reviewer-core/src/review/run.ts:164`), so under the default
`single-pass` strategy cancellation can only take effect before the one call starts.

**L5.** A terminal write always sets the whole result set — `durationMs`, `tokensIn`, `tokensOut`,
`costUsd`, `findingsCount`, `grounding`, `score`, `blockers`, `error` — and `score` / `blockers`
default to `null` when not passed (`src/modules/reviews/repository/run.repo.ts:161-175`). Failed
and cancelled runs therefore always carry `score = null`, `blockers = null`, `tokens = 0`,
`costUsd = null` and `grounding = '0/0 passed'`.

**L6.** `findings_count` is the count of findings that **survived grounding** and were persisted
(`findingRows.length`, `src/modules/reviews/run-executor.ts:250`), not the model's candidate count.

**L7.** `score` on the run row is the recomputed `outcome.review.score`
(`run-executor.ts:252`) and `blockers` is `countBlockers(keptFindings, agent.ciFailOn)`
(`:241`) — a deterministic severity count, not the model's verdict.

**L8.** `cost_usd` is null-poisoned end to end: reviewer-core turns the running sum to `null` the
moment any chunk reports no price (`reviewer-core/src/review/run.ts:184`), and the server persists
that value as-is.

**L9.** Boot reaps orphans. Any row still `running` when the process starts is flipped to `failed`,
awaited before the server listens (`src/app.ts:80-85`). This assumes one API instance per database
(`src/app.ts:78`).

**L10.** Cancellation is idempotent and works on orphans: it publishes an info event, sets the
in-memory cancel flag, conditionally updates the row and completes the bus
(`src/modules/reviews/service.ts:85-90`). For a run whose process died, the flag and the bus
completion do nothing useful but the DB row still moves to `cancelled`.

## 5. Live progress (SSE)

**S1.** The stream is `GET /runs/:id/events`, served by `fastify-sse-v2` (registered at
`src/app.ts:91`) via `reply.sse(asyncGenerator)` (`src/modules/reviews/routes.ts:55-91`). It is
exempt from rate limiting (`:50`).

**S2.** Each frame is `{ id: String(event.seq), event: event.kind, data: JSON.stringify(event) }`
(`src/modules/reviews/routes.ts:80-84`). The SSE **event name is the run-event kind** — one of
`info`, `tool`, `result`, `error` (`src/vendor/shared/contracts/trace.ts:9`). There are no other
event names.

**S3.** The `data` payload is a `RunEvent`: `{ runId, seq, kind, msg, t, data? }`
(`src/vendor/shared/contracts/trace.ts:21-28`). `seq` is per-run and monotonic from 1
(`src/platform/sse.ts:53-56`); `t` is local wall-clock `HH:MM:SS` (`src/platform/sse.ts:15-17`).

**S4.** Subscription is **replay-first**: `subscribe` synchronously replays the run's entire
buffered history to the new listener before attaching it to the emitter
(`src/platform/sse.ts:63-68`). A client that connects late, or reconnects, receives the whole log
from `seq = 1` again — there is no `Last-Event-ID` handling.

**S5.** The stream ends when `RunBus.complete(runId)` fires, which happens exactly once per run on
every path: success (`run-executor.ts:290`), failure or cancel (`:315`), pre-work failure
(`:92`), and explicit cancel (`service.ts:89`). The generator's `finally` unsubscribes both
listeners (`src/modules/reviews/routes.ts:86-89`).

**S6.** A subscriber arriving **after** completion still terminates: `onDone` sees the run in the
`completed` set and fires via `queueMicrotask`, so the client gets the full replay and then the
close (`src/platform/sse.ts:90-100`).

**S7.** There is no terminal "done" event and no distinct error frame. The last thing a client sees
is an ordinary event — `Run complete; trace persisted` on success
(`run-executor.ts:288`) or an `error`-kind event carrying the failure message
(`:299`, `:102`) — followed by the stream closing. Clients must treat closure as the completion
signal.

**S8.** Buffers are never freed. `complete()` deletes the emitter but keeps the event buffer, the
sequence counter and the `completed` marker (`src/platform/sse.ts:76-83`), so a long-lived process
accumulates every run's full event list in memory. The `cancelled` marker *is* cleared there.

**S9.** The bus is a process-level singleton (`src/platform/sse.ts:103`, assigned at
`src/platform/container.ts:85`), so live progress does not survive a restart and is not shared
between API instances. What survives is the persisted trace (P5).

**S10.** `/runs/:id/events` resolves tenancy but does **not** check that the run belongs to the
caller's workspace (`src/modules/reviews/routes.ts:52`). The same holds for `/runs/:id/trace`
(`:122`) and `POST /runs/:id/cancel` (`:115`, and `cancelRunIfRunning` matches on id alone).
`DELETE /runs/:id` is the workspace-scoped one (`run.repo.ts:83-89`).

## 6. Persistence

**P1.** Nothing in this flow is transactional. `db.transaction(` appears nowhere in `server/src`;
every statement below commits on its own.

**P2.** Success path order (`src/modules/reviews/run-executor.ts`):

| # | Table | Call | Line |
|---|---|---|---|
| 1 | `reviews` | `insertReview` — one row, `kind: 'review'`, carrying `runId`, verdict, summary, score, model | `:219-229` |
| 2 | `findings` | `insertFindings` — **one multi-row INSERT** for all kept findings; returns early for an empty array | `:230` |
| 3 | `pull_requests` | `markReviewed(pull.id, pull.headSha)` sets `last_reviewed_sha` | `:235` |
| 4 | `agent_runs` | `completeAgentRun(status: 'done', …)` | `:244-255` |
| 5 | `run_traces` | `saveRunTrace` — upsert keyed on `run_id` | `:289` |

Then `runBus.complete(runId)` (`:290`). Steps 1–5 are five independent commits: a crash between
them leaves a real, observable intermediate state (a review without a completed run; a completed
run without a trace).

**P3.** `reviews.run_id` has **no foreign key** (`src/db/schema/reviews.ts:19`). It is the only link
between a run and the review it produced, which is why `deleteAgentRun` deletes the review
explicitly before deleting the run (`src/modules/reviews/repository/run.repo.ts:78-91`, two
statements, also not atomic) and why `reviewsForPull` uses a `leftJoin`
(`review.repo.ts:71-76`).

**P4.** `findings` cascade from `reviews` (`src/db/schema/reviews.ts:30-32`) and `run_traces`
cascades from `agent_runs` (`src/db/schema/runs.ts:36-40`). `DELETE /reviews/:id` relies on the
first; `DELETE /runs/:id` on the second.

**P5.** Exactly one trace document is written per run, always as an upsert
(`onConflictDoUpdate` on `run_traces.run_id`, `run.repo.ts:179-184`), so a re-write is safe. Its
`log` array is the run's **full** event buffer including the shared pre-work
(`run-executor.ts:286`, `:434`), which is what makes the live log survive a page reload.

**P6.** The trace's `stats` mirror the run row (`duration_ms`, `tokens_in`, `tokens_out`,
`cost_usd`, `findings`, `grounding` — `run-executor.ts:266-273`) and its `tool_calls` are
synthesised from the engine's chunk labels with the duration divided evenly across them
(`:275-280`) — they are not measured per call.

**P7.** No `jobs` row is written for a review (O2), and nothing in this flow writes `pr_intent`,
`memory`, `pr_brief` or any eval/CI table.

## 7. Failure modes the code handles

**F1. Diff load failure → every queued run fails.** If `loadDiff` throws (both the git path and the
`pr_files` reconstruction failed), an `error` event is emitted on the fanned-out logger and
`failAll` marks **each** queued run `failed` with `durationMs: 0` and the message
`Failed to load PR diff: …`, persists a buffer-only trace, and completes each bus
(`src/modules/reviews/run-executor.ts:75-105`). No LLM call is made.

**F2. Unindexed or repo-intel-off repo → diff-only review.** See C1–C3. Degradation is silent by
design; the only trace is the absence of the prompt sections.

**F3. Missing provider key → that run fails.** `container.llm(provider)` throws `ConfigError`
(`src/platform/container.ts:174-192`); it is raised inside `runOneAgent`'s `try`, so the run is
persisted `failed` with the config message as `error` and the other agents continue.

**F4. LLM error → that run fails.** Adapter-level retry/timeout is applied first
(`withRetry` / `withTimeout` in `src/adapters/llm/openai.ts:10` and
`src/adapters/llm/anthropic.ts:11`) and reviewer-core reprompts on schema-invalid output up to
`DEFAULT_REVIEW_MAX_RETRIES` (`reviewer-core/src/review/run.ts:32`, `:179`). What escapes lands in
the per-agent catch: status `failed`, the error text persisted on the row and in the trace
(`run-executor.ts:293-317`).

**F5. Persisting a failure is itself best-effort.** Both writes in the catch block are
`.catch(() => undefined)` (`run-executor.ts:311`, `:314`), so a database problem during failure
handling leaves the row `running` until the next boot reaps it (L9).

**F6. Cancellation.** `RunCancelledError` (`run-executor.ts:13-18`) is thrown by the
`checkCancelled` callback and travels through the engine untouched — reviewer-core is agnostic
about the error type (`reviewer-core/src/review/run.ts:87-92`). The catch distinguishes it from a
failure by `instanceof`, writes status `cancelled` with the message `Cancelled by user`, and logs
at `info` rather than `error` (`run-executor.ts:296-299`, `:129-133`). See L4 for the window in
which a cancel is ineffective.

**F7. Every finding hallucinated → a valid, empty review.** Grounding can drop all findings; the
review is still persisted, with a score recomputed from zero findings and
`grounding` reading `0/N passed`. Nothing fails.

**F8. Background crash outside a run.** Any rejection escaping `executeRuns` is caught by the
`.catch` at `src/modules/reviews/service.ts:133-135` and only logged — the HTTP call has long
returned.

## 8. Reading the result

**D1.** `GET /pulls/:id/runs` returns every `agent_runs` row for the PR, newest first, as
`RunSummary` — including failed runs with their `error` string, which is what makes failures
survive a reload (`src/modules/reviews/repository/run.repo.ts:40-69`).

**D2.** `GET /pulls/:id/runs/active` returns only `status = 'running'` rows and is the server-side
source of truth for "what is running now" (`run.repo.ts:10-37`).

**D3.** `GET /pulls/:id/reviews` returns reviews newest first with their findings and the
cost/token usage of the run behind each (left join, null when the run is gone), after checking the
PR is in the caller's workspace (`src/modules/reviews/service.ts:160-174`).

**D4.** `GET /runs/:id/trace` returns the stored document or `404 not_found` "Run trace not found"
(`src/modules/reviews/routes.ts:121-126`).

**D5.** `POST /findings/:id/accept|dismiss` sets one timestamp and clears the other, so the two
states are mutually exclusive (`src/modules/reviews/repository/review.repo.ts:134-158`), and
ownership is verified through review → PR → workspace (`src/modules/reviews/findings.ts:17-20`).
Only `accept` and `dismiss` exist; any other action is `400 invalid_action`
(`src/modules/reviews/findings.ts:31-32`).

## 9. Tests that pin this

- `test/reviews.it.test.ts` — the end-to-end path against a Testcontainers Postgres with
  `MockGitClient` + `MockLLMProvider`: the POST returns run ids, the background run is awaited via
  `waitForPrRuns`, and the persisted review shows grounding dropping the hallucinated finding and
  the score recomputed from the survivor.
- `test/helpers/runs.ts` — encodes R8/O2: tests must poll `agent_runs` until every row reaches
  `done` / `failed` / `cancelled` before asserting on persisted data.
- `test/grounding.test.ts`, `test/prompt-structured.test.ts`, `test/prompt-callers.test.ts` —
  the gate and the prompt slots.
- `test/repo-intel-facade-degraded.test.ts` — the degraded results C1–C3 depend on.
