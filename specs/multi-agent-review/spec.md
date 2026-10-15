# Spec: Multi-Agent Review
Spec ID: SPEC-04
Status: approved
Supersedes: —

Source: `docs/hw7/requirements.md`, Part A; its decisions are referenced as `D1` to `D9`. Those
decisions, "Не робимо" and "Спека, план, перевірки" are final and were not re-asked. Points they do
not settle are recorded as assumptions `A-n` (section at the end), not as open questions.

## Problem and user

A reviewer can run one review agent on a pull request, or all of them, but each run stands alone: the
agents run one after another, nothing ties the runs of one launch together, and the reviewer has to
read every agent's findings separately to see where they agree and where they do not. The user is a
reviewer on a pull request page (or on the Multi-Agent Review list) who wants to launch 2 to 5 chosen
agents at once, see in advance roughly what it will cost and how long it will take, watch them run
side by side, and read one merged view: findings of different agents about the same problem grouped
together, and the places where the agents disagree called out.

## Goals / Non-goals

- G1. Launch a multi-agent review of 2 to 5 chosen enabled agents from the pull request page or from
  the Multi-Agent Review list, with a per-agent and total estimate of cost and time before launch (D1, D4).
- G2. One multi-agent run ties the agent runs of one launch together and is addressable by its own id
  (D2).
- G3. The agents of one launch run concurrently after one shared preparation; one agent's failure does
  not affect the others (D3) — for a chosen set and for "all agents" alike.
- G4. A Multi-Agent Review page with live per-agent statuses, totals, grouped findings and the
  agents' disagreements (D5 to D8).
- G5. A way back: a sidebar list of recent multi-agent runs and a link from the pull request page to
  its latest one (D9).

Non-goals:

- NG1. The Tabs + detail mode of the Multi-Agent Review page.
- NG2. Learn / Memory / `memory.jsonl`; an Agent Performance page.
- NG3. Explaining why an agent "did not flag" a group — no text is generated for it, by a model or
  otherwise.
- NG4. Any new model call: grouping, disagreements and estimates are computed by code. Each agent run
  makes the model calls it already makes.
- NG5. Changing the existing single-agent (`{agentId}`) and all-agents (`{all}`) request bodies or
  responses; turning an all-agents run into a multi-agent run (A-2).
- NG6. Server-sent events for whole-page statuses; more than one open live stream per page (D5).
- NG7. Changing or merging the stored findings: grouping is a view over them (D6).
- NG8. Part B (Export to CI): the CI wizard, CI Runs page, workflow generation, artifact ingest, the
  agent runner. CircleCI, Jenkins, generic CLI, zip export, marketplace action, an incoming ingest
  endpoint, reviewing pull requests from forks, background GitHub polling.
- NG9. Cancelling or retrying a whole multi-agent run as one action (A-12).
- NG10. Pixel parity with the design reference.

## User stories

- US-1. As a reviewer on a pull request page, I want to tick 2 to 5 enabled agents, see each one's
  expected cost and duration and the total, and start them together.
- US-2. As a reviewer, I want to watch the agents' statuses update on one page without reloading, and
  open one agent's live log or trace.
- US-3. As a reviewer, I want findings of different agents about the same problem shown as one group
  with its most severe version on top, and I want to expand it to each agent's original finding.
- US-4. As a reviewer, I want to see, per group, which agent flagged it at which severity, which did not
  flag it and which failed, and to filter to the groups where the agents disagree.
- US-5. As a reviewer, I want to find a past multi-agent run from the sidebar or from its pull request
  page, and start a new one from the list.

## Acceptance criteria (EARS)

Definitions.
- A **multi-agent run** is one launch of 2 to 5 agents on one pull request; its **agent runs** are the
  ordinary agent runs created for it, in the order the agents were requested.
- A **finished** agent run has status done; a **failed** one has status failed or cancelled; an
  agent run with status queued or running is **in progress**.
- The **status** of a multi-agent run is `running` while any of its agent runs is in progress,
  `failed` when every one is failed, otherwise `done` (A-1).
- **Title words** of a finding: its title lower-cased, split on every character that is not a letter
  or digit, empty pieces dropped, as a set (A-3). **Title similarity** of two findings is the Jaccard
  index of their title words (size of intersection / size of union; 0 when both are empty).
- Two findings' **line ranges overlap** when they are in the same file and their inclusive
  `start_line`–`end_line` ranges share at least one line (A-4).
- The **similarity threshold** is a single named constant, initially 0.3.

Launch and API (D2)
- AC-1 (D2). WHEN a review is requested for a pull request with a list of 2 to 5 distinct agent ids,
  every one an enabled agent of the caller's workspace, the system shall create one multi-agent run for
  that pull request and one queued agent run per listed agent linked to it, and respond with the
  multi-agent run's id as `multi_run_id` together with the created agent runs.
