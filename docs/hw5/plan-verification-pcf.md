# ДЗ №5 — plan verification: Project Context Folder

## 1. Inputs

| | |
| --- | --- |
| Spec | `specs/project-context/spec.md` — SPEC-02, `Status: approved`, AC-1 … AC-36 (amends SPEC-01 `specs/pr-brief/spec.md`: AC-5, AC-13, AC-14, AC-16, AC-32, AC-34, AC-35, AC-36) |
| Plan | `specs/project-context/plan.md` — T-1 … T-16 |
| Requirements | `docs/hw5/requirements.md` |
| Branch | `feat/homework-5` |
| Base commit | `41de97d` fix(intent): run marked done before its trace was stored |
| Head commit | `021de31` fix(client): address review |
| Implementation | `8b887a1` feat(project-context): documents, attachments, run and brief on the server (T-1 … T-9) · `d85df1c` feat(project-context): studio page, Context tab, trace and brief (T-10 … T-16) |
| Review fixes | `7a51b10` fix(project-context): address review · `021de31` fix(client): address review |
| Date | 2026-10-14 |

## 2. Matrix

Task and test come from the plan's Traceability table; commit from `git log`; evidence and status from
`plan-verifier`, copied. Where the verifier asked for a runtime check, the real result is recorded after
`→ runtime:`.

Path aliases (repo root): PC = `server/src/modules/project-context/` · CPC = `client/src/components/project-context/` ·
PCV = `client/src/app/repos/[repoId]/context/_components/ProjectContextView/` · AE = `client/src/app/agents/[id]/_components/AgentEditor/` ·
PRB = `client/src/app/repos/[repoId]/pulls/[number]/_components/` · run-executor = `server/src/modules/reviews/run-executor(.test).ts` ·
brief/ = `server/src/modules/brief/` · it.test.ts = `PC/project-context.it.test.ts`.

### SPEC-02

