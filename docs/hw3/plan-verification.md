| # | Requirement | Evidence (path:line) | Test (path:line) | Status |
|---|---|---|---|---|
| P1-1 | Five groups core → tests → wiring → docs → boilerplate, each with role label and file count | server/.../smart-diff/build-smart-diff.ts:20,36-39; client/.../DiffTab/DiffTab.tsx:142-157; client/.../DiffRoleGroup/DiffRoleGroup.tsx:47-48,59-61 | build-smart-diff.test.ts:10-35; server/test/smart-diff.it.test.ts:123-130; DiffTab.test.tsx:127-130,141-154; DiffRoleGroup.test.tsx:29-34 | PASS |
| P1-2 | Lock file = boilerplate; docs and boilerplate collapsed on open | server/.../smart-diff/constants.ts:24-29; client/.../DiffTab/constants.ts:13-18; DiffTab.tsx:152 | classify-file.test.ts:23-27; DiffTab.test.tsx:132-139 | PASS |
| P1-3 | After Run review, group header shows the number of files with findings | client/.../DiffTab/helpers.ts:36-47; DiffTab.tsx:52-55,151; DiffRoleGroup.tsx:49-58 | DiffTab/helpers.test.ts:40-47; DiffRoleGroup.test.tsx:53-59; DiffTab.test.tsx:217-221,263-268 | PASS |
| P1-4 | Dot on a file card with findings, no number | client/src/components/diff-viewer/FileCard/FileCard.tsx:106-113; diff-viewer/styles.ts:98-104; DiffTab.tsx:102 | FileCard.test.tsx:77-88; DiffTab.test.tsx:219,269-271 | PASS |
| P1-5 | Under the finding's line: comment with severity, title, explanation | diff-viewer/comments.ts:125-142; diff-viewer/CodeLine/CodeLine.tsx:93-99; DiffTab.tsx:81-90; client/.../FindingCard/FindingCard.tsx:58,62,80 | FileCard.test.tsx:90-98 (position); DiffTab.test.tsx:213-216 (title + rationale only). Severity in the comment: no assertion anywhere | PARTIAL |
| P1-6 | `Original order` restores GitHub order; `Smart order` restores the groups | DiffTab.tsx:40,93-94,131-136,161; diff-viewer/DiffViewer/DiffViewer.tsx:32-40 | DiffTab.test.tsx:183-190 | PASS |
| P1-7 | Open PR with description + demo video | — (delivery, no code artifact) | — | UNVERIFIED |
| P2-1 | Patterns and both orders in one constants file; classifier table test with the three disputed cases | server/.../smart-diff/constants.ts:21-92 (grep of server/client/reviewer-core `src` for `pnpm-lock`, `__snapshots__`, `.min.js`, `MATCH_RULES`, `DISPLAY_ORDER`: no other copy) | classify-file.test.ts:8-10,71-74 | PASS |
| P2-2 | Route body validates against `SmartDiff`; enum extended in both `brief.ts` | server/src/modules/reviews/routes.ts:136-143; server/src/vendor/shared/contracts/brief.ts:81; client/src/vendor/shared/contracts/brief.ts:81 (both read in full, lines 1-122 identical) | smart-diff.it.test.ts:122,140,170; server/test/contracts.test.ts:123-136; build-smart-diff.test.ts:76-79 | PASS (integration run: implementer only) |
| P2-3 | No model call; grouping works before the first review | server/src/modules/reviews/service.ts:183-194 (two repo reads + two pure functions); classify-file.ts:1-2; build-smart-diff.ts:1-3 | smart-diff.it.test.ts:112-134,176 (`llm.calls` empty); build-smart-diff.test.ts:10-15 | PASS (integration run: implementer only) |
| P2-4 | Row with a finding: coloured stripe + severity label | CodeLine.tsx:52,62-64,86-90; diff-viewer/styles.ts:107-124; client/messages/en/shell.json:46-50 | FileCard.test.tsx:100-115 | PASS |
| P2-5 | Accept / Dismiss work and change the finding's state | DiffTab.tsx:88; client/src/lib/hooks/reviews.ts:171-193; FindingCard.tsx:50-55,64-65,92-111 | DiffTab.test.tsx:224-228 (mutate args), 308-322 (dismissed state rendered); server/test/reviews.it.test.ts:371-380. The `["reviews", prId]` invalidation at reviews.ts:189-191 has no test | PARTIAL |
| P2-6 | Finding outside the patch = separate block at end of file, also with no patch | FileCard.tsx:87-92,129-131,144-146; diff-viewer/FindingsOutsideDiff/FindingsOutsideDiff.tsx:19-27 | diff-viewer/comments.test.ts:42-54; FileCard.test.tsx:117-133 | PASS |
| P2-7 | Finding comments hidden by the same switch as GitHub comments | diff-viewer/comments.ts:14-16; DiffTab.tsx:60,65,114-123; CodeLine.tsx:93,101-102; FileCard.tsx:144,147 | DiffTab.test.tsx:230-243; FileCard.test.tsx:147-159 | PASS |
| P2-8 | PR description: subagents used, what plan-verifier checked | — (delivery) | — | UNVERIFIED |
| P3-1 | Sticky group header | — (DiffRoleGroup/styles.ts:4-36 has no `position: sticky`; grep of the PR `_components` finds it only in PrDetailHeader/styles.ts:5) | — | OUT OF SCOPE |
| P3-2 | Finding comment collapses to one line | — (nothing added; FindingCard.tsx:56 header toggle pre-exists) | — | OUT OF SCOPE |
| P3-3 | Empty state "review not run yet" | — (DiffTab.tsx:109-164 has none) | — | OUT OF SCOPE |
| P3-4 | Counters update after Run review without reload | client/src/lib/hooks/reviews.ts:41-54; client/src/app/repos/[repoId]/pulls/[number]/page.tsx:49 | client/src/lib/hooks/reviews.test.ts:50-64 (hook only; the mount at page.tsx:49 has no test) | PASS |
| P3-5 | Group labels from `prReview.json`, not hard-coded | client/.../DiffTab/constants.ts:10-18; DiffTab.tsx:148-149; client/messages/en/prReview.json:56-65; no label literal in DiffRoleGroup.tsx:36-65 | DiffTab.test.tsx:141-154 (real messages file) | PASS |
| S-1 | Rule order: first match wins, boilerplate → tests → wiring → docs → core | constants.ts:21-72,75; classify-file.ts:48-54 | classify-file.test.ts:8-10,27 | PASS |
| S-2 | Two separate order constants | constants.ts:21 (`MATCH_RULES`), 90-92 (`DISPLAY_ORDER`) | classify-file.test.ts:8-10; build-smart-diff.test.ts:5,12,28-34 | PASS |
| S-3 | Three disputed cases as named rows | constants.ts:21-72 | classify-file.test.ts:8, 9, 10 | PASS |
| S-4 | Deviation: `**/dist/**` at depth → boilerplate | constants.ts:30 | classify-file.test.ts:13 | PASS |
| S-5 | Deviation: `**/build/**` at depth → boilerplate | constants.ts:31 | classify-file.test.ts:14 | PASS |
| S-6 | Deviation: `skills-lock.json` → boilerplate | constants.ts:29 | classify-file.test.ts:15 | PASS |
| S-7 | Deviation: `**/migrations/meta/**` → boilerplate | constants.ts:32 | classify-file.test.ts:16-17 | PASS |
| S-8 | Deviation: `*.spec.tsx` → tests | constants.ts:46 | classify-file.test.ts:18 | PASS |
| S-9 | Deviation: `index.tsx` → wiring | constants.ts:58 | classify-file.test.ts:19 | PASS |
| S-10 | Not widened: migration `.sql` stays core | constants.ts:32 (meta only) | classify-file.test.ts:20 | PASS |
| S-11 | One test row per pattern; real repo paths incl. `e2e/package-lock.json`, `server/src/modules/index.ts`; plain source → core | constants.ts:24-70 | classify-file.test.ts:23-65 (27, 46, 65) | PASS |
| S-12 | Pattern reading: basename at any depth, directory run at any depth, `name/**` root-anchored | classify-file.ts:20-41 | classify-file.test.ts:13-14,28-29,58,67-68 | PASS |
| S-13 | `classifyFile` purity: imports only `./constants` + the role type | classify-file.ts:1-2,48-54 | classify-file.test.ts:1-3 (no app, container or mock) | PASS |
| S-14 | No model call in function, service method or route | service.ts:183-194; routes.ts:139-142; build-smart-diff.ts:1-3 | smart-diff.it.test.ts:99-104,133,176 | PASS |
| S-15 | Always five groups, empty role = `files: []` | build-smart-diff.ts:20,36-39 | build-smart-diff.test.ts:10-15; smart-diff.it.test.ts:123-130,141 | PASS |
| S-16 | Path sort; `finding_lines` from `start_line`, ascending, de-duplicated; off-PR finding ignored; `pseudocode_summary` omitted | build-smart-diff.ts:13-18,27-32,38 | build-smart-diff.test.ts:37-63 | PASS |
| S-17 | Dismissed findings included in `finding_lines` | service.ts:188-192 (no filter on dismissal) | smart-diff.it.test.ts:160,172-175 | PASS |
| S-18 | Minimal `split_suggestion` | build-smart-diff.ts:42 | build-smart-diff.test.ts:14,71-74; smart-diff.it.test.ts:132 | PASS |
| S-19 | `latestReviewPerAgent` is the one server copy, called by the PR list and Smart Diff | server/src/modules/_shared/latest-reviews.ts:8-21; server/src/modules/pulls/routes.ts:8,140; service.ts:10,189 (grep of `server/src`: no second per-agent loop) | latest-reviews.test.ts:14-49 | PASS |
| S-20 | PR list `findings_counts` unchanged after the extraction | pulls/routes.ts:125-163,217-219 | server/test/pulls-findings-counts.it.test.ts:66-101; reviews.it.test.ts:219 | PASS (integration run: implementer only) |
| S-21 | Route: `IdParams` + `response: {200}`, 404, 422, empty `pr_files` → five empty groups, header comment line | routes.ts:16,136-143; service.ts:184-185 | smart-diff.it.test.ts:136-143,179-187 | PASS (integration run: implementer only) |
| S-22 | `SmartDiffRole` five values in both copies; role metadata typed over the enum | both brief.ts:81; client/.../DiffTab/constants.ts:6-19 | contracts.test.ts:123-136 | PASS |
| C-1 | Files joined by path; unmentioned file rendered after the last group; response path without a `PrFile` skipped | DiffTab/helpers.ts:13-30; DiffTab.tsx:93,158 | helpers.test.ts:16-30; DiffTab.test.tsx:200-204 | PASS |
| C-2 | Smart-diff loading or failed → original order, no switch | DiffTab.tsx:93-94,129,140,161 | DiffTab.test.tsx:192-198 | PASS |
| C-3 | Counting has one source: group counter and dot read `finding_lines` only | helpers.ts:36-47; DiffTab.tsx:52-55,102,151,161; DiffViewer.tsx:38 | DiffTab.test.tsx:253-281; helpers.test.ts:40-52 | PASS |
| C-4 | Finding cards from `latestFindingsPerAgent` in `lib/findings.ts`, shared with the PR list | client/src/lib/findings.ts:5,12-29; DiffTab.tsx:15,47-50; client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:20,39 | client/src/lib/findings.test.ts:53-112; DiffTab.test.tsx:283-306 | PASS |
| C-5 | Delete review, delete run and run settle invalidate both `["reviews"]` and `["smart-diff"]` | lib/hooks/reviews.ts:48-51,94-98,114-117 | lib/hooks/reviews.test.ts:50-64,85-103 | PASS |
| C-6 | Counter counts FILES, rendered only when N ≥ 1 | helpers.ts:45-47; DiffRoleGroup.tsx:49-58 | helpers.test.ts:44-47; DiffRoleGroup.test.tsx:53-59; DiffTab.test.tsx:265-268 (two lines → 1) | PASS |
| C-7 | Cards inside a collapsed-by-default group start collapsed | DiffTab.tsx:154; FileCard.tsx:65-67 | DiffTab.test.tsx:156-166 | PASS |
| C-8 | Empty group: `0 files`, cannot expand; header is a button with `aria-expanded` | DiffRoleGroup.tsx:33-45,63 | DiffRoleGroup.test.tsx:36-43,61-68 | PASS |
| C-9 | Exact label + hint copy for all five roles | prReview.json:56-65 (ten strings match the spec table verbatim) | DiffTab.test.tsx:141-154 (ten literals) | PASS |
| C-10 | Remaining i18n keys: `smartOrder`, `originalOrder`, `filesWithFindings`, `showComments`, `hideComments`; shell `hasFindings`, `findingsOutsideTitle`, `severity.*` | prReview.json:66-70; shell.json:44-50; DiffTab.tsx:121,132,135; DiffRoleGroup.tsx:54; FileCard.tsx:109; FindingsOutsideDiff.tsx:22; CodeLine.tsx:88 | DiffTab.test.tsx:171-172,233,241; FileCard.test.tsx:86,106,114,120 | PASS |
| C-11 | Dot: one neutral colour, accessible label, no number | FileCard.tsx:106-113; diff-viewer/styles.ts:98-104 | FileCard.test.tsx:82-88; DiffTab.test.tsx:271 | PASS |
| C-12 | Anchor `RIGHT:${start_line}`; `end_line` does not move it; worst severity wins; card arrives by render prop | comments.ts:30-33,125-156; CodeLine.tsx:52,62-64,93-99; FileCard.tsx:5-24 (no page-local import) | comments.test.ts:28-40,62-72; FileCard.test.tsx:90-107 | PASS |
| C-13 | Outside-patch block incl. `patch: null`, under the "No diff text" note | FileCard.tsx:87-92,129-131,144-146 | FileCard.test.tsx:117-133 | PASS |
| C-14 | Outside block sits before `OutdatedComments` | FileCard.tsx:144-147 | FileCard.test.tsx:135-145 | PASS |
| C-15 | A finding whose file is not in the PR is counted nowhere on the tab | DiffTab.tsx:47-50,58; build-smart-diff.ts:27-31 | Server half: build-smart-diff.test.ts:60-63; smart-diff.it.test.ts:161,172-175. Client filter at DiffTab.tsx:49: no test | PARTIAL |
| C-16 | One visibility flag `DiffCommentApi.showComments`; button when `commentCount + findingCount > 0`; default `userChoice ?? findingCount > 0`; dot, stripe and counter stay when off | comments.ts:14-16,30-33 (no second flag on `DiffFindingsApi`); DiffTab.tsx:42,57-60,107,114-123 | DiffTab.test.tsx:230-243,326-339; FileCard.test.tsx:147-159 | PASS |
| C-17 | Smart/Original switch: two Chips in `role="group"`, `aria-pressed`, default smart; findings identical in both modes | DiffTab.tsx:40,130-137,161; client/src/vendor/ui/primitives/Chip.tsx:26 | DiffTab.test.tsx:168-181,183-190,245-250 | PASS |
| C-18 | Dismissed finding stays in the diff, muted, and counts | FindingCard.tsx:50-55,65; FindingCard/styles.ts:19; service.ts:188-192 | DiffTab.test.tsx:308-322 (shown, tagged, counted; the muted style itself is not asserted) | PASS |
| C-19 | Showcase entries for FileCard-with-findings and DiffRoleGroup, outside the query client | client/src/components/showcase/Showcase.tsx:334-377; showcase/constants.ts:52-88 | client/src/test/smoke.test.tsx:15-27 (mounts the gallery; no assertion on the new entries) | PASS |
| C-20 | `pages.md` updated: hooks table and `diff` tab line | client/specs/pages.md:296,297,300,305,319 | — (doc) | PASS |
| C-21 | e2e flow `05-pr-diff` stays green | e2e/specs/05-pr-diff.flow.json:13 waits for `src/config.ts`; no rule in constants.ts:21-72 matches it → core, an open group (DiffTab/constants.ts:10) | pending run | UNVERIFIED |