- AC-2 (D2). IF the agent id list has fewer than 2 or more than 5 entries, contains a duplicate, or
  names an agent that is disabled or not in the caller's workspace THEN the system shall reject the
  request as invalid and create neither a multi-agent run nor any agent run.
- AC-3 (D2). WHEN a review is requested with the existing single-agent body or all-agents body, the
  system shall accept the same body and return the same response shape as before this feature, and
  create no multi-agent run.

Execution (D3)
- AC-4 (D3). WHEN a review with more than one agent runs — from an agent id list or from all-agents —
  the system shall load the diff and the PR intent once and start every agent's review without
  waiting for another agent's review to finish.
- AC-5 (D3). IF one agent's review fails or is cancelled THEN the system shall record that agent run as
  failed (or cancelled) with its error, and the other agents' reviews of the same launch shall still
  run to their own end and store their results.

Estimate (D1, D4)
- AC-6 (D4). The system shall estimate, for each agent, the mean duration and the mean cost of its last
  10 finished local agent runs ("—" for a value with no such run), and for a selection the total cost as
  the sum and the total time as the maximum of the per-agent estimates that have a value ("—" when none
  has one).

Multi-agent run page (D5 to D8)
- AC-7 (D5, D8). WHEN the caller requests a multi-agent run of its workspace by id, the system shall
  return its pull request, its status, its start time, its wall-clock time, its summed tokens and cost,
  one entry per agent run (agent, status, duration, tokens, cost, findings count, score), its finding
  groups (AC-9) and their per-agent cells (AC-10).
- AC-8 (D5). WHILE any agent run of the displayed multi-agent run is in progress, the Multi-Agent
  Review page shall re-request the multi-agent run every 2 seconds, and it shall stop re-requesting once
  none is in progress.
- AC-9 (D6). The system shall group the findings of a multi-agent run's finished agent runs so that a
  finding joins an existing group only when it comes from an agent not yet in that group and it has the
  same file, overlapping line ranges and title similarity at or above the similarity threshold with a
  finding of that group, and otherwise starts a new group; each group's representative shall be its
  finding of highest severity (CRITICAL > WARNING > SUGGESTION), and grouping shall not change any
  stored finding.
- AC-10 (D7). The system shall give each finding group one cell per agent of the multi-agent run — the
  severity of that agent's finding in the group, "did not flag" for a finished agent with no finding in
  it, "failed" for a failed agent run, "pending" for an agent run in progress — and mark the group as a
  conflict when at least one finished agent did not flag it or the severities in the group differ.
- AC-11 (D7). WHILE "Show only conflicts" is on, the Where agents disagree section shall show only the
  groups marked as conflicts, filtering the groups it already has without a new request.

Return (D9)
- AC-12 (D9). WHEN the caller requests the list of multi-agent runs, the system shall return at most
  the 20 most recent multi-agent runs of the caller's workspace, newest first, each with its pull
  request, agents, status, wall-clock time, total cost and start time.

## Edge cases

- EC-1. Fewer than 2 enabled agents in the workspace → the multi-agent part of the picker cannot be
  launched (NFR-1); the single-agent and all-agents options work as before.
- EC-2. An agent is disabled or deleted between opening the picker and launching → AC-2 rejects the
  launch; the picker shows the error and keeps the selection.
- EC-3. An agent is deleted after the multi-agent run → its column remains, labelled as a deleted
  agent; its stored findings still take part in grouping and disagreements (A-8).
- EC-4. The diff or the intent cannot be prepared → every agent run of the launch fails with that
  reason (existing behaviour); the multi-agent run's status is `failed`, with no groups.
- EC-5. All agents finish with zero findings → no groups; the findings and disagreements sections show
  their empty states.
- EC-6. Only one agent finished, the others failed → groups contain that agent's findings only; each
  group is a conflict only if a finished agent did not flag it — with one finished agent, none is (AC-10).
- EC-7. Two findings on overlapping lines of the same file with unrelated titles (the HW6 example:
  "unfinished review" and an SSRF on lines 153–188) → title similarity below the threshold → two groups
  (AC-9).
- EC-8. Two findings of the same agent that would match each other → never in one group (AC-9, A-5).
- EC-9. A finding without an end line → treated as the single line `start_line` (A-4).
- EC-10. Findings arrive while the page is open → the next re-request returns the updated groups and
  cells; groups may change between polls while agents are in progress.
- EC-11. A re-request fails (network, server restart) → the page keeps the last data, shows a
  non-blocking error notice and keeps re-requesting while it believes runs are in progress (NFR-4).