| AC | task(s) | test (file › case) | commit | evidence (file:line) | status |
|---|---|---|---|---|---|
| AC-1 | T-1, T-4, T-5, T-7 | `list-files.test.ts` › segment order, limit + `truncated`; `helpers.test.ts` › `documentTag` table; `service.test.ts` › list order, limit 500, truncated; `project-context.it.test.ts` › GET list in path order | 8b887a1, 7a51b10 | PC/service.ts:92-133 (accept=`documentTag`, limit 500, truncated); PC/helpers.ts:13-25; server/src/adapters/git/list-files.ts:17-56 (sorted DFS, limit, maxEntries); simple-git.ts:146-160 › list-files.test.ts "returns paths in segment order…", "truncates at the limit"; PC/helpers.test.ts:6-40; PC/service.test.ts:104-125; PC/project-context.it.test.ts:174-192 | PARTIAL: listing is narrower than the spec. simple-git.ts:151-154 passes `opts.accept` as `acceptReal`, and confine-path.ts:38-40 then drops any symlink under a root whose target inside the clone is not itself a document. Example: `docs/x.md → src/a.md`. Its path matches the definition, but it is not listed, and a run records it `outside_clone`. Spec EC-3 says such a link "is read like any file". This is a security narrowing from 7a51b10 that the spec does not state. |
| AC-2 | T-14 | `nav.test.ts` › WORKSPACE holds `context`, href resolves to the active repository; manual: sidebar entry opens the page of the switched repository | d85df1c | client/src/vendor/ui/nav.ts:27; client/src/app/repos/[repoId]/context/page.tsx:5-6 › nav.test.ts:11-26 (order, label, href, resolveHref) | PARTIAL, needs runtime check → runtime: **PASS** (2026-10-14, API on :3001 + `next dev` on :3000, Chrome DevTools). WORKSPACE shows "Project Context" under "Pull Requests"; with dev-digest active its href is `/repos/76e20997…/context`; after switching to matiassingers/awesome-readme it is `/repos/fa65c14f…/context`, and clicking it opened that repo's page (empty state naming `specs/`, `docs/`, `insights/`). The active repo is taken from the path first (`client/src/lib/repo-context.tsx`), so the switch was made by opening the repo's pulls URL. Screenshot: `docs/hw5/pcf-project-context-page.png`. |
| AC-3 | T-5, T-14 | `service.test.ts` › `used_by` counts enabled and disabled agents through effective documents; `ProjectContextView.test.tsx` › tree with tag and "Used by N agents" | 8b887a1, d85df1c, 7a51b10 | PCV/ProjectContextView.tsx:49-76; PC/service.ts:113-119,154-181 (uses `agentsRepo.list` = all agents, agents/repository.ts:55) › PC/service.test.ts:138-159; ProjectContextView.test.tsx:61-71 | PASS |
| AC-4 | T-7, T-11, T-12, T-14 | `project-context.it.test.ts` › GET document; `DocPreview.test.tsx` › `ready` renders a heading; `AttachmentsEditor.test.tsx` › select shows the preview in place; `ProjectContextView.test.tsx` › click shows content on the page | 8b887a1, d85df1c, 021de31 | CPC/DocPreview/DocPreview.tsx:20-65; ProjectContextView.tsx:104-109; CPC/AttachmentsEditor/AttachmentsEditor.tsx:110-115; PC/routes.ts:42-49; PC/service.ts:135-147 › DocPreview.test.tsx:21,26; AttachmentsEditor.test.tsx:136-143; ProjectContextView.test.tsx:73-80; it.test.ts:194-204 | PASS |
| AC-5 | T-5, T-14 | `service.test.ts` › `tokens` from the injected counter; `ProjectContextView.test.tsx` › footer "N files · N tokens" | 8b887a1, d85df1c | ProjectContextView.tsx:100-102; context.json:6; PC/service.ts:127 › PC/service.test.ts:127-136; ProjectContextView.test.tsx:82-89 | PASS |
| AC-6 | T-11, T-13 | `DocPicker.test.tsx` › checkbox, path, tag per document; `AgentEditor.test.tsx` › three tabs, Context renders; `ContextTab.test.tsx` › documents of the active repository | d85df1c | AE/constants.ts:14; AE/AgentEditor.tsx:28-29; ContextTab.tsx:9-10; CPC/DocPicker/DocPicker.tsx:79-93 › AgentEditor.test.tsx:79,107; ContextTab.test.tsx:65; DocPicker.test.tsx:48 | PASS |
| AC-7 | T-11, T-13 | `SkillContextSection.test.tsx` › heading "Project context to use" and the list for the skill | d85df1c | SkillConfigTab.tsx:81; SkillContextSection.tsx:11-16; context.json:45 › SkillContextSection.test.tsx:46-59 | PASS |
| AC-8 | T-6, T-7, T-10, T-12 | `service.test.ts` › stored order, replace; `project-context.it.test.ts` › PUT then GET equal, rows in the table; `project-context.test.ts` (hooks) › PUT body and cache; `AttachmentsEditor.test.tsx` › tick appends, untick removes, move swaps, no save button | 8b887a1, d85df1c | AttachmentsEditor.tsx:52-71; client/src/lib/hooks/project-context.ts:77-97; PC/service.ts:282-300; PC/repository.ts:63-83 (one transaction) › AttachmentsEditor.test.tsx:98-125; hooks project-context.test.ts:72-93; PC/service.test.ts:263-272; it.test.ts:226-245 | PASS |
| AC-9 | T-11 | `DocPicker.test.tsx` › typing filters by path, case ignored | d85df1c | DocPicker/helpers.ts:71-75; DocPicker.tsx:49-55 › DocPicker.test.tsx:89-94; DocPicker/helpers.test.ts:65 | PASS |
| AC-10 | T-6, T-11, T-13 | `service.test.ts` › skill-only path carries the skill; `DocPicker.test.tsx` › skill name, no checkbox, no move; `ContextTab.test.tsx` › same through the tab | 8b887a1, d85df1c | DocPicker/helpers.ts:57-63; DocPicker.tsx:79-80,95-98; PC/service.ts:194-210 › PC/service.test.ts:315-327; DocPicker.test.tsx:102-111; ContextTab.test.tsx:73 | PASS |
| AC-11 | T-6, T-11, T-13 | `service.test.ts` › every readable effective entry has tokens, over-budget ones included; `DocPicker.test.tsx` › footer sum and "injected as untrusted" | 8b887a1, d85df1c | DocPicker.tsx:119-121; DocPicker/helpers.ts:78-80; context.json:41; PC/service.ts:219-264 (editor keeps tokens past budget) › DocPicker.test.tsx:113-124; PC/service.test.ts:336-345; ContextTab.test.tsx:79 | PASS |
| AC-12 | T-2, T-6 | `project-context.it.test.ts` › table columns are owner, `repo_id`, `position`, `path` only; `service.test.ts` › stored rows hold no text | 8b887a1 | server/src/db/schema/context.ts:138-172; migrations/0013_lyrical_leper_queen.sql:1-15 › it.test.ts:40-43; PC/service.test.ts:263-272 | PASS |
| AC-13 | T-4, T-6 | `helpers.test.ts` › `effectiveDocuments` order, dedupe, disabled skill; `service.test.ts` › `forRun`, `forBrief` and `getAttachments` return that order | 8b887a1, 7a51b10 | PC/helpers.ts:39-56; PC/service.ts:194-210 (editor, run), :113-119 and :331-333 (used_by, brief) › PC/helpers.test.ts:45-60; PC/service.test.ts:315-327,402-410 | PASS |
| AC-14 | T-4, T-6, T-7 | `helpers.test.ts` › `documentTag` null for absolute, `..`, control character, non-`.md`, outside the roots; `service.test.ts` › refused, `setPaths` not called; `project-context.it.test.ts` › 422 and table unchanged | 8b887a1 | PC/service.ts:282-298; PC/helpers.ts:13-25; PC/routes.ts:64-71 › PC/helpers.test.ts:28-39; PC/service.test.ts:274-287; it.test.ts:248-264 | PASS |
| AC-15 | T-5, T-6, T-7 | `service.test.ts` › `NotFoundError`, git not called; `project-context.it.test.ts` › all six routes 404 for another workspace | 8b887a1, 7a51b10 | PC/service.ts:62-66,185-191; PC/repository.ts:19-25 › PC/service.test.ts:171-177,302-311; it.test.ts:266-296 (all six routes) | PASS |
| AC-16 | T-1, T-7 | `contracts.test.ts` › `project-context.ts` copies byte-identical, `project_context` line equal in both `trace.ts`; `project-context.it.test.ts` › response parses with `ProjectContextList` | 8b887a1 | server and client vendor/shared/contracts/project-context.ts; trace.ts:111 / :110; brief.ts:148 › server/test/contracts.test.ts:351-355,406-413; it.test.ts:178 | PASS |
| AC-17 | T-6, T-8 | `service.test.ts` › `forRun` uses `readFile`, never `readFileAtRef`, effective order; `project-context.it.test.ts` › run with a fake whose `readFileAtRef` throws | 8b887a1 | PC/service.ts:69-80,305-315 (only `git.readFile`); simple-git.ts:132-144; run-executor.ts:247 › PC/service.test.ts:402-410; it.test.ts:326-399 (`readAtRefCalls` 0) | PASS |
| AC-18 | T-3 | `reviewer-core/test/prompt.test.ts` › one section, one block per document stating its path | 8b887a1 | reviewer-core/src/prompt.ts:74-77,289-290,344 › reviewer-core/test/prompt.test.ts:276-282 | PASS |
| AC-19 | T-3, T-8, T-9 | `reviewer-core/test/run.test.ts` › same call count with and without documents (single-pass and map-reduce); `run-executor.test.ts` › same count; `brief/service.test.ts` › one call with documents | 8b887a1 | run-executor.ts:261-324; brief/service.ts:112-125 › reviewer-core/test/run.test.ts:309-320; run-executor.test.ts:352-354; brief/service.test.ts:420-426 | PASS |
| AC-20 | T-3, T-8 | `prompt.test.ts` › undefined / empty / all-blank `specs` deep-equal to no `specs`; `run-executor.test.ts` › no section, no rule, same messages | 8b887a1 | prompt.ts:289-295,344; run-executor.ts:311-313 › prompt.test.ts:289-294; run-executor.test.ts:320-330 | PASS |
| AC-21 | T-3 | `prompt.test.ts` › system ends with `DOCUMENT_RULE` only when the section is present | 8b887a1 | prompt.ts:49-54,292-295 › prompt.test.ts:284-287 | PASS |
| AC-22 | T-5, T-6, T-8, T-9 | `service.test.ts` › each read outcome, the next document still included; `run-executor.test.ts` › run completes with skipped entries; `brief/service.test.ts` › `forBrief` failing still stores a brief | 8b887a1, 7a51b10 | PC/service.ts:69-90,234-238,338-342; run-executor.ts:477-497 › PC/service.test.ts:216-223,375-392,442-460; brief/service.test.ts:454-459 | PASS |
| AC-23 | T-1, T-5 | `confine-path.test.ts` › absolute, `..`, escaping symlink → `isPathEscape`; `list-files.test.ts` › escaping symlink not listed; `service.test.ts` › `outside_clone`, `readFile` not called for a `..` path | 8b887a1, 7a51b10 | PC/helpers.ts:14-16 (checked before the read, service.ts:70); confine-path.ts:24-42; list-files.ts:37-44; simple-git.ts:151-158 › confine-path.test.ts:64-72; list-files.test.ts:44-49,101-110; PC/service.test.ts:235-238; it.test.ts:206-223 | PASS |
| AC-24 | T-4, T-6 | `helpers.test.ts` › `withinBudget` boundary; `service.test.ts` › first over-budget document and all after it skipped, later one unread | 8b887a1 | PC/service.ts:225-262; PC/helpers.ts:59-60 › PC/helpers.test.ts:64-67; PC/service.test.ts:351-373 | PASS |
| AC-25 | T-1, T-6, T-8 | `contracts.test.ts` › entry with tokens or one of five reasons; `service.test.ts` › entries per document; `run-executor.test.ts` › trace `project_context` equals the entries; `project-context.it.test.ts` › trace route returns it | 8b887a1 | run-executor.ts:388; PC/service.ts:305-315; contracts/project-context.ts:44-49 › contracts.test.ts:358-364; PC/service.test.ts:351-362,375-392; run-executor.test.ts:314-318; it.test.ts:393-398 | PASS |
| AC-26 | T-15 | `TraceBody.test.tsx` › each entry with tokens or reason text | d85df1c, 021de31 | PRB/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:42-56; runs.json:38-44 › TraceBody.test.tsx:137-180 | PASS |
| AC-27 | T-8 | `run-executor.test.ts` › user message holds the texts in path-stating blocks, system holds `DOCUMENT_RULE`; `project-context.it.test.ts` › the invariant sentence in the recorded model input | 8b887a1 | run-executor.ts:311-313 → prompt.ts:289-295,344 › run-executor.test.ts:306-312; it.test.ts:326-392 | PASS |
| AC-28 | T-3, T-8 | logic: `project-context.it.test.ts` › the invariant sentence in the recorded model input (AC-27); manual: real reviewer run on a PR adding an `api/` → `db/` import | 8b887a1 | Logic via AC-27. No record of a real run: the only "AC-28" row in docs/hw5/plan-verification.md:59 belongs to SPEC-01 | PARTIAL, needs runtime check → runtime: **not run**. It needs a document pushed to the default branch of an imported GitHub repo, a pull request opened there and a real model call. Those steps publish to GitHub and cost a model call, so they were left for the user. See §3. |
| AC-29 | T-6, T-9 | `service.test.ts` › `forBrief` enabled agents in name order, a path once; `brief/helpers.test.ts` › one path-stating untrusted block per document | 8b887a1 | PC/service.ts:318-348 and :180 (sort by name, then id); brief/service.ts:112-127; brief/helpers.ts:341-348 › PC/service.test.ts:422-432; brief/helpers.test.ts:677-685 | PARTIAL: the code sorts, but the test does not prove name order. PC/service.test.ts:423-427 seeds agents a, b, c already in name order, so deleting the sort at service.ts:180 would still pass. |
| AC-30 | T-9 | `brief/helpers.test.ts` › documents dropped whole, last first, before any other fact; `tokens ≤ budget`; never throws | 8b887a1 | brief/helpers.ts:435-454 (doc step before step 0 at :456) › brief/helpers.test.ts:713-734 | PASS |
| AC-31 | T-9, T-16 | `brief/service.test.ts` › stored `context_docs` = paths given; `PrBriefBlock.test.tsx` › paths listed, or "No specs attached" | 8b887a1, d85df1c | brief/service.ts:151; PRB/PrBriefBlock/PrBriefBlock.tsx:102-115; brief.json:29-30 › brief/service.test.ts:431-452; PrBriefBlock.test.tsx:219-232 | PASS |
| AC-32 | T-9 | `brief/helpers.test.ts` › `allowedPaths` lacks document paths, grounding drops items naming them | 8b887a1 | brief/helpers.ts:167-205,217 › brief/helpers.test.ts:697-711; brief/service.test.ts:484-500 | PASS |
| AC-33 | T-5, T-11, T-12, T-14 | `service.test.ts` › `has_clone: false`; `DocPreview.test.tsx` › loading, error + retry, too large; `AttachmentsEditor.test.tsx` and `ProjectContextView.test.tsx` › loading, error with retry, empty state naming the three folders, no-clone notice | 8b887a1, d85df1c, 021de31 | ProjectContextView.tsx:79-92; AttachmentsEditor.tsx:73-94; DocPreview.tsx:24-46; context.json:13-20; PC/service.ts:94-111 › ProjectContextView.test.tsx:98-117; AttachmentsEditor.test.tsx:153-185; DocPreview.test.tsx:37-58; PC/service.test.ts:161-169 | PARTIAL (test gap only; the code is complete): the list-loading tests (ProjectContextView.test.tsx:91-96, AttachmentsEditor.test.tsx:165-170) only check that the tree, error and list are absent. Neither checks that the placeholder is shown. |
| AC-34 | T-12 | `AttachmentsEditor.test.tsx` › failed write restores the previous list and shows the error | d85df1c | AttachmentsEditor.tsx:52-61 › AttachmentsEditor.test.tsx:127-134 | PASS |
| AC-35 | T-11, T-13, T-14 | `DocPicker.test.tsx`, `SkillContextSection.test.tsx`, `ProjectContextView.test.tsx` › every asserted label equals its `context.json` / `agents.json` value; manual: `grep` the new component folders for string literals in JSX | d85df1c | Most copy uses `useTranslations("context")`; no other JSX literals found in the new components | PARTIAL: the list-load errors (ProjectContextView.tsx:88, AttachmentsEditor.tsx:86,90) use `ErrorState` without `title`. It therefore shows the hardcoded default "Something went wrong" (vendor/ui/primitives/ErrorState.tsx:7) and a hardcoded "Retry" (ErrorState.tsx:54). The tests assert the literal "Retry" (ProjectContextView.test.tsx:102, AttachmentsEditor.test.tsx:176). |
| AC-36 | T-2 | `project-context.it.test.ts` › attachments gone after deleting the agent, the skill, the repository | 8b887a1 | 0013_lyrical_leper_queen.sql:17-20 (ON DELETE cascade); schema/context.ts:141-146,159-164; hard deletes at agents/repository.ts:78, skills/repository.ts:187, repos/repository.ts:82 › it.test.ts:45-94 | PASS (the repo cascade on `skill_context_docs` is proven only by the FK at sql:20; the test checks the repo cascade on the agent table) |

