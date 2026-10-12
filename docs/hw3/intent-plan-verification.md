# Intent Layer — plan verification

Report of the `plan-verifier` agent, as returned. Input: both specs
([server](../../server/specs/intent-layer.md), [client](../../client/specs/intent-layer.md)), the
Development Plan and the 69 files changed after the specs commit `d735091` (implementation, tests
and review-fix round included). The agent reads code; it runs nothing.

`R` = repository root. Test file paths without a prefix are in the same folder as the code or test
file named earlier in the row.

## Pass 1

| AC | Code evidence (file:line) | Test evidence (file:line, test name) | Status |
|---|---|---|---|
| S-AC-1 contract | R/server/src/vendor/shared/contracts/intent.ts:10-37; R/client/src/vendor/shared/contracts/intent.ts:10-37 (identical text) | R/server/test/intent-contracts.test.ts:27-65 ("contracts/intent.ts is identical…", "exports IntentConfidence…", "Intent keeps its three fields", "…unchanged since the spec commit") | PASS |
| S-AC-2 schema | R/server/src/db/schema/reviews.ts:56-64; R/server/src/db/migrations/0012_nice_wolf_cub.sql:1-9 (ADD COLUMN only) | R/server/test/intent.it.test.ts:146-173; R/server/test/intent-contracts.test.ts:81-95 | PASS |
| S-AC-3 default model | R/server/src/vendor/shared/contracts/platform.ts:52-56; R/server/src/modules/reviews/intent/intent-service.ts:152 | R/server/test/intent.it.test.ts:176-195 ("review_intent defaults to openrouter/deepseek flash; a PUT /settings override is honoured"); intent-contracts.test.ts:69-75 | PASS |
| S-AC-4 GET never calls model | R/server/src/modules/reviews/routes.ts:148-155; intent-service.ts:72-77 | intent.it.test.ts:198-252 (null / stored / 0 calls; 404 unknown; 422 non-uuid; 404 other workspace) | PASS |
| S-AC-5 recalculate = one call | routes.ts:158-168; intent-service.ts:80-92, 152, 224; R/reviewer-core/src/intent/derive-intent.ts:242-249 (`maxRetries: 0`) | R/reviewer-core/test/derive-intent.test.ts:29-52; intent.it.test.ts:338-350 (row), 378-389 ("a failed recalculate leaves the stored row untouched") | PASS |
| S-AC-6 classifier input | derive-intent.ts:91-93, 112-143; R/server/src/modules/reviews/intent/file-outline.ts:15-42; intent-service.ts:152 | derive-intent.test.ts:55-96; R/server/src/modules/reviews/intent/file-outline.test.ts:26-38 ("no hunk body line … enters the outline") | PASS |
| S-AC-7 no description | derive-intent.ts:251-256; R/server/src/modules/reviews/intent/collect-sources.ts:42-52 | derive-intent.test.ts:98-129; intent.it.test.ts:255-272; collect-sources.test.ts:159-164 | PASS |
| S-AC-8 references | collect-sources.ts:77-88, 105-133 (head commit → contents API at head sha → clone) | R/server/src/modules/reviews/intent/collect-sources.test.ts:68-96; intent.it.test.ts:275-289 | PASS |
| S-AC-9 SSRF / traversal | R/server/src/modules/reviews/intent/parse-references.ts:25-37, 57-70; R/server/src/adapters/git/confine-path.ts:9-19; R/server/src/adapters/git/simple-git.ts:131-157. ABSENT: rejected absolute / `..` / non-`.md` references are dropped silently at parse-references.ts:52-55 and never become a `sources` entry | parse-references.test.ts:12-46; collect-sources.test.ts:99-129; R/server/src/adapters/git/confine-path.test.ts:29-62. No test of the pre-read size checks or of `readFileAtRef` ref/path validation (searched tests for `FileTooLarge`, `readFileAtRef`: only a fake override) | PARTIAL |
| S-AC-10 PR-as-issue | collect-sources.ts:57-75; parse-references.ts:18; R/server/src/adapters/github/octokit.ts:365 | collect-sources.test.ts:133-157; parse-references.test.ts:7-10; intent.it.test.ts:291-319 | PASS |
| S-AC-11 derive once | R/server/src/modules/reviews/run-executor.ts:125-133; intent-service.ts:108-109, 134-140 (in-flight map) | intent.it.test.ts:415-462 (three tests: shared by 2 agents / stored → 0 / concurrent → 1) | PASS |
| S-AC-12 two calls visible | intent-service.ts:155 (step label), 202-209 (classifier `llm_call`); run-executor.ts:120, 132, 243-249, 292-298 (ONE `review` `llm_call` per agent run, tokens summed over all chunks) | intent.it.test.ts:464-491 — asserts step line exists in one run's trace, classifier = 1, review >= 1, one correlationId. Not asserted: step distinct from the review step, real stdout | PARTIAL |
| S-AC-13 classifier failure | intent-service.ts:120-122; run-executor.ts:135-136, 271 | intent.it.test.ts:493-526 (402 / 404 / schema failure / missing key → `done`, error line, no intent section) | PASS |
| S-AC-14 reviewer prompt | R/reviewer-core/src/prompt.ts:215-216, 261-263, 282-284 | R/reviewer-core/test/intent-prompt.test.ts:34-54 | PASS |
| S-AC-15 CRITICAL never muted | prompt.ts:34-43 (SCOPE_RULE, narrowed rule); R/reviewer-core/src/review/run.ts:216-234 (no scope filter); run-executor.ts:306-320 (findings inserted unfiltered) | intent-prompt.test.ts:58-110 — survives `reviewPullRequest` with/without marker. ABSENT: no test that the finding is persisted when an intent is present (intent.it fixture has `findings: []`, line 32); SCOPE_RULE test checks only the marker and "never waives a CRITICAL", not the SUGGESTION-only / WARNING clause | PARTIAL |
| S-AC-16 assembly log | R/server/src/platform/prompt-log.ts:59-69; intent-service.ts:186-193; run-executor.ts:272-277; run.ts:197-199 | R/server/src/platform/prompt-log.test.ts:24-56 (helper shape); intent-prompt.test.ts:143-170 (callback once per LLM call). ABSENT: no test filters `event === 'prompt_assembly'` from a real derive or review (searched all tests for `prompt_assembly`) | PARTIAL |
| S-AC-17 verbose only locally | R/server/src/platform/config.ts:85; prompt-log.ts:70-79. ABSENT: `promptLogVerbose` is read nowhere and no caller passes `previews` or `verbose` (searched server for `promptLogVerbose`, `previews`, `verbose:`) — previews are never logged in any environment, including development with the flag on | prompt-log.test.ts:86-108 (helper and config each in isolation) | PARTIAL |
| S-AC-18 cost | intent-service.ts:202-224; run-executor.ts:291, 334-339 | intent.it.test.ts:338-350, 484-489 | PASS |
| S-AC-19 provider errors | intent-service.ts:47-58, 156-158 | intent.it.test.ts:353-376 | PASS |
| S-AC-20 staleness | intent-service.ts:35 | intent.it.test.ts:392-411 | PASS |
| S-AC-21 untouched | changed.txt lists no smart-diff file, no brief.ts, no 0000–0011 `.sql`; reviewer-core/src imports are only zod, openai, `@devdigest/shared`, local files (derive-intent.ts:1-8, prompt.ts:1, run.ts:1-12). Note: R/server/src/vendor/shared/contracts/platform.ts:210, 218 — `PrDetail.linked_issue` is `IssueMeta.nullish()` and `IssueMeta` gained `is_pull_request` | intent-contracts.test.ts:97-114 — a `git diff` against hardcoded `d735091` that passes silently when git or the commit is missing (line 113); covers migrations `.sql` + smart-diff only. No test for PrBrief, linked_issue, or reviewer-core imports. needs runtime check: `git diff d735091 -- server/src/db/migrations/00{00..11}* server/src/modules/reviews/smart-diff server/src/vendor/shared/contracts/brief.ts` | PARTIAL |
| S-AC-22 forged tags | prompt.ts:45-56 | intent-prompt.test.ts:173-192 | PASS |
| S-AC-23 title is data | prompt.ts:258-260, 274; R/server/src/modules/reviews/helpers.ts:92-102; run-executor.ts:268 | intent-prompt.test.ts:194-206; intent-contracts.test.ts:117-128 | PASS |
| S-AC-24 redaction | R/server/src/app.ts:33-42, 71 | R/server/test/log-redact.test.ts:24-54 (real pino + the exported `LOG_REDACT`; not the Fastify instance, whose logger is off under `NODE_ENV=test`) | PASS |
| S-AC-25 input budget | derive-intent.ts:20, 145, 156-187; intent-service.ts:174-186, 211, 230-243 | derive-intent.test.ts:131-174 (<= 6000 with the default counter, spec cut first); intent.it.test.ts:322-335 (`reason: 'truncated'` on spec sources only) | PASS |
| C-AC-1 | R/client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx:20-36; R/client/src/app/repos/[repoId]/pulls/[number]/page.tsx:139 | OverviewTab.test.tsx:48-64 | PASS |
| C-AC-2 loaded | R/client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:21-36, 79-112 | IntentCard.test.tsx:51-83 | PASS |
| C-AC-3 none yet | IntentCard.tsx:113-125; R/client/src/lib/hooks/intent.ts:9-25 | IntentCard.test.tsx:85-92; OverviewTab.test.tsx:66-73; R/client/src/lib/hooks/intent.test.ts:55-60 | PASS |
| C-AC-4 generating | IntentCard.tsx:78, 85, 120, 126 | IntentCard.test.tsx:94-113 (disabled, aria-busy, text, content stays; the `loading` prop itself is not asserted) | PASS |
| C-AC-5 error | IntentCard.tsx:62-69, 71, 127-131; constants.ts:7-11 | IntentCard.test.tsx:115-136; OverviewTab.test.tsx:75-81 | PASS |
| C-AC-6 i18n | IntentCard.tsx:47 and every label via `t(...)`. ABSENT: IntentCard.tsx:72-73 renders an unknown `reason` as the raw server string, and the server does emit raw error text as a reason (collect-sources.ts:73) | IntentCard.test.tsx:138-144 — only the three confidence labels; nothing asserts "no literal UI text" | PARTIAL |
| C-AC-7 data | intent.ts:11-12, 20-23; R/client/src/lib/hooks/reviews.ts:51 | intent.test.ts:41-88 | PASS |
| C-AC-8 stale | IntentCard.tsx:83 | IntentCard.test.tsx:146-154 | PASS |
| C-AC-9 settings | R/client/src/lib/feature-models.ts:22-26; R/client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:39-40 | R/client/src/lib/feature-models.test.ts:5-10 — registry value only; no test renders the Settings → Models row. needs runtime check: open Settings → Models with no override saved | PARTIAL |
| C-AC-10 showcase / checks | R/client/src/components/showcase/Showcase.tsx:385-400 (loaded, empty, generating, recalc error, load error) | R/client/src/test/smoke.test.tsx mounts the gallery (not opened line by line). needs runtime check: `pnpm typecheck && pnpm test` in client/ | PARTIAL |

