# Architecture review: Smart Diff (uncommitted, branch feat/homework-3)

Method: I read every new and modified source file in scope against the two skills and `server/AGENTS.md` / `client/AGENTS.md`. I read both `brief.ts` copies in full. Specs were treated as context only. I could not run git or typecheck.

Result: no blockers. The server side is clean. The weak points are on the client: one repeated "latest review per agent" rule, one shared-to-route import, and some misplaced logic.

| # | Severity | Area | File:line | Finding | Suggested direction |
|---|---|---|---|---|---|
| 1 | major | Duplicated rule / dead data | `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx:46-50` vs `server/src/modules/_shared/latest-reviews.ts:8` and `client/src/app/repos/[repoId]/pulls/helpers.ts:15` | "Each agent's latest review" is implemented on both sides. The server copy feeds `finding_lines` (`build-smart-diff.ts:28`, `service.ts:183-193`). The client never reads `finding_lines`, so on one screen the groups come from the server and the dots and counters from a client re-derivation. | Pick one source of truth. Either the client reads `finding_lines` for counters and dots, or the server stops computing it and the contract field is dropped. At minimum keep a shared-fixture test so the two implementations cannot drift. |
| 2 | major | Shared to route import | `client/src/components/showcase/Showcase.tsx:56` (also :55, :58-60) | The shared `components/showcase` imports the page-local `.../pulls/[number]/_components/DiffRoleGroup` straight from a route folder. The skill says "Do not import a page-local `_components` folder from another route; promote it to `src/components/`". The change adds one more instance to an existing pattern (`FindingCard`, `SkillCard`, `ConventionCard`). | Promote the presentational `DiffRoleGroup` to `src/components/diff-viewer/` or a `smart-diff` folder. Alternatively, accept the showcase exception explicitly in the skill. |
| 3 | minor | Coupling (child route reaches up) | `.../[number]/_components/DiffTab/DiffTab.tsx:16` | `import { latestFindingsPerAgent } from "../../../helpers"` pulls the list route's `pulls/helpers.ts` into the detail tab. That file imports the list's `constants.ts` (`FINDINGS_SEVERITIES`, `PrMeta`). The function is now used by two routes (`PRRow`, `DiffTab`). | Move `latestFindingsPerAgent` to a neutral module, e.g. `src/lib/` or a `findings` helper under `components/`. Do this together with #1. |
| 4 | minor | Misplaced logic and inverted dependency | `client/src/components/diff-viewer/comments.ts:144-156`, `:125-142`; `diff-viewer/styles.ts:3` | `comments.ts` is a non-fixed name. The change grew it with finding logic (`partitionFindings`, `worstSeverity`, `SEVERITY_RANK`, `FindingSeverity`). `styles.ts` now imports a type from this logic file (`import type { FindingSeverity } from "./comments"`). | Put `SEVERITY_RANK` and `FindingSeverity` in `constants.ts`. Put `worstSeverity` and `partitionFindings` in `helpers.ts`, which already holds `Line` and `parsePatch`. |
| 5 | minor | Duplicated constant | `comments.ts:144` | `SEVERITY_RANK` is a third copy of the severity ordering. The others are `FindingsPanel/constants.ts:4` (`SEVERITY_ORDER`) and the list's `FINDINGS_SEVERITIES`. It is also a magic value outside `constants.ts`. | Reuse the existing ordering from one place. |
| 6 | minor | Leaking abstraction | `comments.ts:28-33`, `:132`, `:151`; `DiffTab.tsx:74-87` | `DiffFindingsApi` hands the shared viewer raw `FindingRecord[]`. The viewer reads transport fields (`f.file`, `f.start_line`) and casts `f.severity as FindingSeverity`. `show` duplicates `DiffCommentApi.showComments` ("Same flag as…"). `DiffTab` fills both from the same variable (`DiffTab.tsx:61`, `:76`). | Map once in `DiffTab` to a small viewer-owned shape such as `{ id, path, line, severity }`. Keep one visibility flag. |
| 7 | minor | Unchecked invariant (server) | `server/src/modules/reviews/smart-diff/constants.ts:78` with `build-smart-diff.ts:20,24,34` | `DISPLAY_ORDER` is a hand-kept `readonly SmartDiffRole[]`, and `byRole.get(...)!` uses a non-null assertion. A role added to the enum but not to this list passes typecheck and throws at runtime. The client side is exhaustive by comparison (`Record<SmartDiffRole, …>` in `DiffTab/constants.ts:6`). | Derive from `SmartDiffRole.options`, or make the order a `Record<SmartDiffRole, number>`. |
| 8 | minor | Contract promises more than it delivers | `build-smart-diff.ts:37` | `split_suggestion` is hard-coded to `too_big: false, proposed_splits: []`, and `pseudocode_summary` is never filled. A consumer cannot tell "computed and small" from "not implemented". `total_lines` is real, so `too_big: false` reads as a computed claim. | Name the stub in `constants.ts`, or make the field optional until it is implemented. |
| 9 | nit | Duplicate work | `diff-viewer/FileCard/FileCard.tsx:70-89` and `DiffTab.tsx:50` | `renderedKeys` is built twice (lines 73-74 and 85-86). Each card re-filters all findings by path (:80-83), while `DiffTab` already builds `findingsByPath` but only uses it for counts. | Build the keys once, or pass the per-file slice. |
| 10 | nit | Untyped i18n keys | `DiffTab/constants.ts:10-18` | `ROLE_META` stores message keys as plain strings. A typo in a key only fails at render time. | Derive `` `smartDiff.${role}Label` `` or type the keys. |
| 11 | nit | Placement | `.../[number]/_components/DiffRoleGroup/` | The component is used only by `DiffTab` (plus the showcase), so the skill's "component-local child" slot (`DiffTab/_components/DiffRoleGroup/`) fits. It is currently a sibling. | Moot if #2 promotes it. |
| 12 | nit | Over-fetch | `server/src/modules/reviews/service.ts:187` | `smartDiffForPull` calls `repo.reviewsForPull`, which also aggregates per-review `usage`. Only findings are needed. | A narrower repository method. |