### SPEC-01 (amended criteria)

| SPEC-01 AC | task | test (file › case) | commit | evidence (file:line) | status |
|---|---|---|---|---|---|
| AC-5 | T-16 | `PrBriefBlock.test.tsx` › stored paths listed in order; "No specs attached" for `[]` and for a brief without the field; no-intent statement unchanged | d85df1c | PrBriefBlock.tsx:101-115 › PrBriefBlock.test.tsx:66,172,219-238 | PASS |
| AC-13 | T-9 | `brief/service.test.ts` › with documents `llm.calls.length === 1`, request carries `maxRetries: 0` | 8b887a1 | brief/service.ts:112-125,184-207 › brief/service.test.ts:420-429 | PASS |
| AC-14 | T-9 | `brief/helpers.test.ts` › whole input ≤ 8 000 with documents; documents dropped whole, last first, then the intent, then the existing reduction; no patch text; never throws | 8b887a1 | brief/helpers.ts:448-462 › brief/helpers.test.ts:713-734 | PARTIAL (test gap): no test combines documents with an intent. Nothing proves that "no part of the intent is cut while an attached document remains". The facts in helpers.test.ts:674-675 pass `intent = null`. |
| AC-16 | T-1, T-9 | `contracts.test.ts` › `PrBrief` with and without `context_docs`, both `brief.ts` copies byte-identical; `brief.it.test.ts` › a row without the field is still served | 8b887a1 | brief.ts:148 (both copies) › contracts.test.ts:351-355,393-404; brief.it.test.ts:142-150 | PASS |
| AC-32 | T-9 | `brief/service.test.ts` › with documents attached, one request and no `recalculate` / `ensureForReview` call | 8b887a1 | brief/service.ts:95-110 › brief/service.test.ts:420-426 | PASS |
| AC-34 | T-6, T-9 | `project-context/service.test.ts` › `forBrief` order, and missing / unreadable / escaping / too-large documents left out; `brief/helpers.test.ts` › documents as path-stating blocks; `brief/service.test.ts` › `forBrief` failing does not fail the generation | 8b887a1 | PC/service.ts:318-348; brief/service.ts:112-125 › PC/service.test.ts:442-460; brief/helpers.test.ts:677-685; brief/service.test.ts:454-459 | PARTIAL: inherits the name-order test gap of SPEC-02 AC-29 |
| AC-35 | T-9 | `brief/helpers.test.ts` › document paths absent from `allowedPaths`; `brief/service.test.ts` › a reply naming a document path is stored without it | 8b887a1 | brief/helpers.ts:167-205 › brief/helpers.test.ts:697-711; brief/service.test.ts:484-500 | PASS |
| AC-36 | T-1, T-9 | `brief/service.test.ts` › `context_docs` = paths given, in order; `[]` when none; only the ones that survived the budget; `brief.it.test.ts` › stored brief names the attached document | 8b887a1 | brief/service.ts:151; brief/helpers.ts:444 › brief/service.test.ts:431-452; brief.it.test.ts:122-140 | PASS |

