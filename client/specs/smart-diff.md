# Smart Diff — client

**Status:** implemented · **Package:** client · **Date:** 2026-10-11

Sibling: [`server/specs/smart-diff.md`](../../server/specs/smart-diff.md) ·
requirements: [`docs/hw3/requirements.md`](../../docs/hw3/requirements.md)

## Problem

The **Files changed** tab shows a PR's files in GitHub's order — a lock file next to the logic —
and knows nothing about the review: findings live on **Agent runs** only, so reading the diff and
reading what the agent said about it are two separate trips.
[`DiffTab`](<../src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx>) renders a
flat [`DiffViewer`](../src/components/diff-viewer/DiffViewer/DiffViewer.tsx) and never calls
`usePrReviews`.

## Goals / non-goals

**Goals**

- Five role groups in the server's order, each with a role label, a hint and a file count; `docs`
  and `boilerplate` start collapsed.
- The review shown in the diff in three places: a counter on the group header, a dot on the file
  card, the finding as a comment under its line.
- A finding whose line is not in the patch is still shown — as a separate block at the end of
  its file.
- A `Smart order` / `Original order` switch.
- One comments switch for GitHub comments and finding comments.

**Non-goals**

- Classifying on the client. Roles and group order come from `GET /pulls/:id/smart-diff`; the
  client holds no patterns.
- The "This PR is large" banner, split proposals, pseudocode summaries — `smartDiff.largeTitle` /
  `largeBody` stay unused.
- Keeping the switch in the URL: [`pages.md`](pages.md) lists `?tab` and `?trace` as the page's
  only params.
- Moving `FindingCard` out of the PR route, new UI primitives, new dependencies, a new e2e flow.
- P3-1 (sticky header), P3-2 (one-line collapse), P3-3 (empty state). Scope is all of P1 and P2,
  plus P3-4 and P3-5.

## Behaviour

### 1. Data

| Needs | Hook | Call |
|---|---|---|
| Role groups | `useSmartDiff(prId)` — new, in [`lib/hooks/reviews.ts`](../src/lib/hooks/reviews.ts), key `["smart-diff", prId]` | `GET /pulls/:prId/smart-diff` |
| Findings | `usePrReviews(prId)` — existing, same `["reviews", prId]` cache the page already fills | `GET /pulls/:prId/reviews` |
| Accept / dismiss | `useFindingAction()` — existing | `POST /findings/:id/accept` · `/dismiss` |

`DiffTab` becomes the orchestrator: it calls the three hooks, owns the order switch and the
comments switch, and hands the diff viewer what to draw.

- **Files** are joined by `path`: each group's files are the `PrFile` objects (they carry the
  `patch`) from `pr.files`, in the order the smart-diff response lists them. A file in `pr.files`
  that the response does not mention is rendered after the last group as a plain card — never
  dropped. A path in the response with no `PrFile` is skipped.
- **Counting has one source: the smart-diff response.** A file has findings iff its
  `finding_lines` is non-empty. The group counter (§2) and the file dot (§3) read that and
  nothing else, so they count what the server counts — the same set as the PR list's FINDINGS
  column. *(Changed 2026-10-11 after the first architecture review: the client used to re-derive
  the counts from the reviews cache.)*
- **Finding cards** — the comment under a line, the row stripe and label, the outside-patch
  block — need the finding itself, so they come from `latestFindingsPerAgent(reviews)` in
  [`lib/findings.ts`](../src/lib/findings.ts): each agent's latest review, dismissed included.
  The helper and the severity order it uses live in `lib/` and are shared with the PR list.
  `/pulls/:id/reviews` returns an array of reviews, each with `findings[]`, not a flat list.
- Mutations that change which findings exist (delete review, delete run, a run settling)
  invalidate both `["reviews", prId]` and `["smart-diff", prId]`.
- While the smart-diff request is loading or has failed, the tab renders original order (§7) and
  the order switch is not rendered. The diff is never blocked on grouping.

### 2. Groups — `DiffRoleGroup`

New page-local component `_components/DiffRoleGroup/` (named so because `SmartDiffGroup` is
already a contract type). One per role, in response order — the client does not re-sort.

Header, left to right: chevron · role label · hint · **`● N`** · `N files`.