## Evidence per finding

**#1 (major).**
- Server side: `latestReviewPerAgent` in `_shared/latest-reviews.ts:8` (keyed `prId|agentId ?? 'none'`, sorted by `createdAt`). `smartDiffForPull` (`service.ts:189`) uses it to fill `finding_lines` (`build-smart-diff.ts:28`).
- Client side: `latestFindingsPerAgent` in `pulls/helpers.ts:15` (keyed `agent_id ?? "none"`, sorted by `created_at.localeCompare`).
- The client does not use the server's result. A grep for `finding_lines` in non-test client source hits only the contract (`vendor/shared/contracts/brief.ts:89`). `DiffTab` uses `smart.data.groups` for file order only (`DiffTab.tsx:89`). Dots, counters and stripes come from `usePrReviews` (`DiffTab.tsx:46-49`).
- The client spec admits this ("`finding_lines` is not read").
- Consequence: a rule change, or the Date vs ISO-string sort difference, has to be made in two places. The server computes and ships a field no one reads.
- The server extraction itself is fine, since the inline code in `pulls/routes.ts` became a helper. The problem is the second consumer that is never read.

**#2 (major).**
- `Showcase.tsx:56`: `import { DiffRoleGroup } from "../../app/repos/[repoId]/pulls/[number]/_components/DiffRoleGroup";`
- The rule being broken is in `frontend-architecture` "Do not". `AGENTS.md` and rule 8 force a showcase entry for a changed UI component, which is what pushes the import.
- The shared `diff-viewer` itself is clean. A grep for `app/`, `_components` and `pulls` imports under `components/diff-viewer` returns nothing. `DiffFindingsApi.renderFinding` is the render-prop seam that keeps `FindingCard` out (`comments.ts:25-27`).

**#3 (minor).**
- Reaching `pulls/helpers.ts` from `_components/DiffTab/` takes three `..` hops. The skill does allow route-root helpers.
- The reach is still debatable, because `pulls/helpers.ts` is the list page's file. It now sits on the detail tab's dependency path, which includes the list-only constants.
- `PRRow.tsx:21` uses the same file with `../../helpers`, which is legitimate.