**Counts.**

| | PASS | PARTIAL | MISSING |
|---|---|---|---|
| SPEC-02 | 31 (30 by the verifier, plus AC-2 after the runtime check) | 5: AC-1, AC-28, AC-29, AC-33, AC-35 | 0 |
| SPEC-01, amended criteria | 6 | 2: AC-14, AC-34 | 0 |

## 3. Open rows

| Row | Gap | What would close it |
|---|---|---|
| SPEC-02 AC-1 (and EC-3) | Since `7a51b10`, a symlink is listed and read only when its real target is itself a project-context document. EC-3 says that a symlink resolving inside the clone "is read like any file". The narrowing is what closes the CRITICAL token leak (`docs/x.md → ../.git/config`). | **User decision.** Either amend SPEC-02 EC-3 and AC-1 so that a symlink counts only when its real path is itself a project-context document (recommended), or drop the rule at `server/src/adapters/git/simple-git.ts:153` and `PC/service.ts:79`. Dropping it reopens the CRITICAL. |
| SPEC-02 AC-28 | No real-model run is recorded. | 1. Set a real provider key in Settings. 2. Commit `docs/architecture.md` containing "`api/` does not import `db/` directly" to the default branch of an imported repository, then re-sync the clone. 3. Attach that document in the reviewer's Context tab. 4. Open a PR that adds a `db/` import in a file under `api/`, and run that reviewer. 5. Check that the finding on the import line names `docs/architecture.md` in its rationale, and record the result here. |
| SPEC-02 AC-29 / SPEC-01 AC-34 | The test seeds agents already in name order. | In `PC/service.test.ts:423-427`, seed the enabled agents out of name order and assert that the documents of the agent first by name come first. |
| SPEC-02 AC-33 | The list-loading tests do not assert that the placeholder renders. | In `ProjectContextView.test.tsx:91-96` and `AttachmentsEditor.test.tsx:165-170`, also assert that the skeleton renders. |
| SPEC-02 AC-35 | The design-system `ErrorState` shows a hardcoded title and "Retry". | Pass a translated `title`, and either give `ErrorState` a retry-label prop or render the error block the way `DocPreview.tsx:34-44` does with `context.preview.retry`. Then assert both texts from `context.json`. |
| SPEC-01 AC-14 | No test combines an intent with documents. | Add a `brief/helpers.test.ts` case with an intent that has lists, several documents and a tight budget. Assert that the intent stays whole while any document remains. |

