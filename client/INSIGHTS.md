# INSIGHTS — client/

Non-obvious knowledge from past sessions — read before a non-trivial change here.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review client`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

- **2026-09-20** · ``MISSING_MESSAGE: Could not resolve `prReview.list.columns.cost` in messages for locale `en`.``
  - Cause: `messages/en/*.json` is read with `readFileSync` outside the webpack graph — no HMR, and the browser keeps the stale layout payload.
  - Fix: hard-reload the page (`Ctrl+Shift+R`); restart `next dev` if it survives that.
  - Evidence: `src/i18n/request.ts:20` · key was already on disk at `messages/en/prReview.json:95`

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

### 2026-09-20 — phantom missing i18n key on PR list
- Done: key and dev-server payload were both correct; stale client messages, no code change.
- Added: Recurring Errors & Fixes

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
