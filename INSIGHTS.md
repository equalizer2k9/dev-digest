# INSIGHTS — repo root

Infra (`scripts/`, `.github/`, docker) and cross-package insights — read before touching them.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review root`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

- **2026-09-20** · To read `docs/DevDigest Design (standalone).html`, decode its `__bundler/manifest` blobs — never grep the raw file.
  - Why: the React sources are gzip+base64 per UUID, so a raw grep surfaces only artboard labels, not component markup.
  - Evidence: `<script type="__bundler/manifest">` → `json.loads` → `base64.b64decode` + `gzip.decompress` yields 29 `.jsx` (`primitives.jsx`, `screen_dashboard.jsx`, `prdetail_runs.jsx`, `findings.jsx`, `screen_trace.jsx`)

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

### 2026-09-20 — Run Cost Badge spec + plan
- Done: `server/specs/run-cost-badge.md` written against the decoded design bundle; a first pass that specced from the lab slide alone was wrong in 5 places (badge base element, PR-list column position, plaque placement, timeline markup, a missed 4th surface).
- Added: What Works.
- Open: spec is `draft`, not yet approved or implemented.

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