## 4. Reviews

### Architecture review (`architecture-reviewer`)

- **Rounds:** an initial review, then one fix round with a re-review of the fix commits `7a51b10` and `021de31`.
- **Initial result:** 0 CRITICAL, 4 WARNING (major), 4 SUGGESTION, 2 INFO.
- **Fixed in round 1** (all four closed by the re-review):
  1. `PC/repository.ts` read the agents module's tables (`agents`, `agent_skills`, `skills`). The service now composes usage through `container.agentsRepo` and a new lazy `skillsRepo` getter (`7a51b10`).
  2. `AttachmentsEditor` and `DocPreview` imported `../DocPicker/helpers` directly. They now import the barrels, and `moveItem` is exported from `DocPicker/index.ts` (`021de31`).
  3. `visiblePath` existed in more than one client copy. There is now one, in `client/src/lib/visible-path.ts`, with its own test (`021de31`).
  4. The preview-status ternary was pasted into two components. It is now `previewPathFor` / `previewStatus` in `DocPreview/helpers.ts`, with a test (`021de31`).
- **CRITICAL / major still open:** none.
- **minor / nit, as shown to the user (not sent to the implementers):**
  - SUGGESTION — `PC/service.ts:14, :61-75` imports `isPathEscape` from the git adapter and interprets raw fs error codes. An adapter-level error type in `@devdigest/shared` would remove the leak (the same pattern already exists in `intent/collect-sources.ts:4`).
  - SUGGESTION — `PC/service.ts:259, :262` and `run-executor.ts:479`: `forRun` takes the Drizzle `RepoRow` type. `Pick<RepoRow, 'owner' | 'name' | 'id'>` would be enough.
  - SUGGESTION — `AttachmentsEditor` is not in the showcase. It fetches through hooks, so mounting it there is awkward; record the exception or add it with mocked hooks.
  - SUGGESTION — `DocPicker.tsx:81-87` uses a raw `<input type="checkbox">` instead of the `@devdigest/ui` `Checkbox`. The implementer did this because the primitive wraps its label in a `<label>`.
  - INFO — hooks are imported from `@/lib/hooks/project-context` rather than the barrel. This matches the rest of the codebase.
  - INFO — exporting `rowPath` from `brief/helpers.ts` and adding `pathsForSkills` are both fine.
  - SUGGESTION (re-review) — `PrBriefBlock/helpers.ts:6-7` re-exports `visiblePath` only as a pass-through. Importing `@/lib/visible-path` directly would remove the indirection.
  - INFO (re-review) — `reviewer-core/src/prompt.ts:70` keeps its own `visiblePath` copy. That is unavoidable across packages; its drift from the client copy is not checked.
  - INFO (re-review) — `previewStatus` takes a structural query type, so it stays decoupled from TanStack.

