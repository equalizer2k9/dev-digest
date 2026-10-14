# Architecture review, second pass: Smart Diff (branch feat/homework-3, all committed)

Method: I read the 15 files the fix pass changed, plus `DiffTab/constants.ts`, `FindingsPanel/constants.ts`, `reviews/service.ts` and `Showcase.tsx` where they bear on a finding. I checked each of #1–#12 against the code as it is now, not against the fix list. I greped client `src/` for leftover users of the moved or removed symbols. I did not run typecheck or tests.

## TABLE 1: status of the first-pass findings

| # | Severity | Finding (short) | Status | Evidence path:line |
|---|---|---|---|---|
| 1 | major | "Latest review per agent" rule duplicated; client never read `finding_lines` | PARTLY FIXED | Dot and counter are now sourced from `finding_lines`: `DiffTab/helpers.ts:36-42` (`pathsWithFindings`), `DiffTab.tsx:52-55`, `:102`, `:151`, `:161`. The rule is still implemented twice (`server/.../service.ts:189` and `client/src/lib/findings.ts:12-29`). The cards and the show/hide total still come from `usePrReviews` (`DiffTab.tsx:47-50`, `:58`). |
| 2 | major | Shared `Showcase` imports route-private `DiffRoleGroup` | UNCHANGED — existing repo pattern (FindingCard, SkillCard, ConventionCard), accepted by the owner | `Showcase.tsx:56` (siblings `:55`, `:58-60`) |
| 3 | minor | Detail tab reached up into the list route's `pulls/helpers.ts` | FIXED | `client/src/lib/findings.ts:12`. `pulls/helpers.ts:1-26` no longer holds it. `DiffTab.tsx:15` and `PRRow.tsx:20` both import `@/lib/findings`. The test moved to `lib/findings.test.ts`. No `lib/` file imports from `app/`. |
| 4 | minor | `comments.ts` (non-fixed name) hosts finding logic; `styles.ts` imports a type from it | UNCHANGED — NOT IN SCOPE | `comments.ts:125-156` (`partitionFindings`, `FindingSeverity`, `worstSeverity`); `styles.ts:3` `import type { FindingSeverity } from "./comments"` |
| 5 | minor | `SEVERITY_RANK` was a third copy of the severity order | PARTLY FIXED | `SEVERITY_RANK` is gone. `worstSeverity` (`comments.ts:151-153`) reuses `FINDINGS_SEVERITIES`, now exported from `lib/findings.ts:5`. Two other copies remain: `FindingsPanel/constants.ts:4-9` (`SEVERITY_ORDER`) and `:23` (`FILTER_SEVERITIES`). See N1. |
| 6 | minor | Viewer is handed raw `FindingRecord[]`, casts severity; `show` duplicated `showComments` | PARTLY FIXED | The duplicate flag is gone: `DiffFindingsApi` is now `{findings, renderFinding}` (`comments.ts:30-33`) and visibility reads `commenting.showComments` (`CodeLine.tsx:93`, `FileCard.tsx:144`). The leak remains: `comments.ts:31` (`FindingRecord[]`), `:132` (`f.start_line`), `:150` (`f.severity as FindingSeverity`), `FileCard.tsx:84` (`f.file`). |
| 7 | minor | `DISPLAY_ORDER` hand-kept, `!` assertion | FIXED | `server/.../smart-diff/constants.ts:81-92`: `Record<SmartDiffRole, number>` drives the order, so a missing role fails typecheck. `build-smart-diff.ts:20-23,27` builds `byRole` as a `Record` and the `!` is gone. |
| 8 | minor | `split_suggestion` stub reads like a computed claim | PARTLY FIXED | A comment now marks the stub at `build-smart-diff.ts:40-41`, and `docs/hw3/requirements.md` exists. The contract (`server/src/vendor/shared/contracts/brief.ts:108`) is unchanged, so a consumer still cannot tell stub from computed. `pseudocode_summary` (`brief.ts:86`) is still never filled. |
| 9 | nit | `renderedKeys` built twice; per-card re-filter by path | UNCHANGED — NOT IN SCOPE | `FileCard.tsx:76-77` and `:88-89` build the keys; `:83-86` filters by `f.file` |
| 10 | nit | `ROLE_META` message keys are plain strings | UNCHANGED — NOT IN SCOPE | `DiffTab/constants.ts:8,10-18` (the role key is exhaustive; `labelKey`/`hintKey` are `string`) |
| 11 | nit | `DiffRoleGroup` is a sibling of `DiffTab`, not a child | UNCHANGED — NOT IN SCOPE | `DiffTab.tsx:18` `from "../DiffRoleGroup"` |
| 12 | nit | `smartDiffForPull` over-fetches via `reviewsForPull` (usage aggregation) | UNCHANGED — NOT IN SCOPE | `server/.../service.ts:187` |

