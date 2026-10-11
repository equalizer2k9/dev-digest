| # | Requirement | Evidence (path:line) | Test (path:line) | Status |
|---|---|---|---|---|
| P1-1 | Five groups core → tests → wiring → docs → boilerplate, each with role label and file count | server/src/modules/reviews/smart-diff/build-smart-diff.ts:32-36; client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:131-146; .../DiffRoleGroup/DiffRoleGroup.tsx:47-61 | build-smart-diff.test.ts:10-35; DiffTab.test.tsx:116-119; DiffRoleGroup.test.tsx:29-34 | PASS |
| P1-2 | Lock file = boilerplate; docs and boilerplate collapsed on open | server/.../smart-diff/constants.ts:24-29; .../DiffTab/constants.ts:13-18; DiffTab.tsx:141 | classify-file.test.ts:23-27; DiffTab.test.tsx:121-128 | PASS |
| P1-3 | Group header shows count of files with findings | .../DiffTab/helpers.ts:44-49; DiffTab.tsx:140; DiffRoleGroup.tsx:49-58 | helpers.test.ts:52-61; DiffRoleGroup.test.tsx:53-59; DiffTab.test.tsx:163-164 | PASS |
| P1-4 | Dot on a file card with findings, no number | client/src/components/diff-viewer/FileCard/FileCard.tsx:104-112 | FileCard.test.tsx:60-73 | PASS |
| P1-5 | Comment under the finding's line: severity, title, explanation | diff-viewer/comments.ts:125-142; diff-viewer/CodeLine/CodeLine.tsx:93-99; DiffTab.tsx:77-86; .../FindingCard/FindingCard.tsx:58,62,80 | FileCard.test.tsx:75-83; DiffTab.test.tsx:159-162; FindingCard.test.tsx:39 | PASS |
| P1-6 | Original order restores GitHub order | DiffTab.tsx:40,89-90,118-127,149-151 | DiffTab.test.tsx:130-137 | PASS |
| P1-7 | Open PR with description + demo video | — (delivery, no code artifact) | — | UNVERIFIED |
| P2-1 | Patterns + both orders in one constants file; classifier table test with three disputed cases | smart-diff/constants.ts:21-84 (only location; grep of server/client/reviewer-core src found no other copy) | classify-file.test.ts:8-10, 71-74 | PASS |
| P2-2 | Route body validates against SmartDiff; enum extended in both brief.ts | server/src/modules/reviews/routes.ts:136-143; server/src/vendor/shared/contracts/brief.ts:81; client/src/vendor/shared/contracts/brief.ts:81 (both files read in full, identical) | build-smart-diff.test.ts:76-79; server/test/contracts.test.ts:123-136; server/test/smart-diff.it.test.ts:122,140,170 | PASS (integration assertions: implementer's run only) |
| P2-3 | No model call; grouping works before the first review | server/src/modules/reviews/service.ts:183-194 (only repo reads + two pure functions); classify-file.ts:1-2; build-smart-diff.ts:1-3 | smart-diff.it.test.ts:112-134, 176; build-smart-diff.test.ts:10-15 | PASS (integration assertions: implementer's run only) |
| P2-4 | Row with a finding: coloured stripe + severity label | CodeLine.tsx:52,62-64,86-90; diff-viewer/styles.ts:108-125; client/messages/en/shell.json:46-50 | FileCard.test.tsx:85-100 | PASS |
| P2-5 | Accept / Dismiss work and change the finding's state | DiffTab.tsx:84; client/src/lib/hooks/reviews.ts:167-188; FindingCard.tsx:50-52,64-65 | DiffTab.test.tsx:168-172 (mutate args only) | PARTIAL |
| P2-6 | Finding outside the patch = separate block at end of file | FileCard.tsx:84-89,143-145; diff-viewer/FindingsOutsideDiff/FindingsOutsideDiff.tsx:19-27 | comments.test.ts:42-54; FileCard.test.tsx:102-115 | PASS |
| P2-7 | Finding comments hidden by the same switch as GitHub comments | DiffTab.tsx:55,60,76,103-111 | DiffTab.test.tsx:174-187; FileCard.test.tsx:117-126 | PASS |
| P2-8 | PR description: subagents used, what plan-verifier checked | — (delivery) | — | UNVERIFIED |
| P3-1 | Sticky group header | — (searched DiffRoleGroup/styles.ts:4-36: no `position: sticky`) | — | OUT OF SCOPE |
| P3-2 | Finding comment collapses to one line | — (nothing added; FindingCard.tsx:56 header toggle already existed) | — | OUT OF SCOPE |
| P3-3 | Empty state "review not run yet" | — (DiffTab.tsx:98-153 has none) | — | OUT OF SCOPE |
| P3-4 | Counters update after Run review without reload | lib/hooks/reviews.ts:41-54; .../[number]/page.tsx:49 | lib/hooks/reviews.test.ts:42-72 | PASS |
| P3-5 | Group labels from prReview.json, not hard-coded | DiffTab/constants.ts:10-18; DiffTab.tsx:137-138; client/messages/en/prReview.json:56-65 | DiffTab.test.tsx:126,163 (real messages file; two of five labels) | PASS |
| S-§2 | Rule order (match precedence) | constants.ts:21-72; classify-file.ts:50-52 | classify-file.test.ts:8-10,27 | PASS |
| S-§2 | Two separate order constants | constants.ts:21 (`MATCH_RULES`), :78-84 (`DISPLAY_ORDER`), :75 (`FALLBACK_ROLE`) | classify-file.test.ts:8-10; build-smart-diff.test.ts:5,12 | PASS |
| S-§3 | Three disputed cases as named rows | constants.ts:21-72 | classify-file.test.ts:8, 9, 10 | PASS |
| S-dev | `**/dist/**` at depth → boilerplate | constants.ts:30 | classify-file.test.ts:13 | PASS |
| S-dev | `**/build/**` at depth → boilerplate | constants.ts:31 | classify-file.test.ts:14 | PASS |
| S-dev | `skills-lock.json` → boilerplate | constants.ts:29 | classify-file.test.ts:15 | PASS |
| S-dev | `**/migrations/meta/**` → boilerplate | constants.ts:32 | classify-file.test.ts:16-17 | PASS |
| S-dev | `*.spec.tsx` → tests | constants.ts:46 | classify-file.test.ts:18 | PASS |
| S-dev | `index.tsx` → wiring | constants.ts:58 | classify-file.test.ts:19 | PASS |
| S-dev | Migration `.sql` stays core (not widened) | constants.ts:32 (meta only) | classify-file.test.ts:20 | PASS |
| S-§2 | One test row per pattern; real repo paths (`e2e/package-lock.json`, `server/src/modules/index.ts`) | constants.ts:24-70 | classify-file.test.ts:23-62 (27, 46) | PASS |
| S-§2 | `classifyFile` purity: imports only `./constants` + the role type | classify-file.ts:1-2, 48-54 | classify-file.test.ts:1-3 (no app, container or mock) | PASS |
| S-§4 | Always five groups, empty role = `files: []` | build-smart-diff.ts:20,33-36 | build-smart-diff.test.ts:10-15; smart-diff.it.test.ts:124-130,136-143 | PASS |
| S-§4 | Path sort; `finding_lines` from `start_line`, ascending, de-duplicated; off-PR finding ignored; `pseudocode_summary` omitted | build-smart-diff.ts:13-18,24-29,35 | build-smart-diff.test.ts:37-63 | PASS |
| S-§5 | Minimal `split_suggestion` | build-smart-diff.ts:37 | build-smart-diff.test.ts:14,71-74; smart-diff.it.test.ts:132 | PASS |
| S-§4 | `latestReviewPerAgent` is the one server copy, used by PR list and smart-diff, no inline leftover | server/src/modules/_shared/latest-reviews.ts:8-21; server/src/modules/pulls/routes.ts:8,140; service.ts:10,189 | latest-reviews.test.ts:14-49; smart-diff.it.test.ts:145-177; server/test/reviews.it.test.ts:216-219 | PASS |
| S-§4 | PR list `findings_counts` unchanged after extraction | pulls/routes.ts:124-163 | reviews.it.test.ts:219 (single agent, one review only) | PARTIAL |
| S-§6 | Route: `IdParams` + `response: {200}`, 404 unknown PR, 422 bad id, empty `pr_files` → five empty groups, header comment line | routes.ts:16,136-143; service.ts:184-185 | smart-diff.it.test.ts:136-143,179-187 | PASS (implementer's run only) |
| C-§1 | Files joined by path; unmentioned file rendered after last group; smart-diff loading/failed → original order, no switch | DiffTab/helpers.ts:13-30; DiffTab.tsx:89-90,118,147 | helpers.test.ts:34-48; DiffTab.test.tsx:139-151 | PASS |
| C-§1 | Counters use the same finding set as the PR list's FINDINGS column (`latestFindingsPerAgent`, dismissed included) | DiffTab.tsx:16,46-49; client/src/app/repos/[repoId]/pulls/helpers.ts:15-32; pulls/_components/PRRow/PRRow.tsx:38 | pulls/helpers.test.ts:52-111 (helper only); DiffTab.test.tsx:156 (one review, one agent) | PARTIAL |
| C-§2 | Counter counts FILES, shown only when N ≥ 1 | helpers.ts:44-49; DiffRoleGroup.tsx:49 | helpers.test.ts:52-56; DiffRoleGroup.test.tsx:53-59; DiffTab.test.tsx:198-200 | PASS |
| C-§2 | Cards inside a collapsed-by-default group start collapsed | DiffTab.tsx:143; FileCard.tsx:62-64 | FileCard.test.tsx:128-134 (prop only) | PARTIAL |
| C-§2 | Empty group: `0 files`, cannot expand; header is a button with `aria-expanded` | DiffRoleGroup.tsx:33-45 | DiffRoleGroup.test.tsx:36-43,61-68 | PASS |
| C-§2/§9 | Labels and hints from `prReview.json`, exact agreed copy | prReview.json:56-65 (all ten strings match the spec table verbatim); DiffTab/constants.ts:10-18 | DiffTab.test.tsx:126,163 pin "Boilerplate", "Core logic"; DiffRoleGroup.test.tsx:29-33 compares the file to itself | PARTIAL |
| C-§9 | Remaining i18n keys (`smartOrder`, `originalOrder`, `filesWithFindings`, `showComments`, `hideComments`; shell `hasFindings`, `findingsOutsideTitle`, `severity.*`) | prReview.json:66-70; shell.json:44-50; DiffTab.tsx:110,121,124; DiffRoleGroup.tsx:54 | DiffTab.test.tsx:132,135,177,185; FileCard.test.tsx:71,91,99,105 | PASS |
| C-§4 | Worst severity sets stripe/label; `end_line` does not move the anchor; render prop keeps diff-viewer free of page-local imports | comments.ts:28-33,144-156; CodeLine.tsx:52 | comments.test.ts:35-40,62-72; FileCard.test.tsx:85-92 | PASS |
| C-§5 | Outside block at end of file, also with `patch: null`; counts toward dot | FileCard.tsx:128-146,90 | FileCard.test.tsx:102-115 | PASS |
| C-§5 | Outside block sits before `OutdatedComments` | FileCard.tsx:143-146 | — | PARTIAL |
| C-§6 | One comments switch; shown when `commentCount + findingCount > 0`; default `userChoice ?? findingCount > 0`; dot/stripe/counter stay when off | DiffTab.tsx:42,52-55,96,103-111 | DiffTab.test.tsx:174-187,198-211; FileCard.test.tsx:117-126 | PASS |
| C-§7 | Smart/Original switch: two Chips in `role="group"`, `aria-pressed`, default smart; findings identical in both modes | DiffTab.tsx:40,119-126,150; client/src/vendor/ui/primitives/Chip.tsx:26 | DiffTab.test.tsx:130-137,189-194 (no `aria-pressed` / `role=group` assertion) | PARTIAL |
| C-§9 | Showcase entries for FileCard-with-findings and DiffRoleGroup | client/src/components/showcase/Showcase.tsx:336-376; showcase/constants.ts:52-84 | client/src/test/smoke.test.tsx:4 | PASS |
| C-§6 | `pages.md` updated (hooks table + `diff` tab line) | client/specs/pages.md:296-297,300,305,319 | — (doc) | PASS |
| C-tests | e2e flow `05-pr-diff` stays green | e2e/specs/05-pr-diff.flow.json:13 waits for `src/config.ts` (core, open group per constants.ts:10) | not run (`agent-browser` missing) | UNVERIFIED |

## Summary

- 20 criteria: 16 PASS, 1 PARTIAL (P2-5), 2 UNVERIFIED (P1-7 and P2-8, delivery), 3 OUT OF SCOPE (P3-1, P3-2, P3-3).
- 30 spec rows: 23 PASS, 6 PARTIAL, 1 UNVERIFIED (e2e).
- **Every P1 code item (P1-1 … P1-6) is PASS.** P1-7 is delivery and cannot be checked from code.
- No MISSING row: every in-scope criterion and spec behaviour has code on the cited lines. All six spec PARTIALs and P2-5 are test gaps, not absent behaviour.
- Nothing here was run by me. `smart-diff.it.test.ts` is skipped without Docker (line 17-18) and was run only by the implementer, so P2-2, P2-3 and the route row rest on that plus the unit tests.

## Gaps

- **P2-5 (PARTIAL)** — the test asserts `mutate` is called with `{ findingId, action, prId }`. Nothing tests that `useFindingAction` invalidates `["reviews", prId]` (reviews.ts:185-187) or that an accepted/dismissed finding stays in the diff, muted. To pass: a DiffTab test rendering a finding with `dismissed_at` set and asserting it is still shown, tagged and counted. Needs runtime check: click Accept on a finding comment in Files changed and see the `accepted` tag without a reload.
- **S-§4 `findings_counts` unchanged (PARTIAL)** — the only route-level assertion (reviews.it.test.ts:219) has one agent and one review, so it would still pass if the list stopped applying the per-agent rule. To pass: a list test with two reviews by one agent plus a second agent.
- **C-§1 same finding set as the FINDINGS column (PARTIAL)** — the code calls `latestFindingsPerAgent`, but DiffTab.test.tsx uses a single review. Replacing the call with a flat map over all reviews would fail no test. To pass: a DiffTab test with an older and a newer review by the same agent, asserting only the newer one's finding is counted and rendered.
- **C-§2 cards in a collapsed group start collapsed (PARTIAL)** — DiffTab.tsx:143 passes `false`, but DiffTab.test.tsx:126-127 only checks the path appears after expanding boilerplate. To pass: assert the lock file's diff body is absent after expanding the group.
- **C-§2/§9 exact copy (PARTIAL)** — the JSON matches the agreed table, but only "Core logic" and "Boilerplate" are pinned by a literal. A changed hint, or a changed Tests / Wiring / Docs label, fails nothing. To pass: one test asserting the ten label/hint strings literally.
- **C-§5 block order (PARTIAL)** — no test has both an outside finding and an outdated GitHub thread in one file. To pass: one FileCard test asserting the findings block precedes the outdated block.
- **C-§7 `aria-pressed` / `role="group"` (PARTIAL)** — present in code, asserted nowhere. To pass: assert `aria-pressed` flips on the two chips.
- **e2e `05-pr-diff` (UNVERIFIED)** — needs runtime check: `./scripts/e2e.sh` with `agent-browser` installed.
- **P1-7, P2-8 (UNVERIFIED)** — needs the opened PR in the fork and the demo video; no code to verify.

## Unplanned changes and skipped spec items

Implemented without a spec item asking for it:

- `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:119` | the switch's `aria-label` uses `smartDiff.groupedByRole`, which the client spec's open questions describe as unused and kept so.
- `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:65` | posting a GitHub comment forces `userChoice` to `true`; the spec's §6 describes only the user's click setting it.
- `client/src/components/diff-viewer/CodeLine/CodeLine.tsx:57,63-64`, `client/src/components/diff-viewer/FileCard/FileCard.tsx:101,108-109`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffRoleGroup/DiffRoleGroup.tsx:40,51` | `data-*` attributes added as test hooks.
- `server/src/modules/reviews/smart-diff/classify-file.test.ts:66-68` | extra rows (`package.json`, `src/distribution/a.ts`, `src/docs/a.ts` → core) beyond the spec's list.
- `/home/oles/Projects/dev-digest/.claude/agents/planner.md` | modified in git status, not in the list you gave me and not asked for by either spec; I have no diff tool, so its content change is unchecked.
- `server/specs/README.md:15`, `client/specs/README.md:17` | index rows for the two specs; also absent from your list.

In the specs but skipped or not fully done:

- Client spec, Tests: "it is run with `./scripts/e2e.sh` as part of this work" — not run.
- Client spec, Tests, `DiffTab.test.tsx`: "severity … visible without a click" — the test at lines 159-162 asserts title and rationale only; severity in the card is covered by `FindingCard.test.tsx:39`, not on this tab.
- Server spec: nothing skipped that I could find.

Files read for this report are under `/home/oles/Projects/dev-digest/`: `docs/hw3/requirements.md`, `server/specs/smart-diff.md`, `client/specs/smart-diff.md`, and every source and test file cited above.
