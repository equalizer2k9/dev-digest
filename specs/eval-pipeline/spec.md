# Spec: Eval Pipeline for the review agent
Spec ID: SPEC-03
Status: approved
Supersedes: —

Source: [`docs/hw6/requirements.md`](../../docs/hw6/requirements.md), part 2 «ДЗ: Eval Pipeline для
рев'ю-агента». It covers the user stories, the accepted decisions R1–R17 (cited as `R-n`), the UI
table (`UI`), «Свідомо не робимо», the demo data and the homework criteria 1–5 (cited as `C-n`).

Packages touched: `server/`, `client/` and both copies of `@devdigest/shared`. `reviewer-core/` is
used unchanged (R5). The homework text names the file `specs/eval-pipeline.md`; this repository's
convention is a feature folder holding `spec.md` and `plan.md`.

Approved on 2026-10-15. The user answered the sixteen open questions of the draft and approved four
decisions: today's AC-15, AC-16 and AC-23, which were AC-32, AC-33, AC-34 and AC-51 in the draft.
The coordinator relayed both. The criteria were then compressed from 94 to 44 with no change of
behaviour (see "AC map").

Revised on 2026-10-15 by the user: no frozen-diff size limit, because reviews have none (OQ-16 is
now answered "as in reviews"); a run with any unpriced case shows its cost as "—" (OQ-6); new
AC-45 refuses a case whose zone conflicts with an opposite-type case; NFR-16 states the limit of
line-based matching.

## Problem and user

A workspace owner may edit a review agent's system prompt, switch its model or link a skill. Today
nothing tells them whether the agent now misses bugs it used to catch, or flags code the team has
already rejected. Their Accept and Dismiss decisions on real findings are a ground truth, but nothing
turns them into a repeatable test.

Users:

- **The workspace owner who authors review agents.** They want:
  - a fixed set of real cases per agent, built from their own decisions;
  - a run of the agent over that set, started on demand;
  - numbers that show whether a change helped or hurt, with two runs side by side.
- **The homework author.** They need:
  - `pnpm verify:l06` green;
  - a demo in which a prompt change visibly moves recall and precision;
  - a screenshot of two runs compared.

## Goals / Non-goals

- G1. An accepted or dismissed finding becomes an eval case of its agent in one click. The case holds
  a frozen input and one `must_find` or `must_not_flag` expectation.
- G2. The owner sees the agent's whole set of cases and can delete a case.
- G3. An eval run starts only on request and runs in the background. It uses the same engine and
  grounding gate as a pull-request review, and gives the model only the agent's configuration and
  each case's frozen input.
- G4. Recall, precision, citation accuracy and "N/M passed" are computed by code only. A metric with
  nothing to measure is "n/a".
- G5. The agent's run history, and Compare of exactly two runs. Compare shows metric and cost
  deltas, the cases whose status changed, the system-prompt diff and the skill difference.
- G6. An Eval Dashboard across the workspace's agents.
- G7. `pnpm verify:l06` checks the feature and is green. The Eval contracts are identical in both
  copies of `@devdigest/shared`.

Non-goals:

- NG1. An LLM judge, or any model call during scoring (R6).
- NG2. A manual case editor: no case is created or edited by hand (stretch). The unused `caseEditor`
  strings stay unused.
- NG3. A metric trend chart (stretch).
- NG4. Evals of skills (`owner_kind: skill`), and an Evals tab in the skill editor.
- NG5. Any automatic run, for example on saving a prompt, on a schedule or on opening a page. Also no
  "Run all agents".
- NG6. Export to CI. It is in the homework title only, and lab L07 builds it.
- NG7. A PreToolUse hook, and mutation testing (stretch).
- NG8. Any change to `reviewer-core/`, or to the prompts, findings and results of pull-request
  reviews (R5).
- NG9. Anything about the harness evals of the repo-root `evals/` package (AC-37, AC-38).
- NG10. Labelling findings, or running reviews to create data. That is a user prerequisite (see
  "Prerequisite").
- NG11. Controls the requirements' UI table does not list:
  - cancelling a running eval run;
  - deleting a run;
  - comparing more than two runs;
  - a per-case view of the model's findings.
- NG12. A browser e2e flow, and eval tools in `devdigest-mcp/`.
- NG13. Deduplication beyond R2's "one case per source finding". Two different findings with the
  same agent, type, file and range give two cases.

## User stories

- US-1. As a workspace owner, I want to turn a real finding into an eval case with one click: an
  accepted one into "must find X at file:line", a dismissed one into "must NOT flag Y". That way I
  do not have to invent scenarios.
- US-2. As a workspace owner, I want to see every case in my agent's set, so that I know what a run
  measures.
- US-3. As a workspace owner, I want to run the agent on all of its cases, so that I can measure it
  after a change.
- US-4. As a workspace owner, I want to see a run's recall, precision and citation accuracy, so that
  I know whether the agent misses bugs, makes noise or invents locations.