| Role | Label | Hint | Starts |
|---|---|---|---|
| `core` | Core logic | The substance of the change — review closely | open |
| `tests` | Tests | Proves the change works — check what's covered | open |
| `wiring` | Wiring | Hooks the core into the app | open |
| `docs` | Docs | Describes the change — read if behaviour changed | **collapsed** |
| `boilerplate` | Boilerplate | Generated / mechanical — skim | **collapsed** |

- Label, hint and `N files` come from `messages/en/prReview.json` → `smartDiff.*`; no literal in
  the component.
- `● N` is the number of **files** in the group that have at least one finding — not the number
  of findings. It is rendered only when `N ≥ 1`; before any review there is simply no counter.
- In a group that starts collapsed, the file cards start collapsed too (`defaultOpen={false}`);
  elsewhere a card keeps today's rule — open when `additions + deletions ≤ AUTO_EXPAND_MAX_LINES`.
- A group with no files renders its header with `0 files` and cannot be expanded.
- The header is a button with `aria-expanded`.

### 3. File card — the dot

[`FileCard`](../src/components/diff-viewer/FileCard/FileCard.tsx) gains optional `findings` and
`defaultOpen` props, plus `hasFindings`, which `DiffTab` sets from the smart-diff response. Such
a file shows a dot beside its path, in one neutral colour — `finding_lines` carries no severity —
with an accessible label. **No number** — the number in the header stays
the GitHub comment counter, and the two must not be confused.

### 4. The finding under its line

A finding is anchored to the row whose key is `RIGHT:${finding.start_line}` — the key
`keysForLine` already produces for added and context lines. `end_line` does not move the anchor.

- **The row**: a coloured stripe on the left and a label on the right — `CRITICAL` → `blocker`,
  `WARNING` → `warning`, `SUGGESTION` → `suggestion`. Colours from `SEV` (exported by the
  `@devdigest/ui` barrel; it lives in `primitives/tokens.ts`, not `Badge.tsx`). Several findings
  on one row → the worst severity sets the stripe and label.
- **The comment** under the row: the existing
  [`FindingCard`](<../src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx>),
  rendered `defaultExpanded` so severity, title and explanation are visible without a click,
  with Accept / Dismiss.
- `components/diff-viewer` is shared and must not import a page-local component, so the card
  arrives through a render prop:

```ts
// components/diff-viewer/comments.ts
export interface DiffFindingsApi {
  findings: FindingRecord[];
  renderFinding: (f: FindingRecord) => React.ReactNode;
}
// visibility is the one existing flag, DiffCommentApi.showComments
```

- Accept / Dismiss call `action.mutate({ findingId, action, prId })`. `prId` is not optional
  here: `useFindingAction` invalidates `["reviews", prId]` only when it is passed. After the
  refetch the card shows its accepted / dismissed state; such a finding stays in the diff, muted.

### 5. A finding outside the patch

A finding whose `RIGHT:${start_line}` key is not among the file's rendered lines is **not
dropped and not moved to a neighbouring line**. It goes into a separate block at the end of that
file's body.

- `partitionFindings(findings, renderedKeys) → { matched, outside }` in `comments.ts`, next to
  `partitionThreads`, which does the same for outdated GitHub comments.
- `outside` is rendered by a new `diff-viewer/FindingsOutsideDiff/`: a title, then each finding
  through `renderFinding`. It sits after the last code line and before `OutdatedComments`.
- A file with `patch: null` (binary, or not fetched) has no rendered lines, so all its findings
  land in the block, under the "No diff text available" note.
- Such a finding counts toward the file's dot and the group's counter like any other.
- A finding whose `file` is not in the PR at all has no card to attach to; it stays on Agent runs
  only and is counted nowhere on this tab.

### 6. One comments switch

Today the tab has a `Show comments` button that exists only when the PR has GitHub comments, and
comments start hidden. With findings:

- The button is rendered when `commentCount + findingCount > 0`, and its count is that sum.
- `showComments = userChoice ?? findingCount > 0` — a derived value, not state synced in an
  effect: shown by default when there is something from the review, hidden otherwise, and the
  user's click wins from then on.
- Off hides GitHub threads, finding comments and the outside-patch block together. The dot, the
  stripe with its label and the group counters stay.

This changes a documented default ("existing comments start hidden") — decided 2026-10-11.
[`pages.md`](pages.md) is updated with the implementation: the `diff` tab line, and the hooks
table (`useSmartDiff`, `usePrReviews` / `useFindingAction` in `DiffTab`).

### 7. Smart order / Original order