Paths are relative to `/home/oles/Projects/dev-digest`. `client/.../X` means `client/src/app/repos/[repoId]/pulls/[number]/_components/X`; `server/.../smart-diff/` means `server/src/modules/reviews/smart-diff/`.

## Summary

- **Criteria (20):** 13 PASS, 2 PARTIAL (P1-5, P2-5), 2 UNVERIFIED (P1-7, P2-8 — delivery), 3 OUT OF SCOPE (P3-1, P3-2, P3-3).
- **Spec items (43):** 41 PASS, 1 PARTIAL (C-15), 1 UNVERIFIED (C-21, e2e pending).
- **Not every P1 row is PASS.** P1-1 to P1-4 and P1-6 are PASS. P1-5 has its code in place, but the severity part has no test. P1-7 is delivery.
- **No MISSING row.** All three PARTIALs are test gaps; the behaviour is on the cited lines.
- **Nothing was run by me.** The three `*.it.test.ts` files skip without Docker (smart-diff.it.test.ts:17-18, pulls-findings-counts.it.test.ts:16-17), so P2-2, P2-3, S-20 and S-21 rest on your reported run.
- **Not checked:** I have no diff tool, so "no DB change, no migration" from the server spec is unconfirmed.

## Gaps closed since the first pass

| Gap | Closed? | Test (path:line) |
|---|---|---|
| Dismissed finding stays muted and counted | Yes — shown, tagged `dismissed`, counted in button, group counter and dot. The muted style (FindingCard/styles.ts:19) is not asserted. | DiffTab.test.tsx:308-322; server side smart-diff.it.test.ts:160,172-175 |
| PR-list `findings_counts` with two agents and two reviews | Yes | server/test/pulls-findings-counts.it.test.ts:66-101 |
| Same finding set with several reviews | Yes — cards on the client, `finding_lines` on the server | DiffTab.test.tsx:283-306; smart-diff.it.test.ts:145-177 |
| Collapsed-group cards at DiffTab level | Yes | DiffTab.test.tsx:156-166 |
| All ten labels/hints as literals | Yes | DiffTab.test.tsx:141-154 |
| Outside block before OutdatedComments | Yes | FileCard.test.tsx:135-145 |
| `aria-pressed` + `role="group"` | Yes | DiffTab.test.tsx:168-181 |

