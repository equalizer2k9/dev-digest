# INSIGHTS — client/

Non-obvious knowledge from past sessions — read before a non-trivial change here.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review client`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

- **2026-09-20** · NEVER correct stale filter state in a `useEffect`; derive the value in render instead.
  - Why: the effect renders one frame in the rejected state before rolling back, and no jsdom test can catch it — effects flush before assertions.
  - Evidence: `FindingsPanel.tsx` — `counts.some(...) ? severity : null` replaced an effect calling `setSeverity(null)`

- **2026-09-20** · Hover popovers inside a PR-list row MUST be `position: fixed`, anchored via `getBoundingClientRect()` on mouseenter.
  - Why: `s.tableCard` wraps the whole list in `overflow: hidden`, which silently clips any `position: absolute` child at the row edge.
  - Evidence: `src/app/repos/[repoId]/pulls/styles.ts` — `tableCard` vs `findingsPreview(top, left)` · `PRRow.tsx` findings cell

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

- **2026-09-20** · Derive severity UI from the findings data, NEVER from `Object.keys(SEV)` or the UI `Severity` type.
  - Why: the UI type carries a 4th value `INFO` that the wire contract never emits, so token-driven lists render a dead zero row.
  - Evidence: `src/vendor/ui/primitives/tokens.ts:3` (4 values) vs `src/vendor/shared/contracts/findings.ts:11` (3) · cast at `FindingCard.tsx:58`

- **2026-09-20** · Severity FILTER controls list all three contract severities always; only counters/badges are data-driven.
  - Why: a filter row rebuilt from the counts reshuffles between runs and hides the option that would empty the list.
  - Evidence: `FILTER_SEVERITIES` in `FindingsPanel/constants.ts` · counters still from `severityCounts()` · `specs/findings-severity-counters.md`

- **2026-09-20** · `Chip` exposes `aria-pressed` whenever `active` is passed — assert that in tests, NEVER `style.background`.
  - Why: `active` is an inline style only; reading it back sniffs the implementation and leaves the state invisible to screen readers.
  - Evidence: `src/vendor/ui/primitives/Chip.tsx:22` · `FindingsPanel.test.tsx` · same pattern in `pulls/_components/FilterBar`

- **2026-09-20** · Automating the PR-list findings preview: cross the cell→popover gutter in ONE pointer event, never an interpolated path.
  - Why: the popover is a DOM child of the cell but painted 6px below it, so a mid-path sample hits the row and `onMouseLeave` unmounts it.
  - Evidence: `src/app/repos/[repoId]/pulls/styles.ts:61` · `PRRow.tsx` findings-cell `onMouseLeave` · `Claude outputs/screencast/record.mjs`

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

- **2026-09-20** · To assert a `var(--x)` colour in jsdom, read the CSS shorthand (`el.style.borderBottom`), never a longhand.
  - Why: cssstyle (vitest 2.1.9 + jsdom) stores a shorthand containing `var()` verbatim but expands it to no longhands.
  - Evidence: `borderBottom` → `"1px dotted var(--crit)"` while `borderBottomStyle` → `""` · `FindingsPanel.test.tsx` counter-pill tests

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

### 2026-09-20 — split counters from the severity filter
- Done: `FindingsPanel` toolbar is now two rows — read-only `RunFindings`-style counter pills above, three always-present `Chip`s below; 21 tests.
- Added: Codebase Patterns, Tool & Library Notes
- Open: none; `docs/design-reference.md` decode snippet was wrong (manifest values are objects) and is fixed in place.
  - Corrected 2026-09-20 by the user, twice: dropping `aria-pressed` for a visual-only `active` was wrong (fixed in `Chip`), and the auto-clear `useEffect` was replaced by a derived value. Added: What Doesn't Work, Codebase Patterns.

### 2026-09-20 — FINDINGS column on the PR list
- Done: severity chips + lazy read-only hover preview in `PRRow`, `latestFindingsPerAgent()` helper, 13 new tests.
- Added: What Doesn't Work

### 2026-09-20 — Playwright screencast of the findings feature
- Done: 97s 1920x1080 mp4 recorded by a standalone rig in `Claude outputs/screencast/` (git-ignored, deliberately outside `e2e/`).
- Added: Codebase Patterns

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
