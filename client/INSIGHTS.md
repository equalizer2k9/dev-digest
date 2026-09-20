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

- **2026-09-20** · Derive severity UI from the findings data, NEVER from `Object.keys(SEV)` or the UI `Severity` type.
  - Why: the UI type carries a 4th value `INFO` that the wire contract never emits, so token-driven lists render a dead zero row.
  - Evidence: `src/vendor/ui/primitives/tokens.ts:3` (4 values) vs `src/vendor/shared/contracts/findings.ts:11` (3) · cast at `FindingCard.tsx:58`

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

- **2026-09-20** · ``MISSING_MESSAGE: Could not resolve `prReview.list.columns.cost` in messages for locale `en`.``
  - Cause: `messages/en/*.json` is read with `readFileSync` outside the webpack graph — no HMR, and the browser keeps the stale layout payload.
  - Fix: hard-reload the page (`Ctrl+Shift+R`); restart `next dev` if it survives that.
  - Evidence: `src/i18n/request.ts:20` · key was already on disk at `messages/en/prReview.json:95`

- **2026-09-20** · `Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)`
  - Cause: `borderColor` is itself shorthand for the four side colours, so it clashes with `borderLeftColor` — the "all-longhand" comment there was wrong.
  - Fix: set `borderTopColor` / `borderRightColor` / `borderBottomColor` individually and keep `borderLeftColor`.
  - Evidence: `_components/FindingCard/styles.ts:5-19`, fires whenever `focused` flips

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

### 2026-09-20 — phantom missing i18n key on PR list
- Done: key and dev-server payload were both correct; stale client messages, no code change.
- Added: Recurring Errors & Fixes

### 2026-09-20 — severity counters on the findings panel
- Done: per-run counter row + single-select severity filter in `FindingsPanel`, 21 tests; fixed a latent border-shorthand warning it surfaced in `FindingCard`.
- Added: Codebase Patterns, Recurring Errors & Fixes
- Open: `specs/findings-severity-counters.md` is `draft`, not yet reviewed.
  - Resolved 2026-09-20: spec set to `implemented` after adding the two missing tests (per-run independence, j/k focus reset).

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