## Notes on rows that are not PASS

- **P1-5 (PARTIAL)** — Title, rationale and position under the line are tested. Severity in the comment is not.
  - The test named "shows severity, title and rationale…" (DiffTab.test.tsx:213-222) asserts only title and rationale.
  - FindingCard.test.tsx:39-49 asserts title, file:line and category, not the badge.
  - The card draws severity as `SeverityBadge … compact` (FindingCard.tsx:58), which is icon-only (Badge.tsx:80 renders no label when `compact`). The text label sits on the code row (CodeLine.tsx:86-90), tested only with a stub card (FileCard.test.tsx:100-115).
  - Removing the badge from the card fails no test.
  - To pass: in DiffTab.test.tsx:213, assert the row's `[data-finding-label]` reads `blocker` and the card contains its severity badge.
  - Needs runtime check: on Files changed, confirm the icon-only badge plus the row label read as severity.
- **P2-5 (PARTIAL)** — The mutate call, the server endpoints and the dismissed rendering are each tested. The link between them is not: `useFindingAction`'s `onSuccess` invalidation (reviews.ts:189-191) has no test, and every component test mocks the hook.
  - Deleting that line would leave the card unchanged until reload and fail nothing.
  - To pass: a case in lib/hooks/reviews.test.ts asserting `["reviews", "pr1"]` is invalidated after `mutateAsync({ findingId, action, prId })`.
  - Needs runtime check: click Accept on a finding comment and see the `accepted` tag without a reload.