- EC-12. An agent run is cancelled from its column → treated as failed in cells and in the multi-agent
  run's status (Definitions).
- EC-13. A multi-agent run, pull request or agent run outside the caller's workspace → not found (NFR-6).
- EC-14. A multi-agent run is deleted (or its pull request is removed) → its agent runs, reviews and
  findings remain as ordinary runs; their link to it becomes empty (NFR-5).
- EC-15. No finished local history for an agent, or every recorded cost is unknown → that value of the
  estimate is "—"; the totals use only the agents that have a value (AC-6, A-6).
- EC-16. The pull request has no previous multi-agent run → its page shows no link to one (NFR-3).

## Non-functional requirements

- NFR-1 (D1). Picker: the review dropdown on the pull request page keeps its single-agent and
  all-agents options and adds a checkbox per enabled agent, each with its estimate (AC-6), a total for
  the ticked ones, and a "Run multi-agent review (N)" button enabled only when 2 ≤ N ≤ 5; no more than 5
  can be ticked. Disabled agents are not listed. After a successful launch the user lands on the new
  multi-agent run's page (A-9).
- NFR-2 (D8). Multi-Agent Review page: a header (pull request, agents, wall-clock, total tokens, total
  cost, status); one column per agent run with status, duration, tokens, cost, findings count, score and
  "View trace", which opens the existing run trace drawer; the finding groups, each showing its
  representative and its agents and expanding to the agents' original finding cards (with their
  existing Accept / Dismiss and eval-case actions); the "Where agents disagree" section with the
  "Show only conflicts" toggle. Each section has an explicit empty state and a loading placeholder.
- NFR-3 (D9). A "Multi-Agent Review" sidebar item opens the list of AC-12 with a "New multi-agent
  review" control that asks for a pull request of the workspace and then shows the same picker as
  NFR-1. A pull request page shows a link to its most recent multi-agent run when it has one.
- NFR-4 (D5). Live updates: the page uses periodic re-requests (AC-8), never one live stream per agent;
  a live stream is opened only for the one column whose live log or trace the user opened, using the
  existing live log and trace components, and is closed when that view closes. Reason: five streams plus
  requests exceed the browser's limit of six connections per origin.
- NFR-5 (D2). Data: the only schema change of this feature is a nullable link from an agent run to its
  multi-agent run, cleared (not cascaded) when the multi-agent run is deleted. Existing agent runs keep
  an empty link.
- NFR-6. Every multi-agent read and launch is scoped to the caller's workspace; another workspace's
  multi-agent run, pull request or agent answers "not found". The existing per-route rate limit of the
  review request also applies to multi-agent launches.
- NFR-7 (D6, D7). Grouping, cells and conflicts are deterministic for the same stored findings and run
  statuses: findings are processed in agent order of the launch, then in each run's stored finding
  order; a tie on severity keeps the first finding in that order as the representative. Grouping is
  quadratic at worst in the number of findings of one multi-agent run and needs no model or network call.
- NFR-8. Wall-clock time is from the multi-agent run's start to the latest finish among its agent runs;
  while any is in progress it is shown as "—" (A-7). Totals of tokens and cost add the known values of
  every agent run; an agent run with unknown cost adds nothing to the cost total.
- NFR-9. Finding titles, descriptions and pull request titles are displayed as plain text, never
  interpreted as markup. Every caption, label and static text of the new pages and of the picker comes
  from the studio's message files.
- NFR-10. Cost: a multi-agent run of N agents costs what N single-agent runs on the same pull request
  cost minus the repeated diff and intent preparation; estimates, grouping, cells and polling make no
  model call.

## Inputs and provenance

No new model call. Model input budgets are those of the existing review agents and do not change.