### Security review (`security-reviewer`)

- **Rounds:** an initial review, then one fix round with a re-review of `7a51b10`.
- **Initial result:** 1 CRITICAL, 0 WARNING, 2 SUGGESTION. The background commit review flagged the same two areas: the symlink read in `service.ts` and untrusted rendering in `DocPreview`.
- **Fixed in round 1 — CRITICAL, symlink to a non-document inside the clone.**
  - **The flaw:** a committed symlink `docs/x.md → ../.git/config` passed `confinePath`, because its target is inside the clone.
  - **The impact:** the preview route, the review prompt, the brief and the stored trace could carry `.git/config`. That file holds the GitHub token in `remote.origin.url`. The coordinator confirmed that nothing in the server strips the remote URL after clone.
  - **The fix:** `confinePath` and `GitClient.readFile` (both `vendor/shared` copies) take an optional rule over the resolved repo-relative path. Every read of this feature passes `documentTag(realRel) !== null`, and so does the listing.
  - **Re-review:** closed for every read path (list, preview, `forRun`, `forBrief`, attachments), including symlink chains and symlinked directories. The changed lines introduce nothing new.
- **CRITICAL / major still open:** none.
- **minor / nit, as shown to the user (not sent to the implementers):**
  - SUGGESTION — `run-executor.ts:494` writes the raw error message into the Live Log (`context: lookup failed — …`). Today only DB or `effectiveFor` errors reach that line. A fixed string would follow NFR-4 strictly.
  - SUGGESTION — `client/src/vendor/ui/primitives/Markdown.tsx:10`: the preview loads remote images from untrusted Markdown (`![](https://attacker/x.png)`), which beacons the viewer's IP and the time of viewing. Scripts, raw HTML and `javascript:` links are blocked.
  - INFO (re-review) — other `git.readFile` callers pass no real-path rule: `conventions/helpers.ts:185,200` and `reviews/intent/collect-sources.ts:130`. They are outside this feature but would follow an in-clone symlink to `.git/config` if the path came from untrusted text. Check `collect-sources` separately.
  - INFO (re-review) — `MockGitClient` ignores the new rule. The rule is covered by the real-adapter tests in `list-files.test.ts`.