Two `Chip`s in a `role="group"` — `Smart order` · `Original order` — with `aria-pressed`. State
is `useState<"smart" | "original">("smart")` in `DiffTab`, beside `showComments`; it resets when
the tab unmounts, as `showComments` does.

- **Smart** — §2.
- **Original** — today's flat `DiffViewer` over `pr.files`, in the order `GET /pulls/:id`
  returned them (GitHub's order), no group headers, cards opening by `AUTO_EXPAND_MAX_LINES`.

The switch changes order and grouping only. Dots, stripes, finding comments and the outside-patch
block are the same in both modes.

### 8. P3 — only 4 and 5

- **P3-5** Already required by §2: labels and hints come from `prReview.json`.
- **P3-4** `useRefreshReviewsOnRunSettle(prId)` in `lib/hooks/reviews.ts`, called once from
  `page.tsx` so it works on every tab: when the PR's active runs go from some to none, invalidate
  `["reviews", prId]` and `["smart-diff", prId]`. Today reviews are refetched on run end only
  while the Agent runs tab is mounted.

P3-1, P3-2 and P3-3 are out of scope.

### 9. i18n and showcase

`messages/en/prReview.json` → `smartDiff`: `coreLabel` becomes `Core logic`; new `testsLabel`,
`docsLabel`; `coreHint`, `testsHint`, `wiringHint`, `docsHint`, `boilerplateHint`; `smartOrder`,
`originalOrder`; `filesWithFindings`; `showComments`, `hideComments` (replacing the literals in
`DiffTab`). Labels as in the prototype: Core logic / Tests / Wiring / Docs / Boilerplate. `filesCount` exists and is reused.

`messages/en/shell.json` → `diffViewer`: `hasFindings`, `findingsOutsideTitle`,
`severity.CRITICAL` / `.WARNING` / `.SUGGESTION` = `blocker` / `warning` / `suggestion`. These go
to `shell` because `FileCard` and `CodeLine` already read that namespace and the smoke test
mounts `DiffViewer` with `shell` messages only.

The changed `FileCard` and the new `DiffRoleGroup` get entries in `src/components/showcase`,
presentational only — the gallery is mounted without a query client.

## Contracts & data

No contract is authored here. The client copy of
[`contracts/brief.ts`](../src/vendor/shared/contracts/brief.ts) gets the same one-line edit as
the server's — `SmartDiffRole` with five values — exactly as in the
[server spec](../../server/specs/smart-diff.md#contracts--data). The two files are identical
today; keep them so.

Contract types are imported as **types only**. Role metadata in `DiffTab/constants.ts` is typed
`Record<SmartDiffRole, …>`, so a client copy left at three roles — or grown to six — fails
`pnpm typecheck`.

Files:

| Where | Change |
|---|---|
| `_components/DiffTab/` | `DiffTab.tsx` reworked; new `helpers.ts` (`groupFiles`, `pathsWithFindings`, `countFilesWithFindings`), `constants.ts` (role metadata) |
| `_components/DiffRoleGroup/` | new — `DiffRoleGroup.tsx`, `index.ts`, `styles.ts` |
| `[number]/page.tsx` | pass `repoFullName` and `headSha` to `DiffTab`; call `useRefreshReviewsOnRunSettle` |
| `components/diff-viewer/` | `comments.ts` (`DiffFindingsApi`, `partitionFindings`, `worstSeverity`), `FileCard`, `CodeLine`, `DiffViewer`, `styles.ts`, `index.ts`; new `FindingsOutsideDiff/` |
| `lib/hooks/reviews.ts` | `useSmartDiff`, `useRefreshReviewsOnRunSettle` |
| `lib/findings.ts` | `latestFindingsPerAgent` + `FINDINGS_SEVERITIES`, moved from the PR-list route |
| `specs/pages.md` | PR-detail hooks table and `diff` tab line |
| `components/showcase/` | entries for `FileCard` with findings and `DiffRoleGroup` |

`comments.ts`, `styles.ts` and `constants.ts` in `diff-viewer/` are extended; no new sibling file
is added there.

## Acceptance criteria

Numbered by [`docs/hw3/requirements.md`](../../docs/hw3/requirements.md).

- [x] **P1-1** Files changed shows five groups in the order core → tests → wiring → docs →
      boilerplate, each with its role label and its file count.
- [x] **P1-2** A lock file is inside the boilerplate group; the docs and boilerplate groups are
      collapsed when the tab opens.
- [x] **P1-3** After Run review, a group header shows the number of its files that have findings.
- [x] **P1-4** A file card with findings shows a dot indicator, without a number.
- [x] **P1-5** In an expanded file, under the line a finding points at, there is a comment with
      severity, title and explanation.
- [x] **P1-6** `Original order` puts the files back in GitHub's order; `Smart order` restores the
      groups.
- [x] **P2-2** *(client half)* `SmartDiffRole` has five values in the client `brief.ts`, identical
      to the server copy.
- [x] **P2-4** A row with a finding has a coloured stripe and a severity label — blocker /
      warning / suggestion.
- [x] **P2-5** Accept / Dismiss in the comment work and change the finding's state.
- [x] **P2-6** A finding whose line is not in the patch is shown as a separate block at the end
      of its file, including for a file with no patch.
- [x] **P2-7** Finding comments are hidden by the same switch as GitHub comments.
- [x] **P3-4** Counters update after Run review without a page reload.
- [x] **P3-5** Group labels come from `prReview.json` (`smartDiff`), not from the component.

Out of scope: P3-1, P3-2, P3-3. P2-1 and P2-3 are server-only; P1-7 and P2-8 are delivery (PR
description + demo video). The group counter and the file dot count the same findings as the PR
list's FINDINGS column. The full
coverage table is in the [server spec](../../server/specs/smart-diff.md#acceptance-criteria).

## Tests

Component tests beside each subject, jsdom + Testing Library, `fetch` mocked. jsdom does not
resolve `var(--…)`, so severity is asserted through `data-*` / `aria-*`, never a colour.

- `diff-viewer/comments.test.ts` — `partitionFindings`: a line in the patch → `matched` under
  `RIGHT:<n>`; a line outside → `outside`; no rendered keys → all `outside`. `worstSeverity`.
- `diff-viewer/FileCard/FileCard.test.tsx` — dot only with findings and without a number; the
  rendered finding follows the row for its line; stripe attribute and label per severity; the
  outside block, also with `patch: null`; `showComments: false` hides comments and the block but keeps
  the dot; `defaultOpen={false}` starts collapsed. `renderFinding` returns a plain node.
- `_components/DiffTab/helpers.test.ts` — `groupFiles` keeps the response order and appends
  unmatched files; two findings in one file count as **one** file.
- `_components/DiffRoleGroup/DiffRoleGroup.test.tsx` — label and hint equal the values in the
  real messages file; `aria-expanded`; counter value; no counter at zero; empty group.
- `_components/DiffTab/DiffTab.test.tsx` — hooks module mocked: five headers in order; docs and
  boilerplate collapsed, expanding boilerplate reveals the lock file; `Original order` → paths in
  `files` order and no headers, and back; severity, title and rationale visible without a click;
  Accept calls `mutate` with `findingId`, action and `prId`; one button hides GitHub threads and
  finding comments; no reviews → no counters and no dots; smart-diff failed → original order.
- `lib/hooks/reviews.test.ts` — P3-4 invalidation on the falling edge.
- Showcase smoke test covers the new gallery entries.
- e2e: no new flow. [`05-pr-diff.flow.json`](../../e2e/specs/05-pr-diff.flow.json) waits for
  `src/config.ts`, which classifies as `core` — an open group — so it must stay green; it is run
  with `./scripts/e2e.sh` as part of this work.

Gate: `pnpm typecheck && pnpm test` in `client/`.

## Open questions

Decided 2026-10-11: comments shown by default when the PR has findings (§6); hint copy for
`tests` and `docs` (§2); an empty group keeps its header with `0 files` (§2); dismissed findings
stay, muted, and count — as in the FINDINGS column (§1).

- **Section caption.** The prototype titles the section `REVIEWER-ORDERED DIFF`; the tab says
  `Files changed · N files`. Kept as `Files changed · N files` until someone asks otherwise;
  `smartDiff.groupedByRole` ("Smart Diff · grouped by role") is used as the order switch's
  `aria-label`.
- **Showcase imports page-local components.** `Showcase.tsx` imports `DiffRoleGroup` from the
  route folder, as it already does for `FindingCard`, `SkillCard` and `ConventionCard`. An
  existing repo pattern, left as is.
- **Original order offline.** GitHub's order is preserved only when `GET /pulls/:id` reaches
  GitHub; the offline path reads `pr_files` with no `ORDER BY`.
