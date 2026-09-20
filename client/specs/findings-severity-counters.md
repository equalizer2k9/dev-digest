# Findings severity counters

**Status:** implemented · **Package:** client · **Date:** 2026-09-20

## Problem

Findings on the PR detail page are grouped per review run — one `ReviewRunAccordion`
per agent pass, each rendering its own `FindingsPanel`. A panel's toolbar offers a
single control ("Hide low confidence"), so the only way to judge the shape of a run's
findings is to read every card top to bottom.

The accordion header summarises a run as `10 findings · 3 blockers`, which says
nothing about the WARNING / SUGGESTION split, and there is no way to narrow the list
to one severity. On a run with dozens of findings, answering "what are the criticals
here?" means scrolling past everything else.

## Goals / non-goals

**Goals**

- Show, per review run, how many findings sit at each severity.
- Let a reviewer click a severity to see only those findings, and click again to
  clear.
- Derive everything from findings already fetched — no new API call, contract
  change, migration, or LLM work.

**Non-goals**

- A PR-level aggregate across all runs. Counters are scoped to one run.
- Multi-select filtering (e.g. CRITICAL + WARNING at once).
- Persisting the filter in the URL or across reloads.
- Server-side aggregation. `server/src/modules/pulls/status.ts` has an unused
  `rollupSeverities()` helper; it stays unused. Findings arrive unpaginated and
  unfiltered, so client-side counting is exact.
- Reconciling the pre-existing dismissed-findings inconsistency between
  `ReviewRunAccordion.tsx:56` (excludes dismissed from its blocker count) and
  `page.tsx:77` (includes them in `findingsCount`).

## Behaviour

Each `FindingsPanel` toolbar stacks two rows: read-only counters on top, the
severity filter below. Counting and filtering are separate controls — a counter is
never a button.

1. **Counter row (top).** One pill per severity that has at least one finding in this
   run, ordered `CRITICAL → WARNING → SUGGESTION → INFO` (the existing
   `SEVERITY_ORDER`). A pill is icon + number only — no label — underlined with
   `1px dotted` in its severity colour, exactly as `RunFindings` draws it in the
   design. Pills are not clickable.
2. **Filter row (bottom).** One `Chip` per severity — Critical, Warning, Suggestion —
   **always all three**, whether or not the run has findings at that level, so the
   control does not reshuffle as runs differ. Chips carry no count; the numbers live
   in the row above. The "Hide low confidence" toggle sits at the right of this row,
   after a divider.
3. **Click a chip.** The list narrows to that severity and the chip reads as active —
   `Chip`'s accent styling for sighted users, `aria-pressed="true"` for everyone else.
4. **Click the active chip again.** The filter clears and the full list returns.
5. **Click a different chip while one is active.** The filter switches to the new
   severity.
6. **Counts do not change when a filter is applied.** They describe the run, not the
   current view, so the reviewer can always see what else is there.

**Edge cases**

- *No findings in the run* — the counter row is not rendered at all. The existing
  empty state is unchanged.
- *Only one severity present* — a single counter pill renders, while all three
  filter chips stay on offer.
- *A chip for a severity with no findings* — inert. The chip never reads as pressed
  and the list stays unfiltered, because the filter in effect is derived from the
  counts on every render rather than corrected afterwards.
- *"Hide low confidence" interacts with the counts.* Counts are computed **after**
  the confidence filter, so a counter's number always equals the number of rows you
  get by clicking it. Toggling the confidence switch re-computes the counters.
- *The selected severity disappears* — if switching "Hide low confidence" on removes
  every finding of the currently selected severity, the panel would otherwise sit
  filtered to an unreachable empty list. The filter stops applying instead, and the
  chip reads unpressed. The selection is only **suspended**, not discarded: switching
  the confidence toggle back restores both the finding and the filter, because the
  reviewer never cleared it — the toggle did.
- *Keyboard focus.* The panel's `j`/`k` navigation indexes into the visible list, so
  changing the filter resets the focused index to the top. Without this the focus
  ring can point past the end of a shortened list.
- *Dismissed / accepted findings* are counted, because the list still renders them.
  The counters describe exactly what the list can show.
- *Multiple runs on one PR* — each panel owns its own counters and its own filter
  state. Filtering one run does not affect another.

## Contracts & data

No Zod contract, route, DB table or migration changes. `Severity` stays
`CRITICAL | WARNING | SUGGESTION` in both `@devdigest/shared` copies.

Note the existing mismatch, which this feature must not trip over: the UI token type
`client/src/vendor/ui/primitives/tokens.ts:3` has a fourth value, `INFO`, that the
wire contract never emits. Counters are therefore driven by the data, not by the
token map — a severity with no findings is omitted, so no permanently-zero INFO
counter appears, and INFO renders automatically if it ever does arrive.

`messages/en/prReview.json`, existing `panel` section — three new keys:

| Key | Purpose |
|---|---|
| `panel.severityCounters` | Accessible label for the counter group |
| `panel.severityFilter` | Accessible label for the filter-chip group |

The severity words themselves come from `SEV[...].label` in the UI tokens and are not
translated — a pre-existing deviation from the i18n convention, left as-is.

## Acceptance criteria