## 5. Checks

All commands were run by the coordinator, not taken from the implementers' reports.

| When | Command | Result |
|---|---|---|
| After T-1 | `server: pnpm typecheck` · `pnpm test` · `client: pnpm typecheck` | pass · 55 files, 584 tests passed · pass |
| After the client group | `client: pnpm typecheck` · `pnpm test` | pass · 53 files, 434 tests passed |
| After the server group | `server: pnpm typecheck` · `pnpm test` | pass · 58 files, 673 tests passed |
| | `reviewer-core: npm run typecheck` · `npm test` | pass · 5 files, 83 tests passed |
| | `client: pnpm typecheck` · `pnpm test` | pass · 53 files, 434 tests passed |
| After fix round 1 | `client: pnpm typecheck` · `pnpm test` | pass · 55 files, 437 tests passed |
| | `server: pnpm typecheck` · `pnpm test` | pass · 58 files, 676 tests passed |
| | `cmp server/src/vendor/shared/adapters.ts client/src/vendor/shared/adapters.ts` | identical |
| Integration suites, explicitly (Postgres `devdigest-postgres` up) | `server: pnpm exec vitest run src/modules/project-context/project-context.it.test.ts src/modules/brief/brief.it.test.ts` | 2 files, 24 tests passed (11 + 13) |
| Migration content | `grep` for DROP / RENAME / ALTER of existing tables in `0013_lyrical_leper_queen.sql` | none; it creates 2 tables and 2 indexes, and adds FKs on the new tables |
| Runtime, dev DB | `server: pnpm db:migrate` | `✓ migrations applied` (only "already exists, skipping" NOTICEs for `vector` / `drizzle`). Before this, `GET /repos/:id/context` answered `relation "agent_context_docs" does not exist` |
| Runtime, API | `curl localhost:3001/repos/76e20997…/context` | `has_clone true`, 24 documents, `truncated false`, tags `docs` / `specs` correct |
| Runtime, studio (AC-2) | `client: pnpm dev` + Chrome DevTools | PASS, see the AC-2 row. Page footer "24 files · 46,150 tokens"; a too-large document marked "Too large — skipped"; clicking `client/specs/findings-column.md` renders the preview in place. Screenshot `docs/hw5/pcf-project-context-page.png`. The dev server was stopped afterwards. |