**#4 and #5 (minor).**
- `client/AGENTS.md` and the skill say internals are `constants.ts` / `helpers.ts` / `styles.ts` only.
- `comments.ts` was already a named exception, and it also hosts the `cs` style object. The change deepened it instead of using the fixed files.
- The spec chose "extend `comments.ts`, no new sibling". That keeps the file count down but not the layering.

**#6 (minor).**
- `partitionFindings` (`comments.ts:131-132`) keys on `f.start_line`. `FileCard.tsx:81` filters on `f.file`. The shared viewer is now coupled to the review record's wire shape, with `severity` cast from `string`.

**#7 (minor).**
- `classifyFile` returns whatever the rules say, typed `SmartDiffRole`.
- `DISPLAY_ORDER` is separate from the enum, so nothing links the two.

## Checked and found sound

- **Server layering.**
  - `reviews/routes.ts` has no adapter, DB or drizzle import. The smart-diff handler is `getContext`, then `service.smartDiffForPull`.
  - Validation is by route `params` plus a `response: { 200: SmartDiffResponse }` schema, with no `parse` inside the handler.
  - `ReviewService.smartDiffForPull` (`service.ts:183`) is workspace-scoped through `repo.getPull(workspaceId, …)`. It then reads `repo.getPrFiles` and `repo.reviewsForPull`.
  - The service imports no Fastify types.
- **No adapter on the smart-diff path.** The service function uses only `this.repo`. `smart-diff/*` imports only `@devdigest/shared` types and its own files. There is no GitHub, git, LLM, embedder or container access.
- **`classifyFile` is pure.**
  - `classify-file.ts` imports only the type and `./constants.js`.
  - `COMPILED` is built at module load from static constants.
  - There is no I/O, clock, container or mutable shared state. `buildSmartDiff` only mutates arrays it created.
- **`pulls/routes.ts`.**
  - The only new dependency is `../_shared/latest-reviews.js`, a pure function with no framework imports.
  - Its legacy DB and GitHub access (listed as a known exception in the skill) is unchanged.
  - The edit swapped inline logic for the shared helper and did not add DB or adapter reach.
- **`_shared/latest-reviews.ts`.** It is a pure domain helper that does not import across module folders. This matches rule 10 and the `_shared` convention.
- **Both `vendor/shared` copies.**
  - I read `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts` in full. They are identical, including the new `SmartDiffRole` enum and the SmartDiff block.
  - `review-api.ts:67-69` (`SmartDiffResponse`) and the `SmartDiff` import matched on both sides, per grep.
  - `contracts.test.ts` covers all five roles and an unknown role.
- **Client placement and naming.**
  - `DiffRoleGroup` and `DiffTab` use fixed internals only: `constants.ts`, `helpers.ts`, `styles.ts`.
  - PascalCase folder, same-named file and `index.ts` barrel hold for `DiffRoleGroup/` and `FindingsOutsideDiff/`.
  - Tests sit beside subjects: `FileCard.test.tsx`, `comments.test.ts`, `helpers.test.ts`, `DiffTab.test.tsx`, `reviews.test.ts`.
  - Hooks follow the rules: no `fetch` in components, a new `useSmartDiff` in `lib/hooks/reviews.ts`, and `page.tsx` only gained the hook call.
- **i18n.** All new copy lives in `messages/en/prReview.json` → `smartDiff.*` and `shell.json` → `diffViewer.*`. `FindingsOutsideDiff`, `FileCard` and `CodeLine` read `shell`, matching their siblings.
- **Colours.** New styles use CSS vars. Severity colours come from `SEV` via the `@devdigest/ui` barrel (`styles.ts:2`).
- **Classification stays server-only.** The client holds no glob patterns. `ROLE_META` is `Record<SmartDiffRole, …>`, so it is exhaustive against the contract.
- **Server file naming.** `smart-diff/` uses kebab-case names (`classify-file.ts`, `build-smart-diff.ts`, `constants.ts`). The integration test is `*.it.test.ts` and imports `test/helpers/pg.ts`, as the convention requires.

Files checked: all files in the changed list that I opened. Not opened: `client/specs/pages.md`, `server/specs/*`, the `DiffTab.test.tsx` / `DiffRoleGroup.test.tsx` bodies, and `showcase/constants.ts` beyond its imports.

Verdict: PASS (no CRITICAL). 2 major, 6 minor, 4 nit.