- US-5. As a workspace owner, I want the run history and a side-by-side comparison of two runs ("old
  prompt vs new"), so that I can see what a change did.
- US-6. As a workspace owner, I want one dashboard of every agent with cases and its latest results,
  so that I can spot a regression without opening each agent.
- US-7. As the homework author, I want one command that checks scoring, case creation, contract
  parity and workspace boundaries, so that I can show the feature is correct.

## Acceptance criteria (EARS)

### Definitions

- **Decision.** A finding is accepted or dismissed through the existing Accept and Dismiss actions.
  The two exclude each other, and the latest one wins.
- **Owner agent.** The agent whose review produced the finding.
- **File patch.** The stored diff text of the finding's file among the pull request's changed files,
  as it is when the case is created.
- **Zone.** The pull request, file and line range of a case's expectation. Two zones intersect when
  the pull request and file are the same and the line ranges share at least one line (as in AC-17).
- **Eval case.** It belongs to its owner agent. It holds a frozen input, one expectation, a reference
  to its source finding, and a name.
- **Frozen input.** The whole file patch, every hunk, as a one-file diff, plus the file path, the PR
  number, the PR title and the PR description. It never includes the PR author.
- **Expectation.**
  - Type: `must_find` from an accepted finding, `must_not_flag` from a dismissed one.
  - File, start line, end line and title: copied from the finding.
- **Set.** All the eval cases of one agent.
- **Agent configuration of a run.** The agent's system prompt, provider, model and version, plus its
  enabled linked skills, in order, each with name, version and body.
- **Findings of a case.**
  - Model findings: what the model returned for the case.
  - Kept findings: those that pass the engine's grounding gate.
  - Dropped findings: the rest.
- **Match.** Defined in AC-17.
- **Case status in a run.** `passed` or `failed` (AC-19), or `error` (AC-14).
- **Run status.** `running`, `completed` or `failed`.
- **"has errors".** The mark of a run with at least one `error` case.
- **n/a.** The value of a metric whose denominator is 0.

### Creating a case from a finding

- AC-1 (UI, R2, US-1). The system shall display a "Turn into eval case" control next to Accept and
  Dismiss on a finding card. The control is enabled only while the finding is accepted or
  dismissed.
- AC-2 (R1, R2, C-2). WHEN the user activates the control on a decided finding, the system shall
  create one eval case of the owner agent, with no further input. It shall then display a
  confirmation that links to that agent's Evals tab. The case has:
  - expectation type `must_find` for an accepted finding, or `must_not_flag` for a dismissed one;
  - the finding's file, start line, end line and title as its expectation;
  - the finding's title as its name;
  - a reference to the finding as its source.
- AC-3 (R1). The system shall store the frozen input in the case at creation. The frozen input and
  the expectation never change afterwards, even when:
  - the source pull request is re-synced or gets a new head;
  - its reviews are re-run or deleted;
  - the source finding gets a new decision or is deleted.
- AC-4 (R2). The system shall hold at most one case per source finding, including when requests
  arrive at the same time. Activating the control again on a finding that has a case creates
  nothing, and shows the AC-2 confirmation for the existing case.
- AC-5 (R3). IF any of the following holds THEN the system shall refuse to create the case, store
  nothing, and display a message that names the reason:
  - the pull request holds no non-empty patch text for the finding's file;
  - the finding's line range intersects no hunk of that patch;
  - the finding's review has no agent, or that agent no longer exists;
  - the new case's zone conflicts with an existing case of the opposite type (AC-45).
- AC-45 (R2, R11). IF the new case's zone intersects the zone of an existing case of the same agent,
  and one case is `must_find` while the other is `must_not_flag`, THEN the system shall
  refuse to create the new case, store nothing, and display a message naming the conflicting case.
  This holds in both directions. Reason: a match counts only file and lines (NFR-16), so no agent,
  however correct, could pass both cases.

### The set: Evals tab

- AC-6 (UI, US-2). The system shall display an "Evals" tab in the agent editor, which a link can open
  directly. The tab lists every case of the agent's set with:
  - its name, its type and its `file:line` location;
  - its status in the latest completed run: `passed`, `failed`, `error`, or "never run" when the
    case was not in that run.
- AC-7 (UI). WHEN the user confirms the deletion of a case, the system shall remove the case from the
  set. The stored metrics and per-case results of earlier runs stay unchanged.

### Running

- AC-8 (R13, US-3). The system shall start an eval run only when the user activates "Run eval (N)" on
  the Evals tab, where N is the number of cases in the set.
- AC-9 (R4, R12, R13). WHEN the user starts a run, the system shall answer at once with the run in
  status `running`. In the background it then evaluates exactly the cases in the set at that moment,
  each with the agent configuration read once at the start.
- AC-10 (R4). The system shall give the model, for a case, only:
  - the agent configuration;
  - the case's frozen input;
  - the review's trusted task instruction, built with the frozen PR number and without the author.

  It shall add nothing else: no PR intent, repo skeleton, callers digest, file-rank note,
  project-context document, memory or other repository context, and no part of the expectation.
- AC-11 (R5). The system shall review each case with the same review engine, prompt assembly and
  grounding gate as a pull-request review, and the engine stays unchanged.
- AC-12 (R4). WHEN two runs use the same agent configuration, the system shall give the model
  byte-identical input for the same case. Changes in between to the source pull request, its intent,
  the repository index, its project context or memory make no difference.
- AC-13 (R13). The system shall allow at most one run in status `running` per agent, including when
  start requests arrive at the same time. IF a run is requested while one is running THEN the system
  shall refuse it, start nothing, and say that a run is in progress.
- AC-14 (R13). IF a case fails THEN the system shall record the case as `error` with the reason, mark
  the run "has errors", and go on to the next case. A case fails when:
  - the model call errors or times out; or
  - the output still fails the schema after the engine's own retries.
- AC-15. IF a run cannot proceed as a whole THEN the system shall mark it `failed` with the reason.
  This happens when:
  - the agent's model provider cannot be resolved at the start, for example because there is no API
    key. No case is then evaluated;
  - the API process stopped while the run was `running`. The run is marked "interrupted" when the
    API starts again.
- AC-16. The system shall allow a run for any agent of the workspace, whether enabled or disabled.

### Scoring

- AC-17 (R6, R9). The system shall count a kept finding of a case as a match exactly when:
  - its file equals the expectation's file; and
  - its line range, taken low to high, shares at least one line with the expectation's range.

  Only kept findings are matched, and only against their own case's expectation. Title, severity and
  category are not compared.
- AC-18 (R7–R10). The system shall compute a run's metrics over its cases that are not `error`:
  - recall = `must_find` cases with at least one match ÷ all `must_find` cases;
  - precision = 1 − (kept findings that match a `must_not_flag` expectation ÷ all kept findings);
  - citation accuracy = kept findings ÷ all model findings. Kept and dropped come from the engine's
    grounding gate; the feature has no citation rule of its own;
  - a metric whose denominator is 0 is "n/a", never 0 or 1.
- AC-19 (R11). The system shall give each case that is not `error` a status:
  - `passed` when it is `must_find` with at least one match, or `must_not_flag` with no match;
  - `failed` otherwise.

  It shall count the run as "N/M passed", where N is its `passed` cases and M is all of its cases.
  `error` cases count in M as not passed.

### Run record and history

- AC-20 (R12). The system shall store each run as one record of the agent's set. The record holds:
  - the agent, the agent version and the model;
  - the name and version of every skill given to the model;
  - the status, the "has errors" mark and the start time;
  - the three metrics, the passed count and the cost;
  - the per-case results.

  Each per-case result holds:
  - the status;
  - the case's name, type and location at the time of the run;
  - the counts of kept and dropped findings;
  - each kept finding's location and title;
  - the case's cost;
  - for `error`, the reason.
- AC-21 (UI, US-4, US-5). The Evals tab shall display:
  - the metrics and "N/M passed" of the agent's latest completed run;
  - a status line for a newer run that is `running`, or that is `failed`, with its reason;
  - the run history, each run with its start time, status, agent version, three metrics, "N/M
    passed" and cost.
- AC-22. The system shall take a run's cost as the sum of its cases' costs. IF the cost of any case
  is unknown, because the model is unpriced or the case ended in `error` without a cost, THEN the
  system shall show the run's cost as "—", as the existing run cost badge does for an unpriced run.
  It never shows a partial sum, and never "$0.00" for an unknown cost.
- AC-23. WHEN an agent is deleted, the system shall remove its eval cases and runs.

### Compare

- AC-24 (R14, US-5). WHILE exactly two completed runs of the agent are selected in the history, the
  system shall offer Compare. Compare is a page of its own, and its address holds both run ids, so a
  reload shows the same comparison.
- AC-25 (R10, R14). Compare shall show the deltas of recall, precision, citation accuracy and cost.
  Each delta is the later-started run's value minus the earlier one's. A delta is "n/a" when either
  side is "n/a" or an unknown cost.
- AC-26 (R14). Compare shall list under "changed status" every case evaluated in both runs whose
  status differs, with its name, type, location and both statuses. A case evaluated in only one run
  is listed as "added" or "removed" instead.
- AC-27 (R14). Compare shall show a line diff of the system prompts of the two runs' agent versions,
  or "unchanged" when the prompts are equal.
- AC-28 (R12, R14). Compare shall show the difference between the two runs' skills. For each run it
  shall also show:
  - its start time, agent version and model;
  - its skills, with name and version;
  - its "has errors" mark.

### Eval Dashboard

- AC-29 (UI, US-6). The system shall display an "Eval Dashboard" entry in the SKILLS LAB navigation
  group. The entry opens a page with one row per workspace agent that has at least one case, whether
  the agent is enabled or not. Each row shows:
  - the agent's name and case count;
  - its latest completed run's agent version, metrics and "N/M passed", or "never run".

  Selecting a row opens that agent's Evals tab.
- AC-30 (UI, US-6). The Eval Dashboard shall list the 10 most recent runs across the workspace's
  agents. Each shows the agent name, start time, status, agent version, metrics, "N/M passed" and
  cost.

### Contracts and workspace

- AC-31 (R10, R16). The API and the studio shall define every shape of the feature identically, as
  extensions of the existing Eval contracts. The shapes are the case, expectation, run, per-case
  result, Compare and dashboard. In them, "n/a" is a value distinct from every number. A test shall
  fail when the Eval contracts of the two `@devdigest/shared` copies differ. Outside those
  contracts, the two copies shall differ in no more places than before.
- AC-32 (R15). IF a request names an agent, case, run or finding outside the caller's workspace THEN
  the system shall answer "not found" and change nothing.
- AC-33 (R15). The system shall give the model a case's frozen diff, PR title and PR description,
  each in its own delimited untrusted block under the injection guard, as a review does.

### Cost

A model call is one structured completion request that the engine makes for one review. A one-file
diff always takes the engine's single-pass path. The provider's existing structured-output repair
may re-ask within that call, and only when the output fails the schema. With a model stub that
returns valid output, the counts below are exact.

- AC-34 (R5). A run over N cases shall make exactly N model calls, one per case.
- AC-35 (R6, C-4). Computing matches, case statuses and metrics shall make zero model calls.
- AC-36 (R13). None of the following shall make a model call or start a run:
  - opening the Evals tab, Compare, the Eval Dashboard or a pull request's findings;
  - creating or deleting a case.

### Boundary with `evals/`

`evals/` is the harness-eval package at the repository root (lab L06). It shares only the word
"eval" with this feature.

- AC-37. No code, test or script of this feature shall import or read any file under the repo-root
  `evals/` package. No file under `evals/` shall refer to the server's eval module, its routes, or
  its stored cases or runs.
- AC-38. The Evals tab, Compare and the Eval Dashboard shall display only review agents' eval cases
  and runs, never harness eval results.

### `verify:l06`

- AC-39 (R17). `cd server && pnpm verify:l06` shall run exactly the four suites below. It shall need
  no API key and make no network request. When Docker is unreachable, it shall skip the integration
  suites rather than fail them, as the other integration tests do. The suites:
  1. Scoring unit tests: matches, case statuses, the three metrics, "n/a", the exclusion of `error`
     cases, and zero model calls (AC-17 to AC-19, AC-35).
  2. Case creation with a frozen input: both types, every refusal of AC-5 including the zone
     conflict of AC-45, and no duplicate (AC-2 to AC-5, AC-45).
  3. The parity test of the Eval contracts (AC-31).
  4. Integration tests (`*.it.test.ts`) of the eval routes and the workspace boundaries (AC-32).
- AC-40 (R17, C-5). `cd server && pnpm verify:l06` shall exit with code 0 on the feature's final
  commit.

### Demo v1 / v2 / v3 (verification of C-3)

Done by hand on the demo agent once its set holds 8 or more cases:

1. Run the agent with its current prompt (v1).
2. Edit the prompt so that it targets a `must_find` that v1 missed (v2), then run.
3. Compare v1 with v2.
4. Change the prompt to "flag every style remark, unused import and name as WARNING" (v3), then run.
5. Compare v2 with v3.
6. Restore v2's text. This creates a new agent version with v2's prompt.

- AC-41 (C-1). Observed on the demo data, not by an automated test: the demo agent's set holds at
  least 8 cases, with at least one `must_find` and one `must_not_flag`.
- AC-42 (C-3). WHEN two runs of the same set use a model stub whose findings depend on the system
  prompt, one before a prompt change and one after it, Compare shall show a non-zero delta in recall
  or precision, together with the prompt diff. This is the deterministic twin of AC-43 and AC-44.
- AC-43 (C-3). Observed on real runs: Compare of v1 with v2 shows a positive recall delta and the
  diff from the v1 prompt to the v2 prompt.
- AC-44 (C-3). Observed on real runs: Compare of v2 with v3 shows a negative precision delta, with
  `must_not_flag` cases going from `passed` to `failed`.

### AC map (draft → this revision)

| Draft AC | Now | Draft AC | Now |
|---|---|---|---|
| 1, 2 | AC-1 | 47, 49 | AC-21 |
| 3, 4, 6, 12 | AC-2 | 48 | AC-22 |
| 5, 7 | AC-3 | 50 | NFR-10 |
| 8, 9 | AC-4 | 51 | AC-23 |
| 10, 11, 13 | AC-5 | 52 | AC-24 |
| 14, 15 | AC-6 | 53–56 | AC-25 |
| 16, 17 | AC-7 | 57, 58 | AC-26 |
| 18, 20 | AC-8 | 59 | AC-27 |
| 19 | NFR-12 | 60 | AC-28 |
| 21, 22, 23 | AC-9 | 61, 62, 64 | AC-29 |
| 24, 25, 26 | AC-10 | 63 | AC-30 |
| 27 | AC-11 | 65–73 | NFR-12 to NFR-15 |
| 28 | AC-12 | 74–77 | AC-31 |
| 29, 30 | AC-13 | 78 | AC-32 |
| 31 | AC-14 | 79 | AC-33 |
| 32, 33 | AC-15 | 80 | AC-34 |
| 34 | AC-16 | 81 | AC-35 |
| 35, 36 | AC-17 | 82, 83 | AC-36 |
| 37–40, 43 | AC-18 | 84, 85 | AC-37 |
| 41, 42 | AC-19 | 86 | AC-38 |
| 44, 45, 46 | AC-20 | 87, 89, 90 | AC-39 |
| 88 | AC-40 | 91, 92, 93, 94 | AC-41, AC-42, AC-43, AC-44 |

## Edge cases

- EC-1. **Seed PR #482** (acme/payments-api) has no agent and no patch. While its findings are
  undecided, the control is disabled (AC-1). Once they are decided, creation is refused (AC-5), and
  the message names one of the reasons that apply.
- EC-2. **A decision is flipped after a case exists.** The case keeps its frozen type (AC-3), and a
  repeat click shows the existing case (AC-4). To change the type, the user deletes the case and
  creates it again.
- EC-3. **A case is deleted and its finding is clicked again.** A new case is created, because no
  case exists for that finding any more.
- EC-4. **Two different findings point at the same file and lines,** for example from re-runs. Each
  becomes its own case (NG13).
- EC-5. **The pull request was re-synced after the review.** If the file is gone from the PR, or the
  finding's lines no longer meet a hunk, AC-5 refuses the case.
- EC-6. **The file is binary, or GitHub sent no patch for it.** AC-5 refuses the case.
- EC-7. **A large patch.** There is no size limit of the feature's own: reviews send the diff
  uncapped, and the frozen diff is the whole file patch, as a review sends it. It is never
  truncated.
- EC-8. **The pull request has no description.** The frozen description is empty, and the model input
  has no description section, as in a review.
- EC-9. **The source finding, review, pull request or repository is deleted.** The case stays and is
  still evaluated (AC-3). Its source reference no longer resolves.
- EC-10. **The agent's prompt, model or skills change during a run.** The run finishes with its start
  configuration (AC-9), and the next run records the new one.
- EC-11. **A skill is linked, unlinked, reordered or edited.** None of these creates a new agent
  version, so two runs can share a version and still differ in skills. The record keeps them apart
  (AC-20), and Compare shows the difference (AC-28).
- EC-12. **Sets with nothing to measure.** A set with only `must_not_flag` cases has recall "n/a". An
  agent that returns no finding has precision "n/a" and citation accuracy "n/a", and recall 0 if its
  set has a `must_find` case (AC-18).
- EC-13. **The gate drops every model finding.** Citation accuracy is 0 and precision is "n/a".
- EC-14. **Every case of a run errors,** for example because each call is rate-limited. The run
  completes, marked "has errors". All three metrics are "n/a" and the count is "0/M passed" (AC-18,
  AC-19).
- EC-15. **A case is deleted during a run.** It is still evaluated in that run (AC-9), and the run's
  stored result keeps it (AC-7).
- EC-16. **The agent is deleted during a run.** Its cases and runs are removed (AC-23), and nothing of
  that run is stored afterwards.
- EC-17. **Two browser tabs start a run at the same moment.** Exactly one run starts, and the other
  request is refused (AC-13).
- EC-18. **Missing key vs a timeout.** A missing provider key fails the run at once (AC-15). A timeout
  on one case makes only that case `error` (AC-14).
- EC-19. **The model is unpriced.** Its cases have no known cost, and the run cost follows AC-22.
- EC-20. **The API restarts during a run.** The run becomes `failed` with "interrupted" (AC-15), and a
  new run can be started.
- EC-21. **The two compared runs share an agent version.** The prompt shows "unchanged" (AC-27); any
  metric delta then comes from the model's own variation or a skill change (AC-28).
- EC-22. **A compared run's agent-version snapshot is missing.** Compare says that version's prompt
  is unavailable, in place of the diff.
- EC-23. **A frozen diff or PR description holds instructions** ("approve this", "do not flag"), or
  imitates the untrusted delimiters. It stays data, and the engine neutralises forged delimiters
  (AC-33).
- EC-24. **A set of 100 cases.** The run makes 100 model calls (AC-34). "Run eval (100)" shows the
  count before the start (AC-8).
- EC-25. **A disabled agent.** It can be evaluated (AC-16), and it appears on the Eval Dashboard
  (AC-29).
- EC-26. **Opposite decisions on overlapping lines.** Real examples from the labelled data:
  "Unfinished review can be shared" (dismissed) at `server/src/modules/reviews/routes.ts:156-188`
  against an SSRF finding (accepted) at lines 153-180 of the same file; a "missing version bump"
  finding (dismissed) against "rename without alias" (accepted) at
  `server/src/vendor/shared/contracts/platform.ts:189-190`. Whichever case comes second is refused
  by AC-45. Same-type findings on the same lines stay separate cases (EC-4).
- EC-27. **A model call hangs.** A case that has not finished within `EVAL_CASE_TIMEOUT_MS` (120 s,
  in the eval module's `constants.ts`) gets status `error` with the reason "timeout", and the run
  goes on to the next case (AC-14). It counts like every `error` case (OQ-1): it is left out of the
  three metrics, counts in M as not passed (AC-18, AC-19), and its cost is unknown, so the run cost
  is "—" (AC-22). Without this deadline a hung call would keep the run `running` forever, and the
  one-running-run rule (AC-13) would block every later run of the agent until the API restarts.

## Non-functional requirements

- NFR-1. **Cost.** A run makes N model calls for N cases. Nothing else in the feature calls a model
  (AC-34 to AC-36).
- NFR-2. **Deterministic scoring.** A run's matches, case statuses and metrics can be recomputed from
  its stored per-case results and the cases' expectations, with no model call, and always come out
  the same.
- NFR-3. **Reproducible input.** A case's model input depends only on the agent configuration and the
  frozen input (AC-10, AC-12).
- NFR-4. **Observability.**
  - Run logs hold the run, agent and case identifiers.
  - They hold per-case status, tokens, cost and error reason.
  - They hold prompt section names and token counts, by the existing prompt-log rules.
  - They never hold frozen diff text, a PR description or prompt text. The only exception is the
    existing verbose local prompt logging.
- NFR-5. **Isolation.** Every read and write stays inside the caller's workspace (AC-32).
- NFR-6. **Resilience.** A failing case never fails its run (AC-14), and a dead run never blocks the
  agent's next one (AC-15).
- NFR-7. **Data changes.** Changes to stored-data shapes go only through the repository's generated
  migrations. No applied migration, journal or snapshot is edited by hand.
- NFR-8. **Inert display.** Case names, finding titles, paths, prompts and the prompt diff are shown
  as plain text. No markup or script in them is interpreted.
- NFR-9. **No regression.** Pull-request reviews produce the same prompts and results as before
  (NG8).
- NFR-10. **Number formats.**
  - Metrics are whole percentages without decimals, for example "83%".
  - Deltas are in percentage points with a sign, for example "+12 pp" or "−5 pp".
  - "n/a" is shown as that text.
  - Cost follows AC-22.
- NFR-11. **Order.** The case list, the run history and the Eval Dashboard's recent runs are each
  sorted newest first.
- NFR-12. **Controls.**
  - On an undecided finding, the disabled "Turn into eval case" control shows a hint that the
    finding must be accepted or dismissed first.
  - "Run eval (N)" is disabled while the set is empty or a run of the agent is `running`.
  - Deleting a case asks for confirmation in the design system's confirmation dialog.
- NFR-13. **Live status.**
  - While a run is `running`, the Evals tab shows that status, also after a reload or when opened
    later.
  - The studio polls the run status every 2–3 seconds.
  - When the run ends, its status, metrics, history and case statuses appear at the next poll,
    without a reload.
  - Status changes are announced to screen readers through a polite live region.
- NFR-14. **Feedback states.**
  - The Evals tab and the Eval Dashboard each have an empty state. It explains that a case is made
    from an accepted or dismissed finding with "Turn into eval case".
  - The case list, the run history, Compare and the Eval Dashboard each have a loading state, and a
    load-failure state with a way to retry.
  - A failed creation or deletion of a case shows an error message and keeps the previous state.
  - A failed run's reason appears in the status line (AC-21).
- NFR-15. **Texts.** Every label and static text comes from the studio's message files, reusing the
  `eval` namespace keys where their wording fits. The `evalsTab.emptyCases` text, which refers to a
  manual "sample diff", is replaced by a text about creating a case from a finding.
- NFR-16. **Limit of line-based matching.** A match counts only the file and the intersection of line
  ranges (R6, AC-17); it never compares what the finding says. Two findings on the same lines are
  the same to scoring: a `must_find` case passes with any finding there, whatever it is about, and
  a `must_not_flag` case fails on any finding there. Several same-type cases on the same lines
  measure one location, not several. AC-45 keeps opposite-type cases off the same lines.

## Inputs and provenance

**Model input per case.** One model call per case (AC-34), with no budget of the feature's own.

Limits on what the model receives:

- the frozen diff: the whole file patch, with no size limit of its own — reviews send the diff uncapped (EC-7);
- the frozen PR description: cut to **4 000 characters** by the engine
  (`reviewer-core/src/prompt.ts:93`);
- the system prompt, the skills and the task instruction: as in a review.

Deliberately kept out of the model input:

- the expectation;
- the PR author;
- the PR intent;
- the repo skeleton, callers digest and file-rank note;
- project-context documents;
- memory;
- every other file of the pull request;
- the pull request's current state.

| Input | Tag | Source |
|---|---|---|
| Source finding: file, lines, title | `[reused: findings of a review]` | `server/src/db/schema/reviews.ts:29-47`; DTO `server/src/modules/reviews/helpers.ts:38-57` |
| Decision on a finding | `[reused: Accept / Dismiss actions]`. They exclude each other; the latest wins. | `server/src/modules/reviews/findings.ts:11-34`, `server/src/modules/reviews/repository/review.repo.ts:134-158` |
| Owner agent | `[reused: the review's agent]`. It may be empty, and it has no foreign key. | `server/src/db/schema/reviews.ts:18` |
| Frozen diff of the finding's file | `[reused: stored PR file patch]`. The patch is replaced on every PR sync. Reviews already rebuild a diff from patches. | `server/src/db/schema/pulls.ts:36-45`, `server/src/modules/pulls/repository.ts:20-22`, `server/src/modules/reviews/diff-loader.ts:33-44` |
| Frozen diff size | `[decided 2026-10-15: no limit, as in reviews]` | Reviews send the diff uncapped; `reviewer-core` caps only the PR description (`reviewer-core/src/prompt.ts:93`). |
| Frozen PR number, title, description | `[reused: pull request row]` | `server/src/db/schema/pulls.ts:15-16,26` |
| Expectation | `[deterministic: type from the decision; file, lines, title from the finding]` | — |
| Agent configuration | `[reused: agent row and version snapshots]`. A config edit bumps the version; a skill change does not. | `server/src/db/schema/agents.ts:8-49`, `server/src/modules/agents/repository.ts:108-167,229-235` |
| Skills given to the model, with name and version | `[reused: the review's skill resolution]` | `server/src/modules/reviews/run-executor.ts:451-469`, `server/src/db/schema/skills.ts:20,25-36` |
| Task instruction | `[reused: the review's trusted task line]`. It uses the frozen PR number and leaves out the author. | `server/src/modules/reviews/helpers.ts:92-102` |
| Review of one case | `[new: 1 LLM call]` per case, through the unchanged engine. A one-file diff always runs single-pass. | `reviewer-core/src/review/run.ts:149-155,157-267`; the call site to mirror is `server/src/modules/reviews/run-executor.ts:261-324` |
| Kept and dropped findings | `[reused: the engine's grounding gate result]` | `reviewer-core/src/grounding.ts:52-90`, `reviewer-core/src/review/run.ts:244-266` |
| Matches, statuses, metrics | `[deterministic: AC-17 to AC-19]` | — |
| Tokens and cost per case | `[reused: usage the engine reports]`. Cost is empty when the model has no price. | `reviewer-core/src/review/run.ts:196-232`; rendering like the run cost badge, `server/specs/run-cost-badge.md` |
| Prompt diff and skill difference in Compare | `[deterministic: line diff of two version snapshots' prompts; set difference of two runs' recorded skills]` | Versions API: `server/src/modules/agents/routes.ts:127-142`. Line-diff precedent: `client/src/app/skills/[id]/_components/SkillDetailView/helpers.ts:20`. |
| Provider failure fails a run | `[reused: review precedent]` | `server/src/modules/reviews/run-executor.ts:207-214` |
| Interrupted runs marked failed on start | `[reused: review run reaping]` | `server/src/modules/reviews/service.ts:98-101`, `server/src/modules/reviews/repository/run.repo.ts:103-110` |
| Disabled agent evaluable | `[reused: a single-agent review does not filter disabled agents]` | `server/src/modules/reviews/service.ts:52-63` |
| Workspace of a request | `[reused: request context]` | `server/src/modules/_shared/context.ts:14-23` |
| Untrusted delimiters, injection guard | `[reused]` | `reviewer-core/src/prompt.ts:16-28,79-90` |
| Eval contracts | `[reused: Eval shapes in both copies, extended]` | `server/src/vendor/shared/contracts/knowledge.ts:49-84`, `server/src/vendor/shared/contracts/eval-ci.ts:15-89`; the client copies sit at the same lines |
| Contract parity test | `[reused: precedent of identical-file checks]` | `server/test/contracts.test.ts:351-355`, `server/test/intent-contracts.test.ts:12-14` |
| Integration tests skipped without Docker | `[reused]` | `server/test/helpers/pg.ts:10-32` |
| Finding card actions | `[reused: Accept and Dismiss buttons]` | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:91-112` |
| Agent editor tabs and `?tab` deep link | `[reused: Config, Skills, Context]` | `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:10-21` |
| Navigation entry, label, active state | `[reused: the label and the active-key logic exist; the entry is missing]` | `client/messages/en/shell.json:24`, `client/src/components/app-shell/helpers.ts:35`, `client/src/vendor/ui/nav.ts:30-42` |
| UI strings | `[reused: the eval namespace, not wired yet]` | `client/messages/en/eval.json:1-84` |

### Verified against the code (2026-10-15): deviations from «Що вже є у форку»

- **Eval tables.** Nothing outside their schema and migrations reads or writes them
  (`server/src/db/schema/eval.ts:7-35`). The run table holds one row per case, with the case
  required. The case table has no creation time, no source-finding reference and no uniqueness
  rule. AC-2, AC-4, AC-20 and NFR-11 need these.
- **`EvalRun` metrics** must be numbers from 0 to 1, so they cannot carry "n/a"
  (`knowledge.ts:58-67`, both copies). The same holds for the dashboard's `current` and `delta`
  (`eval-ci.ts:72-84`). AC-31 covers this.
- **`eval-ci.ts` copies.** The two copies are equal in their Eval part (`:15-89`) but differ
  elsewhere:
  - only the server copy imports `Provider` and `CiFailOn`
    (`server/src/vendor/shared/contracts/eval-ci.ts:3`);
  - only the server copy has `AgentManifest` (`:144-171`);
  - the `ConformanceInput` provider enum differs (server `:249`, client `:220`).

  So AC-31's parity check covers the Eval shapes, not the whole file.
- **Contract consumers.** The only consumer of the Eval contracts is the `EvalRun` fixture in
  `server/test/contracts.test.ts:146-164`.
- **Agent versions.** `agent_versions` snapshots hold skill ids only. Linking, unlinking or
  reordering skills writes no snapshot (`server/src/modules/agents/repository.ts:229-235`).
  Editing a skill's body bumps only that skill's own version. AC-20 and AC-28 cover this.
- **Accept and Dismiss** exclude each other and can be switched any number of times
  (`review.repo.ts:134-158`). See EC-2.
- **Finding card.** Accept and Dismiss appear only when the card is expanded
  (`FindingCard.tsx:77-113`).
- **Client.**
  - There is no `/eval` route and no eval hook.
  - The agent editor test asserts that there is no Evals tab (`AgentEditor.test.tsx:84`). This
    feature changes that.
  - The skill editor's matching assertion stays (`SkillDetailView/constants.ts:12`, NG4).
- **PR files** are deleted and re-inserted on every sync (`server/src/modules/pulls/repository.ts:20-22`).
  AC-3, AC-5 and EC-5 cover this.
- **`verify:l06`.** `server/package.json` has no such script.

### Data available for the demo (read-only database query, 2026-10-15)

- There are 73 findings in total, **0 accepted and 0 dismissed**. No agent has a labelled finding.
- Unlabelled findings on PRs whose finding file has a non-empty stored patch, all in
  `equalizer2k9/dev-digest`:

  | Agent | Findings | Pull requests |
  |---|---|---|
  | API Contract Reviewer | 33 | #9 |
  | General Reviewer | 13 | #6: 2, #7: 9, #11: 1, #19: 1 |
  | Performance Reviewer | 11 | #5: 1, #6: 1, #7: 9 |
  | Test Quality Reviewer | 11 | #10 |
  | Security Reviewer | 3 | #7 |

- Seed PR #482 (`acme/payments-api`) has 2 findings, no agent and no stored patch. None of its
  findings can become a case (AC-5, EC-1).

### Prerequisite (user action, not part of the feature)

C-1 needs a set of 8 or more cases. Since no finding is labelled yet, the user must first accept or
dismiss findings in the studio. The demo agent is the one that ends up with the most labels of both
kinds on PRs that have a patch. If the labels are still too few, the user runs reviews on test PRs
and labels the new findings (NG10).

## Untrusted inputs

These inputs come from outside the system's control:

- **The frozen diff.** The code and comments of a pull request's author.
- **The file path.** Chosen by the author.
- **The PR title and description.** Written by the author.
- **The finding title.** It becomes the case name and the expectation title. It is model output
  derived from the inputs above.
- **Imported or community skill bodies.** Third-party text, which the engine already handles.

Each of these is **data, not instructions**. The frozen diff, the PR title and the PR description
each go in their own delimited untrusted block under the injection guard. This is the same treatment
a review gives them, through the same engine (AC-33). The engine neutralises forged delimiters
(EC-23) and cuts the PR description to 4 000 characters. The frozen diff has no size limit of its
own, as in a review (EC-7).

Further protections:

- The expectation is never given to the model (AC-10), so no input can see or steer the answer key.
- Model output is never executed. Findings are only compared by file and line range (AC-17).
- Case names, titles, paths and prompts are displayed inert (NFR-8).
- Frozen diffs and PR descriptions never reach a log (NFR-4).

## Open questions

None. The user answered OQ-1 to OQ-16 of the draft on 2026-10-15, and the coordinator relayed the
answers. They are folded into AC-1 to AC-44, EC-1 to EC-25, NFR-10 to NFR-15 and NG13. The user's
revision of the same day added AC-45, EC-26 and NFR-16 and changed AC-5, AC-22 and EC-7.

## Changelog

- 2026-10-15 — EC-27 added: a per-case deadline, `EVAL_CASE_TIMEOUT_MS` = 120 s. A case still
  waiting for the model after it becomes `error` with the reason "timeout", and the run goes on.
  Reason: the OpenRouter client has no request timeout, so a hung call stalled the run forever and,
  through AC-13, blocked the agent's next runs until an API restart. No acceptance criterion changes;
  AC-14 already lists a timeout among case failures. `reviewer-core/` stays unchanged (NG8).