| Plan step | Evidence | Status |
|---|---|---|
| A1 contracts | intent.ts (both copies); platform.ts:52-56, 210; trace.ts:64-67; R/server/src/vendor/shared/adapters.ts:169, 243 | PASS |
| A2 schema | reviews.ts:56-64; 0012_nice_wolf_cub.sql:1-9 | PASS |
| A3 repository | R/server/src/modules/reviews/repository/pull.repo.ts:49-125; repository.ts:133-146 | PASS |
| A4 prompt.ts | prompt.ts:16, 34-56, 198-216, 258-284 (SCOPE_RULE follows the spec's narrowed rule, not the plan text) | PASS |
| A5 run.ts | run.ts:84-105, 161-162, 199 | PASS |
| A6 derive-intent | derive-intent.ts:85-272 | PASS |
| B1 adapters | confine-path.ts:9-19; simple-git.ts:131-157; octokit.ts:365-392 | PASS |
| B2 intent module | constants.ts, parse-references.ts, file-outline.ts, collect-sources.ts, intent-service.ts — rejected references are not recorded (see S-AC-9) | PARTIAL |
| B3 prompt-log + config | prompt-log.ts:59-95; config.ts:85 — flag is computed and never consumed (see S-AC-17) | PARTIAL |
| B4 redact | app.ts:33-42, 71 | PASS |
| B5 routes | routes.ts:148-168; service.ts:201-208 | PASS |
| B6 executor | run-executor.ts:120-146, 243-298; helpers.ts:92-102 | PASS |
| C1 messages | R/client/messages/en/intent.json:1-56 | PASS |
| C2 hooks | intent.ts:9-25; reviews.ts:51 | PASS |
| C3 IntentCard | IntentCard.tsx:38-135 | PASS |
| C4 OverviewTab + showcase | OverviewTab.tsx:15-38; page.tsx:139; Showcase.tsx:385-400 | PASS |

### Summary

- **Acceptance criteria:** 26 PASS, 9 PARTIAL, 0 MISSING (server 19 / 6 / 0, client 7 / 3 / 0).
- **Plan steps:** 14 PASS, 2 PARTIAL.
- **Nothing was run.** Every status is from reading code and tests; no suite, typecheck or
  `git diff` was executed.
- **P1:** neither spec labels priorities, so "every P1 is PASS" cannot be stated.
- **No dropped requirement** was found between the specs and the plan. The spec's test table
  places S-AC-11/12/13/15/18 in `run-executor.test.ts`, which was not extended; they are covered
  in `intent.it.test.ts` instead, except the persistence half of S-AC-15.

Answers on the criteria flagged for a closer look:

- **S-AC-12:** in map-reduce there is one `review` `llm_call` line per agent run, summed over
  chunks, not one per chunk (run-executor.ts:292-298). Spec §8 says "for each model call
  (classifier and every review chunk)". The AC's literal "two lines" holds for a single-agent
  review.
- **S-AC-16:** a `prompt_assembly` line is emitted per chunk and once for the classifier, in code.
  No test observes those lines from a real call.
- **S-AC-17:** nothing passes previews. The flag is dead configuration.
- **S-AC-21:** the only guard is a git-based test that skips silently; several clauses have no
  check at all.
- **S-AC-24:** the test uses the real exported `LOG_REDACT` with real pino, but not the Fastify
  logger instance.
- **S-AC-25:** the ceiling is enforced with the injected tokenizer in code. The route-level test
  only asserts a loose bound (`< 57 000` chars), not <= 6 000 tokens; title, issue titles and the
  system text are never cut, so the bound relies on those being short.
- **C-AC-6:** a raw-string fallback exists and the only test covers confidence labels.
- **C-AC-10:** the showcase variants are present; the "checks pass" half needs a run.

### Gaps

- **S-AC-9** — record rejected references. Absolute, `..` and non-`.md` paths need a `sources`
  entry (`skipped` + reason) instead of being dropped in `parseReferences`, with a test asserting
  it. Smaller holes in the same AC:
  - No test covers the pre-read size checks (simple-git.ts:133-136, 152-155; octokit.ts:384) or the
    `readFileAtRef` ref/path validation.
  - The pre-read cap is 80 000 bytes against a 20 000-char limit (collect-sources.ts:33, 82), so
    files in between are read and then discarded.
  - The contents API downloads the body before the size check.
- **S-AC-12** — needs runtime check: run one review and confirm two `llm_call` lines in real
  stdout. To match §8 in map-reduce, emit `llm_call` per chunk. Also add an assertion that the
  "Deriving PR intent" step is distinct from the review step. A second concurrent trigger that
  joins the in-flight derive gets neither a "Deriving" nor a "reused" line in its runs
  (run-executor.ts:140; intent-service.ts:134-135).
- **S-AC-15** — add a server test: review with a stored intent and a stubbed CRITICAL outside
  `in_scope`, assert the finding row is persisted. Add an assertion that SCOPE_RULE contains the
  SUGGESTION-only and WARNING-reported clauses.
- **S-AC-16** — add a test that captures the logger during a recalculate and a review and asserts
  one `prompt_assembly` line per model call with `call`, `correlationId`, `prId`, `provider`,
  `model`, `sections`, `totalTokens`.
- **S-AC-17** — wire it: have the classifier and review call sites pass
  `verbose: config.promptLogVerbose` and `previews` to `logPromptAssembly`, and test through that
  path.
- **S-AC-21** — needs runtime check (the `git diff` above). Add checks for PrBrief,
  `PrDetail.linked_issue` and reviewer-core imports, and make the test fail rather than skip when
  git is unavailable. The spec is at odds with itself on `linked_issue`: it requires `IssueMeta`
  to gain `is_pull_request`, which widens `PrDetail.linked_issue`.
- **C-AC-6** — map or drop unknown reasons instead of rendering the raw server string
  (IntentCard.tsx:73; source collect-sources.ts:73), and add a test that no rendered text falls
  outside `intent.json`.
- **C-AC-9** — add a render test of `SettingsModels` with no override showing
  `deepseek/deepseek-v4-flash`, or check it in the browser.
- **C-AC-10** — needs runtime check: `cd client && pnpm typecheck && pnpm test`.

### Unplanned changes

- R/client/src/lib/hooks/index.ts:11 | re-export of `./intent`; the client spec and plan say not to
  change this file.
- R/server/src/adapters/file-too-large.ts | new `FileTooLargeError` / `isFileTooLarge`; not named in
  the plan.
- R/server/src/vendor/shared/adapters.ts:169, 243 and simple-git.ts:131, 140; octokit.ts:369 | extra
  `maxBytes` parameter on `readFile`, `readFileAtRef`, `getFileContent`; the plan's signatures have
  none.
- R/server/src/platform/prompt-log.ts:70-79 | a third event, `prompt_preview`; the spec names only
  `prompt_assembly` and `llm_call`.
- R/client/messages/en/intent.json:8, 34, 36 | keys `confidence.label`,
  `sources.reason.notMarkdown`, `sources.reason.unavailable` — the first is unused by the
  component, the other two are never emitted by the server.
- R/server/test/helpers/hermetic-env.ts, R/server/vitest.config.ts, R/server/src/db/rows.ts,
  R/server/test/reviews-helpers.test.ts | listed in changed.txt, named by no plan item; contents
  not inspected.
- R/client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/constants.ts,
  R/client/src/components/showcase/constants.ts:90 | not listed in plan step C3/C4 (the plan names
  only `IntentCard.tsx`, `index.ts`, `styles.ts`).

Where the unplanned changes came from: the hooks barrel export, `constants.ts` and `RepoRow` in
`db/rows.ts` are fixes for architecture-review warnings; `maxBytes` and `FileTooLargeError` are a
fix for a security-review finding; `hermetic-env.ts` keeps the test suite away from real provider
keys.

## Pass 2 — after the closing pass

The nine PARTIAL criteria were sent back: the implementer closed the code gaps, the test-writer
added the missing tests (two of them failed against the code and exposed real defects — a refused
reference three characters over its display cap, and the provider's raw error text reaching the
Live Log and the trace — both fixed). The agent then re-verified only those nine rows and plan
steps B2 and B3.

| AC | Code evidence (file:line) | Test evidence (file:line, test name) | Status |
|---|---|---|---|
| S-AC-9 SSRF / traversal | R/server/src/modules/reviews/intent/parse-references.ts:44-57 (`classifyPath` returns a reason), 82-96 (refused refs collected, capped, control chars stripped); R/server/src/modules/reviews/intent/collect-sources.ts:73-76 (each refused ref becomes `spec_file` / `skipped` / reason, before any read), 83-84 (`too_large`), 114-133 (byte cap passed to all three readers); R/server/src/adapters/git/simple-git.ts:131-137 (`stat` before read), 148-155 (hex-ref and path guard, `cat-file -s` before `show`); constants.ts:12, 20-24. ABSENT: on the contents-API path the size check comes after the download — R/server/src/adapters/github/octokit.ts:376-386 fetches the body, then compares `data.size` | parse-references.test.ts:56-103 (reason per refused kind, cap, no control chars, length cap); collect-sources.test.ts:174-185 ("refused references are recorded as skipped spec_file sources with their reason, and never read"), 187-202 (byte cap reaches the git readers); R/server/src/adapters/git/simple-git-read.test.ts:40-63 (real git repo: oversized rejected before read, non-hex ref, `..` and `/` paths); R/server/test/intent.it.test.ts:559-570 (stored sources through the route). ABSENT: no test of `OctokitGitHubClient.getFileContent` with `maxBytes` (searched server tests for `getFileContent`, `too_large`: only the fake at collect-sources.test.ts:48); collect-sources.test.ts:122-129 asserts only "not used, reason truthy", not `skipped` / `too_large` | PARTIAL |
| S-AC-12 two calls visible | R/server/src/modules/reviews/intent/intent-service.ts:171 (step label), 223-230 (classifier `llm_call`); R/server/src/modules/reviews/run-executor.ts:75-80 + 132 (step fanned out to every queued run), 140-144 (joined trigger gets its own line), 293-301 (`llm_call` per model call); R/reviewer-core/src/review/run.ts:223-229 (`onLlmCall` per chunk); stdout wiring R/server/src/modules/reviews/routes.ts:44 (`req.log`) and R/server/src/app.ts:66-71 | intent.it.test.ts:490-517 (step in the run trace, 1 classifier + >=1 review line, one `correlationId`); 573-598 (map-reduce: 2 review lines + 1 classifier, intent entries distinct from review entries); 600-618 (joined trigger line). Lines are asserted on an injected logger, not on stdout. needs runtime check: run one review with the API on and confirm the two `llm_call` lines in the server's stdout | PARTIAL |
| S-AC-15 CRITICAL never muted | R/reviewer-core/src/prompt.ts:34-43 (SCOPE_RULE); run.ts:238-256 (reduce and grounding only; grep for `intent\|scope` in grounding.ts, review/reduce.ts, output/* returns nothing); run-executor.ts:323, 337 (findings inserted unfiltered) | R/reviewer-core/test/intent-prompt.test.ts:58-77 (marker, SUGGESTION-only clause, WARNING/CRITICAL-reported clause, never-waives), 79-107 (survives `reviewPullRequest` with and without marker), 109-126 (intent does not change returned findings); intent.it.test.ts:621-647 ("a CRITICAL in a file outside in_scope is persisted unchanged", both variants, row read from `findings`) | PASS |
| S-AC-16 assembly log | R/server/src/platform/prompt-log.ts:61-71 (only ids, `{name, source, tokens}`, `totalTokens`); intent-service.ts:203-214; run-executor.ts:279-290; run.ts:211-213 (once per chunk; the whole-diff assembly at 181 does not fire it) | intent.it.test.ts:661-689 (exact key set of the line and of each section, markers absent), 691-704 (recalculate: one classifier line), 706-726 (map-reduce review: one line per model call, 2 + 1, one `correlationId`, no description / diff / spec / issue text) | PASS |
| S-AC-17 verbose only locally | R/server/src/platform/config.ts:85; intent-service.ts:200-201, 208-213; run-executor.ts:255, 278, 284-289; run.ts:177; prompt.ts:281, 290; R/reviewer-core/src/intent/derive-intent.ts:113, 122; prompt-log.ts:72-81 (debug, only when `verbose`) | intent.it.test.ts:750-758 (`NODE_ENV=test` + flag: no `prompt_preview` from a real recalculate and review), 760-772 (development + flag: debug `prompt_preview` from both call sites, info lines stay clean); R/server/src/platform/prompt-log.test.ts:102-108 (config false in `production`) | PASS |
| S-AC-21 untouched | R/server/src/vendor/shared/contracts/platform.ts:218 (`linked_issue: IssueMeta.nullish()`; `IssueMeta` gained `is_pull_request` at 210, as the spec requires); smart-diff folder has no `intent` reference (grep, 0 matches). ABSENT: nothing static shows Smart Diff or the 0000–0011 `.sql` contents are byte-unchanged | R/server/test/intent-contracts.test.ts:41-47 (PrBrief four fields, Intent three), 79-96 (journal order and file presence for 0000–0012 — presence, not content), 99-128 (reviewer-core import scan plus a self-check of the scan). ABSENT: no check of `PrDetail.linked_issue`, migration content, or Smart Diff; the pass-1 `git diff` test is gone. needs runtime check: `git diff d735091 -- server/src/db/migrations/00{00..11}* server/src/modules/reviews/smart-diff` prints nothing | PARTIAL |
| C-AC-6 i18n | R/client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx:47, 72-75 (unknown reason → `sources.reason.other`, raw string never rendered), all labels via `t(...)`; constants.ts:17-36; R/client/messages/en/intent.json:26-40. ABSENT: the load-error state shows "Retry", a literal in R/client/src/vendor/ui/primitives/ErrorState.tsx:54, not from `intent.json` (`ErrorState` has no label prop) | IntentCard.test.tsx:170-185 (raw and prototype-like reasons), 187-206 (12 server reason codes), 208-253 (every text node in 14 states is an `intent.json` value or prop data). The last test allowlists "Retry" at line 225, so it does not assert the criterion as written | PARTIAL |
| C-AC-9 settings | R/client/src/lib/feature-models.ts:21-27; R/client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:39-41, 53, 59 | SettingsModels.test.tsx:29-37 ("with no saved override the review_intent row shows deepseek/deepseek-v4-flash with the default tag"), 39-47 (override replaces it) | PASS |
| C-AC-10 showcase / checks | R/client/src/components/showcase/Showcase.tsx:385-401 (loaded, empty, generating, recalc error, load error) | R/client/src/test/smoke.test.tsx:52-71 ("the gallery mounts IntentCard loaded, empty, generating and error"). Checks: the main session's run (client 39 files / 289 tests, typecheck clean), cited as accepted — I ran nothing | PASS |

| Plan step | Evidence | Status |
|---|---|---|
| B2 intent module | parse-references.ts:82-96; collect-sources.ts:73-76; constants.ts:20-24 — refused references are now recorded | PASS |
| B3 prompt-log + config | config.ts:85 is read at intent-service.ts:200 and run-executor.ts:255; previews reach prompt-log.ts:72-81 | PASS |

### Summary

- **Acceptance criteria (the nine):** 5 PASS, 4 PARTIAL, 0 MISSING. With the 26 from pass 1 that
  makes **31 PASS, 4 PARTIAL, 0 MISSING**.
- **Plan steps:** B2 and B3 are both PASS, so all 16 steps pass.
- **Nothing was run** by the agent. Statuses come from reading code and tests; the "checks pass"
  clause rests on the main session's gate run.

### Remaining gaps

- **S-AC-9** — on the GitHub contents path an oversized file is downloaded and then rejected
  (octokit.ts:376-386). To pass: check the size before the body is fetched, and add a test of
  `OctokitGitHubClient.getFileContent` with `maxBytes`. Two residues from pass 1 are unchanged:
  - A file between 20 000 chars and 80 000 bytes is read by the git readers and then discarded
    (collect-sources.ts:83; the reason is written up at constants.ts:13-20).
  - The oversized test (collect-sources.test.ts:122-129) does not assert `skipped` / `too_large`.
- **S-AC-12** — only the literal "stdout" clause is open. To pass: one review with the API running
  and the two `llm_call` lines seen in stdout. A trigger that joins an in-flight derive logs "PR
  intent derived by a concurrent request", not a `Deriving PR intent (…)` step
  (run-executor.ts:140-144).
- **S-AC-21** — to pass: the `git diff` above printing nothing, or a test that fails rather than
  skips when migrations 0000–0011 or `smart-diff/` change, plus an assertion on
  `PrDetail.linked_issue`.
- **C-AC-6** — to pass: the Retry label must come from `intent.json`, which `ErrorState` cannot
  take today, or the owner accepts the design-system label as outside the criterion. The
  raw-reason gap from pass 1 is closed.

### Runtime checks done by the main session afterwards

- **S-AC-21:** `git diff d735091 -- <migrations 0000–0011 .sql> server/src/modules/reviews/smart-diff
  contracts/brief.ts (both copies) contracts/review-api.ts` prints nothing — those files are
  byte-unchanged.
- **S-AC-12 stdout:** not done. It needs the dev stack and a real model call; the stack was left
  down on the owner's instruction.
- **Gate, on the final code:** server `pnpm typecheck` clean, `pnpm test` 43 files / 410 tests;
  reviewer-core `npm run typecheck` clean, `npm test` 74 tests; client `pnpm typecheck` clean,
  `pnpm test` 39 files / 289 tests.

### Follow-up on S-AC-9

`OctokitGitHubClient.getFileContent` with `maxBytes` is now tested
(`server/test/octokit-file-content.test.ts`). The size check there runs after the response
arrives, which is bounded anyway: the GitHub contents API returns at most 1 MB of file content
inline. The client copy of `vendor/shared/adapters.ts` was synced with the server copy.

## Pass 3 — after the live check

Only the four criteria still PARTIAL after pass 2, now with
[`intent-live-check.md`](intent-live-check.md) as evidence for the runtime clauses.

| AC | Code evidence (file:line) | Test / live evidence | Status |
|---|---|---|---|
| S-AC-9 SSRF / traversal | `server/src/modules/reviews/intent/collect-sources.ts`:73-76 (refused refs recorded before any read), 83-84 (`too_large`), 114-133 (own repo only, byte cap to all three readers); `server/src/adapters/git/simple-git.ts`:131-137, 148-155 (size checked before read; hex-ref and path guard); `server/src/adapters/git/confine-path.ts`:9-19; `server/src/adapters/github/octokit.ts`:369-392. ABSENT: (1) `server/src/modules/reviews/intent/parse-references.ts`:92 drops a backticked non-`.md` path without recording it; (2) octokit.ts:376-386 compares `data.size` only after the response with the content has arrived; (3) collect-sources.ts:83 reads then discards a file between 20 000 chars and 80 000 bytes | `collect-sources.test.ts`:99-120 (no fetch, own-repo issues only, no reads), 122-129 (oversized now asserts `skipped` / `too_large`), 174-185 (refused refs recorded with reason); `parse-references.test.ts`:56-103; `server/src/adapters/git/simple-git-read.test.ts`:40-63; `confine-path.test.ts`:34-62; `server/test/octokit-file-content.test.ts`:43-83 (new: over-cap rejected and not returned, boundary, 404 / directory / symlink → null, request limited to owner / repo / path / ref); `server/test/intent.it.test.ts`:559-570. Live: only "spec read from the PR head commit" (live-check row 4); no row exercises a refusal. No test covers the backtick change in either direction | PARTIAL |
| S-AC-12 two calls visible | `server/src/modules/reviews/intent/intent-service.ts`:171 (step label), 223-230 (classifier `llm_call`); `server/src/modules/reviews/run-executor.ts`:75-80 and 132 (step sent to every queued run), 120 (one `correlationId`), 204, 293-301 (review `llm_call` per model call); `server/src/platform/run-logger.ts`:49-53, 75-91 (publishes to every run id) | `intent.it.test.ts`:490-517, 573-598 (step in the trace, distinct from review entries, 1 classifier + N review lines, one `correlationId`), 600-618. Live (`docs/hw3/intent-live-check.md`): stdout shows 1 `intent_classifier` + 1 `review` `llm_call` with one `correlationId`, and the trace shows the Deriving step before "Starting review with agent" | PASS |
| S-AC-21 untouched | `server/src/vendor/shared/contracts/platform.ts`:210, 218 (`linked_issue: IssueMeta.nullish()`; `IssueMeta` gained optional `is_pull_request`); octokit.ts:128-136 (`resolveLinkedIssue` returns `getIssue` output) with 359-366 (`getIssue` now adds `is_pull_request`), so the runtime value of `linked_issue` gains a field. ABSENT: nothing shows `PrDetail.linked_issue` / `resolveLinkedIssue` unchanged | `server/test/intent-contracts.test.ts`:41-47 (`PrBrief`, `Intent`), 79-96 (migrations 0000–0012 present, not content), 99-128 (reviewer-core import scan). Main-session `git diff d735091`: migrations 0000–0011, `smart-diff/`, `brief.ts` (both copies), `review-api.ts` byte-unchanged — `platform.ts` and `octokit.ts` not included. Live: Smart Diff on PR #11 gives five groups. No test and no live row for `linked_issue` | PARTIAL |
| C-AC-6 i18n | `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/IntentCard.tsx`:47, 52-131 (every label via `t(...)`, no literal in the component), 72-75 (unknown reason → `sources.reason.other`). ABSENT: line 66 renders `ErrorState`, whose button text is the literal "Retry" at `client/src/vendor/ui/primitives/ErrorState.tsx`:54 (no label prop, lines 6-16); `client/messages/en/intent.json` has no retry key | `IntentCard.test.tsx`:170-206 (raw reasons never rendered, 12 reason codes), 208-253 (every text node in 14 states) — still allowlists "Retry" at line 225. Live check has no row on this | PARTIAL |

**Total: 32 PASS, 3 PARTIAL, 0 MISSING of 35.** Nothing was run by the agent; S-AC-12 turns PASS on
the live-check report.

### Remaining gaps

- **S-AC-9** — three clauses:
  1. Backticked non-`.md` paths are not recorded (a live-check fix). To pass: the spec excludes
     backticked code paths and a test asserts `rejected` is empty for them. *Done after this pass:
     the spec says so (§3) and a test pins it.*
  2. The contents-API size check runs after the response arrives. GitHub bounds inline content at
     1 MB; nothing in the code enforces that. To pass: a size check before the content request, or
     the owner accepts the bounded download.
  3. Files between 20 000 chars and 80 000 bytes are read by the git readers and then discarded;
     no test drives a reader's `FileTooLargeError` through `collectSources`.
- **S-AC-21** — `PrDetail.linked_issue` "unchanged" has no test or diff, and the spec contradicts
  itself: it requires `IssueMeta` to gain `is_pull_request`, which widens `linked_issue`. The owner
  has to accept that widening.
- **C-AC-6** — the "Retry" label in the load-error state is a literal in the design-system
  `ErrorState`, which takes no label prop. To pass: a label prop fed from `intent.json`, or the
  owner rules the design-system label outside the criterion.

Notes on S-AC-12 (PASS): the live excerpt groups lines by kind, so it is not in emission order;
"in each run's log" is asserted for one-agent triggers, and rests on code for several agents.