## TABLE 2: new findings from this pass

| # | Severity | Area | File:line | Finding | Suggested direction |
|---|---|---|---|---|---|
| N1 | minor | Duplicated constant / misleading doc | `client/src/lib/findings.ts:3-5`, `:24-27`; `FindingsPanel/constants.ts:4,23` | The new doc comment calls `FINDINGS_SEVERITIES` "the one source for every place that sorts or ranks findings". That is not true: `SEVERITY_ORDER` and `FILTER_SEVERITIES = ["CRITICAL","WARNING","SUGGESTION"]` sit in `FindingsPanel/constants.ts`. `latestFindingsPerAgent` also has its own inline `rank` (`lib/findings.ts:24-27`), and `worstSeverity` repeats the `indexOf` ranking (`comments.ts:151-153`). `FindingSeverity` is declared in `comments.ts:144` instead of next to the constant. | Export `FindingSeverity` and one `severityRank` from `lib/findings.ts`. Reuse them in `comments.ts` and `FindingsPanel`. This also resolves the `styles.ts` to `comments.ts` import (#4). If that is deferred, soften the doc comment. |
| N2 | minor | Cache coherence after the source split | `client/src/lib/hooks/reviews.ts:164-166` | Dots and counters now come from the `["smart-diff", prId]` query, but `useRunReview.onSuccess` invalidates only `["reviews", prId]`. Smart-diff is refreshed only when the active-runs poll sees a some-to-none transition (`reviews.ts:41-54`). If the cards update before that, the cards and the dot/counter could disagree for a while. I did not check whether `POST /review` returns before the run finishes, so this is a risk, not a confirmed bug. | Invalidate `["smart-diff", prId]` in `useRunReview.onSuccess` too, as `useDeleteRun` and `useDeleteReview` already do. |
| N3 | nit | Coupling | `CodeLine.tsx:93`, `FileCard.tsx:144` | After removing `show`, finding visibility depends on the comment API object: `(commenting?.showComments ?? true)`. `DiffFindingsApi` cannot be hidden on its own, and the `?? true` default makes behaviour depend on whether `commenting` was passed. | Acceptable as the owner's chosen minimal fix. If #6 is revisited later, give `DiffFindingsApi` its own visibility or rename the flag to a neutral "show annotations". |
| N4 | nit | Unchecked invariant | `server/.../smart-diff/constants.ts:81-92` | `DISPLAY_POSITION` is checked for completeness, but not for unique values. Duplicate numbers give an unstable order. `Object.keys(...) as SmartDiffRole[]` is a cast. | Optional: use an ordered tuple with `satisfies readonly SmartDiffRole[]`, or leave as is. |

## Evidence for anything not FIXED

**#1 (partly).**
- The counting half is done. `pathsWithFindings` reads `f.finding_lines.length > 0` (`DiffTab/helpers.ts:39`). Its result feeds the file dot via `hasFindings` (`DiffTab.tsx:102`, `FileCard.tsx:106`) and the group counter via `countFilesWithFindings` (`DiffTab.tsx:151`). The `DiffViewer` path gets it through `findingPaths` (`DiffTab.tsx:161`, `DiffViewer.tsx:38`).
- The tests also pin this ("draws the dot and counter from finding_lines alone": `DiffTab.test.tsx:254,263`).
- The rule is still duplicated for the cards. The server filter and sort are at `service.ts:189`, the client's at `lib/findings.ts:13-23`. Both sides count dismissed findings, so they agree today.
- The remaining double source is what the owner described ("`usePrReviews` only for finding cards"), so I rate it partly fixed rather than unchanged.

**#4 (not in scope).** `comments.ts` is still a non-fixed internals file. It now imports `FINDINGS_SEVERITIES` from `lib/findings` (`:7`). `styles.ts:3` still type-imports from it, so the inverted dependency is intact.

**#5 (partly).** See N1. The removal the owner asked for was done. The cross-package consolidation was not, and the new doc comment claims more than the code delivers.

**#6 (partly).** Only the duplicate flag was removed, as intended. The wire-shape leak into the shared viewer is unchanged (`comments.ts:31,132,150`; `FileCard.tsx:84`).

**#8 (partly).** The comment is accurate but lives only in the server builder. The contract at `brief.ts:108` still has no marker, so a client reading `too_big: false` cannot tell it is a stub.

**#2, #9, #10, #11, #12.** The code is as in the first pass (lines in Table 1). #2 is accepted by the owner. The rest are not in scope by the owner's decision.

## Checked and found sound

- `lib/findings.ts` placement. `lib/` already holds flat non-fixed modules (`model-label.ts`, `github-urls.ts`, `feature-models.ts`). It imports only `@devdigest/shared` types. A grep for `app/` imports under `client/src/lib` finds none. The test sits beside it (`lib/findings.test.ts`).
- No leftover `latestFindingsPerAgent` or `FINDINGS_SEVERITIES` in `pulls/helpers.ts` or `pulls/constants.ts`. `pulls/helpers.ts` only imports `./constants`. The `PrMeta` re-export in `pulls/constants.ts:59-60` is unchanged.
- Both users import the same module: `PRRow.tsx:20` and `DiffTab.tsx:15`. The `PRRow` to `../../constants`, `../../helpers`, `../../styles` imports are legitimate route-root reach.
- No `SEVERITY_RANK` remains anywhere in `client/src`. No dead `show` field or reference to `findings.show` remains (grep).
- `DiffTab` is thin. It uses fixed internals only (`./constants`, `./helpers`, `./styles`). Hooks are called through `@/lib/hooks/reviews`. There is no `fetch` and no `API_BASE`.
- `DiffViewer` and `FileCard` import nothing from `app/` or `_components`. `FindingCard` still arrives via the `renderFinding` render prop (`DiffTab.tsx:81-90`, `Showcase.tsx:346`).
- `useSmartDiff` and the query key `["smart-diff", prId]` are invalidated consistently in `useRefreshReviewsOnRunSettle`, `useDeleteRun` and `useDeleteReview` (`reviews.ts:50,97,116`).
- `DISPLAY_ORDER` is still a `readonly SmartDiffRole[]`, so `build-smart-diff.ts` consumers are unchanged. `buildSmartDiff` is still pure.
- The `finding_lines` contract is untouched in this pass. I did not diff the two `vendor/shared` copies, since this pass changed neither (grep shows `client/.../brief.ts:89`).
- Showcase (`Showcase.tsx:339-376`) was updated to the new `FileCard` props (`hasFindings`, `findings: {findings, renderFinding}`), with no stale `show`.

Verdict: PASS — no blocker. Of the 12 first-pass findings, 3 are fixed, 4 are partly fixed (#1, #5, #6, #8) and 5 are unchanged by the owner's decision (#2, #4, #9–#12 less #4 counted below). Counting exactly: FIXED #3 and #7 (2); PARTLY FIXED #1, #5, #6, #8 (4); UNCHANGED #2, #4, #9, #10, #11, #12 (6). New findings: 0 blocker, 0 major, 2 minor (N1, N2), 2 nit (N3, N4).
