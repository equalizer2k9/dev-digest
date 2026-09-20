# INSIGHTS — server/

Non-obvious knowledge from past sessions — read before a non-trivial change here.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review server`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

- **2026-09-20** · Adding a per-run stat means touching FIVE write paths in `run-executor.ts`, not one.
  - Why: a run ends three ways (success, per-agent failure, pre-work `failAll`) and each writes a `RunTrace` alongside; miss one and the field is null on exactly the runs you debug with.
  - Evidence: `completeAgentRun` at `src/modules/reviews/run-executor.ts:76,247,302` · trace `stats` at `:267` and `traceFromBuffer` `:425`
- **2026-09-20** · ALWAYS `leftJoin` when joining `agent_runs` onto `reviews` via `reviews.run_id`.
  - Why: the column carries no FK and `deleteAgentRun` leaves the review behind, so an inner join silently drops reviews whose run was deleted.
  - Evidence: `src/db/schema/reviews.ts:9-26` (no `.references()`) · `src/modules/reviews/repository/review.repo.ts:66` · `run.repo.ts:77`

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

### 2026-09-20 — Run Cost Badge: persist + serve per-run cost
- Done: `agent_runs.cost_usd` restored (migration `0010`), cost served on `/pulls/:id/runs`, `/runs/:id/trace`, `/pulls/:id/reviews` and `/repos/:id/pulls`; 104 unit + 30 integration tests green.
- Added: Codebase Patterns.

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