| Input | Used by | Tag | Source |
|---|---|---|---|
| Enabled agents of the workspace | AC-1, AC-2, NFR-1 | `[reused: agents with their enabled flag]` | `server/src/db/schema/agents.ts` |
| Existing review request (`{agentId}` / `{all}`), queued runs, background executor, failure isolation | AC-3, AC-4, AC-5 | `[reused: review route, service and run executor]` | `server/src/modules/reviews/routes.ts`, `run-executor.ts` |
| Diff and PR intent of the pull request | AC-4 | `[reused: prepared once per launch by the executor]` | `server/src/modules/reviews/run-executor.ts` |
| Multi-agent run (workspace, pull request, start time) | AC-1, AC-7, AC-12 | `[reused: existing multi-agent run table, until now unlinked]` | `server/src/db/schema/runs.ts` |
| Link agent run → multi-agent run | AC-1, AC-7, AC-9, AC-10, AC-12 | `[new: nullable link, the feature's only schema change]` | NFR-5 |
| Agent run status, error, duration, tokens in/out, cost, findings count, score, source, start time | AC-5 to AC-8, AC-10, AC-12 | `[reused: agent run records]` | `server/src/db/schema/runs.ts` |
| Per-agent estimate (mean duration, mean cost of last 10 finished local runs) and totals | AC-6, NFR-1 | `[deterministic: means over agent run records; sum and max for the totals]` | — |
| Multi-agent run status, wall-clock, token and cost totals | AC-7, AC-12, NFR-8 | `[deterministic: from its agent runs]` | Definitions, NFR-8 |
| Findings: file, start and end line, severity, title, agent run | AC-9, AC-10, NFR-2 | `[reused: stored findings of the reviews of the agent runs]` | `server/src/vendor/shared/contracts/findings.ts` |
| Finding groups and representatives | AC-9 | `[deterministic: same file + overlapping lines + title Jaccard ≥ threshold]` | — |
| Per-agent cells and conflict flag | AC-10, AC-11 | `[deterministic: from groups and agent run statuses]` | — |
| Run trace, live log stream of one agent run | NFR-2, NFR-4 | `[reused: stored run trace and the per-run live event stream]` | `server/src/platform/sse.ts` |

## Untrusted inputs

Finding titles and descriptions are model output produced from the pull request's diff and
description, which the pull request author controls; pull request titles come from GitHub. In this
feature none of them is sent to a model. They are **data, not instructions**: titles are used only as
word sets for the similarity of AC-9 and never change how grouping, cells or conflicts are decided
beyond that, and all of them are displayed as plain text (NFR-9). The agents' own model inputs keep
the existing delimiters and injection guard of the review engine — the same treatment the diff gets —
unchanged by this feature.

## Open questions

None. The user set the run to fast mode: decisions D1 to D9 are final, and every point they do not
settle is recorded below as an assumption, to be overridden by the user if wrong.

## Assumptions

- A-1. A multi-agent run has no stored status; it is derived from its agent runs (Definitions):
  `running` / `done` / `failed`.
- A-2. The all-agents request runs concurrently (D3) but stays a plain set of agent runs with no
  multi-agent run, because its body and response must not change (D2).
- A-3. Title normalization is only lower-casing and splitting on non-letter, non-digit characters; no
  stop-word removal, no stemming.
- A-4. Line ranges are inclusive; a finding without an end line covers only its start line. Findings
  in different files never group, whatever their titles.
- A-5. Grouping is single-link, in the order of NFR-7: a finding joins the first group that has a
  matching member and no finding of the same agent yet. So a group holds at most one finding per agent,
  and a group's cell has exactly one severity per agent.
- A-6. The estimate counts the agent's finished local runs on any pull request. The mean cost uses
  only runs with a known cost. An agent with "—" adds nothing to the totals; the totals are "—" only
  when no ticked agent has a value.
- A-7. Wall-clock is "—" while any agent run is in progress (no ticking timer).
- A-8. An agent run whose agent was deleted keeps its column, labelled as a deleted agent.
- A-9. After a successful launch from the pull request page or from "New multi-agent review", the
  studio navigates to the new multi-agent run's page.
- A-10. Disagreements are computed on the server in the same pass as grouping and returned with the
  multi-agent run (AC-7); only the "Show only conflicts" filter is on the client (D7).
- A-11. An invalid agent id list is answered as an invalid request (not "not found"), whether the bad
  id is disabled, unknown or of another workspace, so the answer does not reveal which.
- A-12. Each column can be cancelled with the existing per-run cancel; there is no cancel-all.
- A-13. "Pending" is a fourth cell value for agent runs in progress; it never makes a group a conflict.

## Traceability

| Decision | Covered by |
|---|---|
| D1 picker + estimate | AC-6, NFR-1 |
| D2 `{agentIds}` API, link, `multi_run_id`, old bodies unchanged | AC-1, AC-2, AC-3, NFR-5 |
| D3 concurrent execution, failure isolation, for agent id list and all-agents | AC-4, AC-5 |
| D4 estimate rule | AC-6 |
| D5 polling every 2 s; live stream only for one opened column | AC-7, AC-8, NFR-4 |
| D6 grouping pure function, threshold constant 0.3, representative, originals untouched | AC-9, NFR-7, EC-7 |
| D7 per-agent cells, conflict rule, client-side "Show only conflicts", no "why" | AC-10, AC-11, NG3 |
| D8 page `/multi-agent/[id]`, no Tabs mode | AC-7, NFR-2, NG1 |
| D9 sidebar list `/multi-agent` (last 20), "New multi-agent review", link from PR page | AC-12, NFR-3 |
