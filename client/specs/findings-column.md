# FINDINGS column on the PR list

**Status:** implemented · **Package:** client (server half already landed) · **Date:** 2026-09-20

## Problem

The PR list answers "how big" (SIZE), "how good" (SCORE) and "how much" (COST), but
not "what is wrong". A reviewer scanning a repo's open PRs sees a score ring of 61
and has to open the PR, wait for the detail page, and expand a run card before
learning whether that 61 is two criticals or nine style suggestions.

Findings already exist per review run on the detail page, behind
[`findings-severity-counters.md`](findings-severity-counters.md). Nothing surfaces
them at list level.

## Goals / non-goals

**Goals**

- A FINDINGS column between SCORE and STATUS: one chip per severity that has
  findings, with its count.
- A chip is a shortcut into that PR's findings tab.
- Hovering the cell previews the actual findings — enough to triage without opening
  the PR.
- The preview costs nothing until someone hovers, and nothing at all on repeat
  hovers.

**Non-goals**

- Acting on a finding from the list. The preview is read-only; accept / dismiss stay
  on the expanded run card, where the finding has its diff context.
- Deep-linking to a severity. `FindingsPanel` keeps its filter in local state, not
  in the URL, so `?severity=` has nothing to read it. A chip lands on the findings
  tab unfiltered.
- Sorting or filtering the list by findings.
- A new API endpoint. The counts ride on the existing list payload; the preview
  reuses `GET /pulls/:id/reviews`.
- Paginating the preview. It scrolls.

## Behaviour

1. **Chips.** `FINDINGS_SEVERITIES` order — CRITICAL → WARNING → SUGGESTION — one
   `SeverityBadge compact` per severity whose count is above zero, each wrapped in a
   button. `compact` means icon + number, no word, matching the design's counter
   pills.
2. **Zero counts are not drawn.** A reviewed, clean PR reports `{0,0,0}` and shows a
   dash, the same dash an unreviewed PR shows.
3. **`findings_counts === null`** (never reviewed) — a dash.
4. **Clicking a chip** pushes `/repos/:repoId/pulls/:number?tab=findings` and calls
   `e.stopPropagation()`. Without that the row's own `onClick` also fires and
   navigates to the PR without the tab.
5. **Hovering the cell** opens a preview card anchored under it, listing each
   finding: severity badge, title, `CategoryTag`, `file:start_line` in mono
   `var(--accent)`, `{N}% conf`, and the rationale clamped to two lines.
6. **Leaving the cell** closes it.
7. **The preview is read-only.** No buttons, no links, nothing focusable.

**Edge cases**

- *Row near the right edge of the viewport* — the card is clamped to
  `window.innerWidth - 408` so its 400px never runs off-screen, with an 8px floor on
  the left.
- *Chips present but the reviews fetch has not resolved* — nothing is drawn until
  there is at least one finding; no empty card flashes.
- *Several agents reviewed the PR* — the preview shows the union of each agent's
  **latest** review, which is the rule the server applies to `findings_counts`. Any
  other rule makes the card contradict the chips above it.
- *A `summary`-kind review* carries no findings and is skipped.
- *Dismissed findings* are included, matching both the server counts and the
  per-run counters on the detail page.

## Contracts & data

`PrMeta.findings_counts` — `{CRITICAL, WARNING, SUGGESTION}` or `null`, nullish in
Zod. Already present in **both** copies of `@devdigest/shared`; the server computes
it in `server/src/modules/pulls/routes.ts` over each agent's latest review. No
migration, no new endpoint, no LLM call.

`latestFindingsPerAgent()` in [helpers.ts](<../src/app/repos/[repoId]/pulls/helpers.ts>)
is the client mirror of that server rule. The two are coupled by intent, not by code
— a change to one is a change to both.

`messages/en/prReview.json`, existing `list` section — two new keys:

| Key | Purpose |
|---|---|
| `list.columns.findings` | Column header |
| `list.findingsPreviewTitle` | `"{count} findings"`, the preview's heading |

Severity words are not translated: a chip's `title` / `aria-label` is the wire token
(`CRITICAL`), the same pre-existing deviation noted in
[`findings-severity-counters.md`](findings-severity-counters.md).

## Acceptance criteria

- [x] FINDINGS sits between SCORE and STATUS in `COLUMN_KEYS`, and `GRID` gains a
      118px track in the same position — eight tracks, eight keys.
- [x] One chip per severity with a count above zero, in `FINDINGS_SEVERITIES` order.
- [x] A zero count draws no chip; `findings_counts === null` draws a dash.
- [x] A chip pushes `?tab=findings` and the row click does not also fire.
- [x] Hovering the cell shows the preview; leaving hides it.
- [x] The preview heading is `{count} findings` with an `AlertOctagon`.
- [x] Each item shows severity, title, category, `file:line` in mono `var(--accent)`,
      `{N}% conf`, and a two-line-clamped rationale.
- [x] The preview contains no Accept / Reject control, and no button at all.
- [x] `usePrReviews` is passed `null` until the first hover, so the request fires
      once and TanStack Query serves every later hover from cache.
- [x] The card is `position: fixed` — `position: absolute` is clipped by
      `s.tableCard`'s `overflow: hidden`.
- [x] Colors only via CSS vars; no new `@devdigest/ui` primitive, so no showcase
      entry.

## Tests

Client suite (vitest + jsdom, `fetch` mocked). `@testing-library/user-event` is not
installed — use `fireEvent`.

- `pulls/helpers.test.ts` (new) — `latestFindingsPerAgent()`: newest review per
  agent wins, agent-less reviews collapse to one bucket, severity ordering,
  `summary` reviews ignored, input not mutated, empty input.
- `PRRow/PRRow.test.tsx` (extend) — chips only for non-zero severities; `null`
  counts draw no chips; a chip navigates once, with the tab; the hook is passed
  `null` until hover; hover renders heading, title, `file:line` and `% conf`;
  mouse-leave hides it; the preview holds zero buttons.

No server, reviewer-core or e2e changes. CI: `client/**` path filter, `client.yml`.

## Implementation notes (2026-09-20)

Rebuilt from `97b6edc`, an earlier implementation that upstream reverted. Two
deliberate departures from it:

- **No `?severity=` deep link.** That commit pushed `?tab=findings&severity=CRITICAL`
  and had `FindingsPanel` read the param. The panel has since moved its filter to
  derived local state, so the param would be dead weight. The chip's tooltip changed
  with it: `panel.showOnlySeverity` ("Show only CRITICAL findings") was deleted along
  with the URL filter, and the button now carries the bare severity token, which is
  also what tests address it by.
- **`GRID` and `COLUMN_KEYS` already carried `cost`**, so the new 118px track is the
  sixth of eight, not of seven.

The preview markup follows `FindingsTooltip` (`prdetail_runs.jsx:38` in the design
bundle — see [docs/design-reference.md](../../docs/design-reference.md)), with two
changes: `var(--accent)` for the file location instead of `--accent-text`, and a
plain `{N}% conf` span instead of `ConfidenceNum`, whose status dot would read as
interactive on a read-only card.
