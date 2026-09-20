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

A counter row sits at the left of each `FindingsPanel` toolbar, on the same line as
the existing "Hide low confidence" toggle, separated from it by a divider.

1. **Default.** One counter per severity that has at least one finding in this run,
   ordered `CRITICAL → WARNING → SUGGESTION → INFO` (the existing `SEVERITY_ORDER`).
   Each shows the severity icon, its uppercase label and the count. No filter is
   active; the full list renders as it does today.
2. **Click a counter.** The list narrows to that severity. The clicked counter reads
   as selected; the others dim but stay clickable.
3. **Click the selected counter again.** The filter clears and the full list returns.
4. **Click a different counter while one is selected.** The filter switches to the
   new severity.
5. **Counts do not change when a filter is applied.** They describe the run, not the
   current view, so the reviewer can always see what else is there.

**Edge cases**

- *No findings in the run* — the counter row is not rendered at all. The existing
  empty state is unchanged.
- *Only one severity present* — a single counter renders. Clicking it still filters
  and clears normally, even though the visible list does not change.
- *"Hide low confidence" interacts with the counts.* Counts are computed **after**
  the confidence filter, so a counter's number always equals the number of rows you
  get by clicking it. Toggling the confidence switch re-computes the counters.
- *The selected severity disappears* — if switching "Hide low confidence" on removes
  every finding of the currently selected severity, that counter would vanish and
  leave the panel filtered to an unreachable empty list. The filter clears
  automatically in that case.
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
| `panel.showOnlySeverity` | Action label for an unselected counter, `{severity}` interpolated |
| `panel.showAllSeverities` | Action label for the selected counter (clears the filter) |

The severity words themselves come from `SEV[...].label` in the UI tokens and are not
translated — a pre-existing deviation from the i18n convention, left as-is.

## Acceptance criteria

- [x] Each `FindingsPanel` shows one counter per severity present in that run, with
      the correct count, ordered by `SEVERITY_ORDER`.
- [x] A severity with no findings in the run has no counter.
- [x] Clicking a counter filters that run's list to that severity.
- [x] Clicking the selected counter again clears the filter.
- [x] Clicking a different counter switches the filter.
- [x] Counter numbers are unaffected by the active severity filter.
- [x] Counts reflect the "Hide low confidence" setting.
- [x] The selected filter clears if that severity stops being available.
- [x] The counter row is absent when the run has no findings.
- [x] Each run's counters and filter are independent of other runs on the page.
- [x] The counter group exposes `role="group"` with a label; each counter exposes
      `aria-pressed` reflecting selection.
- [x] `j`/`k` focus resets to the top of the list when the filter changes.
- [x] Colors come only from CSS vars; no new `@devdigest/ui` primitive is added.

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