- **C-15 (PARTIAL)** — The server ignores off-PR findings and that is tested. The client filter (DiffTab.tsx:49), which keeps such a finding out of the comments-button count, has no test.
  - To pass: a DiffTab test with one review finding on a path outside `files`, asserting no comments button.
- **C-21 (UNVERIFIED)** — pending `./scripts/e2e.sh`. Static evidence only: the awaited path classifies as core and that group starts open. Whether the seeded file is within `AUTO_EXPAND_MAX_LINES` does not matter for the path text.
- **P1-7, P2-8 (UNVERIFIED)** — need the opened PR in the fork and the demo video.
- **P3-1, P3-2, P3-3 (OUT OF SCOPE)** — confirmed absent, as agreed.

## Point 4

**Implemented without a spec item asking for it**

- `client/.../DiffTab/DiffTab.tsx:70` | posting a GitHub comment forces `userChoice` to `true`; §6 names only the user's click.
- `client/.../DiffTab/DiffTab.tsx:93` | grouping also requires `files.length > 0`, so a PR with no files gets no switch and no group headers; §2 and §7 do not state this.
- `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx:18,23-24,38` | new `findingPaths` prop; the spec lists DiffViewer as changed but names no prop.
- `client/.../DiffTab/styles.ts:1-13` | new file, absent from the spec's Files table.
- `client/.../DiffRoleGroup/styles.ts:29-33` | group counter coloured `var(--warn)`; the spec fixes a colour only for the dot.
- `CodeLine.tsx:57,63-64`, `FileCard.tsx:103,110`, `FindingsOutsideDiff.tsx:21`, `DiffRoleGroup.tsx:40,51` | `data-*` attributes used as test hooks.
- `server/.../smart-diff/classify-file.test.ts:66-68,76-78` | extra rows (`package.json`, `src/distribution/a.ts`, `src/docs/a.ts` → core) and an "is deterministic" case beyond the spec's list.
- `server/test/smart-diff.it.test.ts:184-187` | a 422 case; the spec's test list names only the 404.
- `server/specs/README.md:15`, `client/specs/README.md:17` | index rows for the two specs.