## 6. Deviations (from the implementers' reports)

### Server group (T-1 … T-9, fix `7a51b10`)

- `server/test/intent-contracts.test.ts` (not in T-1's files): `'context_docs'` was added to the exact key list of `PrBrief.shape`. The assertion is not weakened.
- `server/src/modules/brief/service.test.ts` (NFR-5 test): the three new log fields were added to its exact key list.
- **No red run:** four test files were written together with their code and never seen failing: T-4 `helpers.test.ts`, the T-7 route integration tests, the T-8 end-to-end integration test and the T-9 integration tests. T-1 was also written in a single pass.
- **Extra repository method `pathsForSkills(skillIds, repoId)`:** needed by `forRun` / `getAttachments`. In fix round 1 the repository's `usage()` / `skill()` were replaced by `pathsForAgents` plus composition in the service, so the plan's T-5 repository signatures no longer match.
- **`forRun`:** the first document over budget is recorded as `over_budget` with `tokens: null` (D-9 says "unread"). The editor's `getAttachments` keeps its tokens.
- **Budget:** the budget counts the `\n\n` separator between blocks.
- **`rowPath`:** exported from `brief/helpers.ts` so the service can log skipped paths in escaped form.
- **`brief.it.test.ts`:** the shared app now uses a `MockGitClient` with a fixed file map as its git override.
- **`run-executor.test.ts`:** `runWith` gained an optional `forRun`, a default `projectContext` stub, and returns `systemMessage` / `modelCalls`.
- **Fix round 1 contract change:** an optional `acceptReal` parameter on `GitClient.readFile`, made in both `vendor/shared/adapters.ts` copies (byte-identical), plus an optional third argument on `confinePath`. Existing callers are unchanged.
- **Implementer open items:**
  - Migrations are not applied on boot. Run `pnpm db:migrate` after pulling; this was done on the local dev DB during verification.
  - A map-reduce agent pays the section on every per-file request (accepted trade-off EC-8).
  - The `context: lookup failed` log line carries the error message (see the security SUGGESTION).

### Client group (T-10 … T-16, fix `021de31`)

- `@testing-library/user-event` is not installed, so the tests use `fireEvent`. No dependency was added.
- **Native checkbox in `DocPicker`:** an `aria-label`ed native checkbox instead of the `Checkbox` primitive, because the primitive's `<label>` would make a click on the path toggle the box.
- **`DocPreview` retry:** a `Button` labelled `context.preview.retry`. The list-load errors in `AttachmentsEditor` / `ProjectContextView` still use `ErrorState`, with its hardcoded texts (see AC-35).
- **Extra message keys:** `picker.unreadable` and `picker.outsideClone` in `context.json`, to cover all five trace skip reasons.
- **`visiblePath` / `moveItem`:** first placed in `DocPicker/helpers.ts`. After the review, `visiblePath` moved to `client/src/lib/visible-path.ts`, and `PrBriefBlock/helpers.ts` re-exports it.
- **Footer file count:** counts all listed documents. Too-large documents are marked and add 0 tokens.
- **Query keys:** the attachments query keys are `["context-attachments", owner, ownerId, repoId]`. `useContextDocument` has `retry: false`.
- **`AttachmentsEditor` on a failed load:** it shows an `ErrorState` when the attachments query fails, instead of letting the user write a guessed list.
- **Too-large documents:** a too-large document shows its text without issuing the preview request.
- **`SkillDetailView.test.tsx`:** now mocks the project-context hooks, because `SkillConfigTab` embeds the new section.
- **No red run:** red-first was not followed for `DocPicker`, `DocPreview`, `PrBriefBlock` and the `nav` cases.
- **Fix round 1:** `DocPreview.tsx` was accidentally truncated mid-fix and rewritten. The coordinator checked the final diff against `d85df1c` (only the import and the status-type lines changed), and the full suite passes.
- **Not done:** `ContextTab` and `AttachmentsEditor` were not added to the showcase (per the plan). The T-14 manual sidebar check was not done by the implementer; the coordinator ran it, see AC-2.