- [x] Each `FindingsPanel` shows one counter per severity present in that run, with
      the correct count, ordered by `SEVERITY_ORDER`.
- [x] A counter is icon + number, no label, underlined `1px dotted` in its severity
      colour, and is not clickable.
- [x] A severity with no findings in the run has no counter.
- [x] The filter row always offers all three severity chips, including ones with no
      findings in this run, and no chip shows a count.
- [x] Clicking a chip filters that run's list to that severity.
- [x] Clicking the active chip again clears the filter.
- [x] Clicking a different chip switches the filter.
- [x] Counter numbers are unaffected by the active severity filter.
- [x] Counts reflect the "Hide low confidence" setting.
- [x] The selected filter clears if that severity stops being available.
- [x] The counter row is absent when the run has no findings.
- [x] Each run's counters and filter are independent of other runs on the page.
- [x] Both rows expose `role="group"` with a label. A chip's label is stable
      ("Critical") and its state is carried by `aria-pressed` — no severity-dependent
      `aria-label`, and no state that exists only as an inline style.
- [x] A chip for a severity with no findings never reads as pressed, in any frame.
- [x] `j`/`k` focus resets to the top of the list when the filter changes.
- [x] Colors come only from CSS vars; no new `@devdigest/ui` primitive is added —
      the filter reuses the existing `Chip`.

## Tests

Client component suite (vitest + jsdom, `fetch` mocked). Note
`@testing-library/user-event` is not installed — use `fireEvent`.

- `FindingsPanel/helpers.test.ts` (new) — `severityCounts()`: tally, omission of
  zero-count severities, `SEVERITY_ORDER` ordering, empty input. `visibleFindings()`
  with a severity filter, alone and combined with `hideLow`.
- `FindingsPanel/FindingsPanel.test.tsx` (extend) — counters render with correct
  numbers; clicking narrows the list; clicking again restores it; the row is absent
  with no findings.

No server, reviewer-core or e2e changes. CI: `client/**` path filter, `client.yml`.

## Open questions

- ~~`SeverityBadge` renders label-then-count, so a counter reads `CRITICAL 3` rather
  than the `3 CRITICAL` of the original request.~~ **Resolved 2026-09-20:** kept the
  design-system order rather than changing a shared primitive that the showcase and
  `FindingCard` also consume. Reopen by adding a `countFirst` prop to `SeverityBadge`
  if the exact wording matters.

## Implementation notes (2026-09-20)

Landed in `_components/FindingsPanel/` — `severityCounts()` + a third `severityFilter`
argument on `visibleFindings()` (`helpers.ts`), filter state and the counter row
(`FindingsPanel.tsx`), four style objects (`styles.ts`), three keys in
`messages/en/prReview.json`. Composes the existing `SeverityBadge` and `SEV` tokens,
so no new `@devdigest/ui` primitive and no showcase entry.

Covered by 23 tests (9 in `helpers.test.ts`, 14 in `FindingsPanel.test.tsx`); each was
watched failing, or mutation-tested where it passed on arrival. Verified in the running
stack on `acme/payments-api` PR #482 in both themes, console clean.

One out-of-scope fix came with it: filtering flips card focus, which surfaced a latent
React warning in `FindingCard/styles.ts` — `borderColor` is itself shorthand for the four
side colours and clashed with `borderLeftColor`, despite the "all-longhand" comment.
Now set per side.

## Implementation notes (2026-09-20, revision)

Counters and filter were one control: the `SeverityBadge` pills were themselves the
filter buttons. Split into the two rows above, per the design's own division of
labour — counter pills come from `RunFindings` (`prdetail_runs.jsx:57`), filter chips
from `FindingsPanel` (`findings.jsx:112`).

- Counter pill is a plain `span`, not `SeverityBadge`: the design's pill has no
  background and no label, and `SeverityBadge`'s `compact` variant still paints
  `SEV[..].bg`. It carries `data-severity` so tests can address a pill that has no
  text label, mirroring `data-finding-id` on `FindingCard`.
- Filter chips come from `FILTER_SEVERITIES` (`constants.ts`), not from the counts —
  that is the one place severity UI is deliberately NOT data-driven, so the row does
  not reshuffle between runs. It still lists the three wire-contract severities
  rather than `Object.keys(SEV)`, so `INFO` never appears.
- `panel.showOnlySeverity` / `panel.showAllSeverities` deleted; `panel.severityFilter`
  added. `selectSeverity` and the focus reset are untouched.
- `Chip` now sets `aria-pressed` whenever `active` is passed (`{...(active !==
  undefined && ...)}`, so chips without the prop are unaffected). This also upgrades
  the PR-list `FilterBar` chips, which are the same toggle pattern.
- The filter in effect is **derived** — `counts.some(...) ? severity : null` — not a
  `useState` corrected by a `useEffect`. The effect version rendered one frame with
  the chip pressed and the list empty before rolling back, which no test can catch:
  effects flush before assertions, so the intermediate frame never exists under
  jsdom. Deriving also removed the only remaining state-sync effect here.

21 tests in `FindingsPanel.test.tsx` (+9 unchanged in `helpers.test.ts`); the new
structural assertions were mutation-tested — chips-from-counts, a pill without its
dotted border, and a pill reverted to a clickable `SeverityBadge` each fail the suite.