**In the specs but skipped or not fully done**

- Client spec, Tests: the `DiffTab.test.tsx` item "severity … visible without a click" — severity is not asserted (see P1-5).
- Client spec, Tests: "Showcase smoke test covers the new gallery entries" — the gallery is mounted but nothing asserts on the entries (smoke.test.tsx:22-26).
- Client spec, Tests: e2e run "as part of this work" — pending.
- Server spec: nothing skipped that I could find.

**Code and the updated specs disagree**

- `client/specs/smart-diff.md:221` lists `findingsByPath` in `DiffTab/helpers.ts`. No such function exists; the code has `pathsWithFindings` (helpers.ts:36). This is a leftover from before the single-source change.
- `client/specs/smart-diff.md:298-299` calls `smartDiff.groupedByRole` unused. DiffTab.tsx:130 uses it as the switch group's `aria-label`.
- `server/specs/smart-diff.md:108-111` describes three pattern shapes. `**/*.test.ts` and `**/*.md` are a fourth (`**/glob` → basename), handled at classify-file.ts:38-40 and documented only in constants.ts:8.
- `server/specs/smart-diff.md:167` cites pulls/routes.ts lines 119-143 for the inline rule. After the extraction the call is at pulls/routes.ts:140 — a stale line reference only.

Both spec files are uncommitted in the working tree per git status, so this was verified against the on-disk versions.

Files read, all under `/home/oles/Projects/dev-digest/`:

- `docs/hw3/requirements.md`, `docs/hw3/plan-verification.md`, `server/specs/smart-diff.md`, `client/specs/smart-diff.md`, `client/specs/pages.md`
- `server/src/modules/_shared/latest-reviews.ts` (+test), `server/src/modules/reviews/smart-diff/*`, `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/service.ts`, `server/src/modules/pulls/routes.ts`
- both `vendor/shared/contracts/brief.ts`
- `server/test/contracts.test.ts`, `server/test/smart-diff.it.test.ts`, `server/test/pulls-findings-counts.it.test.ts`, `server/test/reviews.it.test.ts`
- `client/src/lib/findings.ts` (+test), `client/src/lib/hooks/reviews.ts` (+test), `client/src/components/diff-viewer/**`
- `client/src/app/repos/[repoId]/pulls/[number]/_components/{DiffTab,DiffRoleGroup,FindingCard}/**`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
- `client/messages/en/prReview.json`, `client/messages/en/shell.json`, `client/src/components/showcase/{Showcase.tsx,constants.ts}`, `client/src/test/smoke.test.tsx`, `client/src/vendor/ui/primitives/{Chip,Badge}.tsx`
- `e2e/specs/05-pr-diff.flow.json`

---

*Orchestrator note, added after the verifier finished (not part of its report):* `./scripts/e2e.sh` was run on 2026-10-11 with `AGENT_BROWSER_BIN` set — **8/8 flows passed**, including `05-pr-diff`, so C-21 is green at runtime. The server gate (typecheck, unit, integration on Docker) and the client gate (typecheck, tests) were re-run by the orchestrator before the `docs(hw3): second review pass` commit.

## Closed after review

Added by the orchestrator after the second pass; the reviewers' conclusions above are unchanged
and no third review pass was run. All items landed in the commit
`fix(smart-diff): refresh counters after run + close remaining test gaps`.

| Item | Closed by |
|---|---|
| N2 (architecture review) — `useRunReview.onSuccess` did not invalidate `["smart-diff", prId]` | `client/src/lib/hooks/reviews.ts` (`useRunReview`); test `client/src/lib/hooks/reviews.test.ts:122` |
| N1 (architecture review) — severity order copied in `FindingsPanel/constants.ts` | `FILTER_SEVERITIES` and `SEVERITY_ORDER` now derive from `FINDINGS_SEVERITIES` in `client/src/lib/findings.ts`; existing FindingsPanel tests |
| P1-5 — severity in the finding comment not asserted | `DiffTab.test.tsx:213` — row label reads `blocker`, card contains the CRITICAL badge icon |
| P2-5 — `useFindingAction` invalidation untested | `client/src/lib/hooks/reviews.test.ts:132` — accept and dismiss both invalidate `["reviews", prId]` |
| C-15 — client filter for findings on files outside the PR untested | `DiffTab.test.tsx:330` — no card, no comments button |
| C-21 — e2e flow `05-pr-diff` | `./scripts/e2e.sh` 8/8 on 2026-10-11 |

Not touched, by the owner's decision: N3, N4.
