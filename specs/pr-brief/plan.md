# Plan: PR Why + Risk Brief

Spec: `specs/pr-brief/spec.md` (SPEC-01, Status: implemented)

## Goal

Add a `brief` server module (`GET` / `POST /pulls/:id/brief`) that turns computed PR facts into one grounded model reply and stores it in the existing `pr_brief` row together with the head SHA. Add a PR Brief block to the Overview tab (generate, refresh, stale marker, Risk areas, Review focus) and make its entries open the file and line on Files changed. No migration, no new dependency.

## Files

| path | new/modify | what changes | AC |
|---|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts` | modify | add `ReviewFocusItem`, `PrBriefDraft`, `PrBriefGenerateInput`, `PrBriefResponse`; reshape `PrBrief` (see Decision) | AC-16, AC-19 |
| `client/src/vendor/shared/contracts/brief.ts` | modify | byte-identical copy of the file above | AC-16 |
| `server/test/contracts.test.ts` | modify | parse cases for the new schemas, plus a "both copies identical" case | AC-16 |
| `reviewer-core/src/prompt.ts` | modify | `export` the existing `INJECTION_GUARD` const (no text change) | AC-15 |
| `reviewer-core/src/index.ts` | modify | re-export `INJECTION_GUARD` | AC-15 |
| `server/src/prompts/brief.system.md` | new | instruction template (no JSON description, no examples of paths) | AC-15 |
| `server/src/modules/brief/constants.ts` | new | feature id, budget, caps, time limit, schema name, error codes | AC-8, AC-14, AC-17 |
| `server/src/modules/brief/helpers.ts` | new | pure: hunk ranges, facts, grounding, input build and reduction | AC-6–8, AC-10–12, AC-14, AC-15 |
| `server/src/modules/brief/helpers.test.ts` | new | unit tests for the above | same |
| `server/src/modules/brief/repository.ts` | new | `BriefRepository` over `pr_brief` (`get`, `upsert`) | AC-18, AC-19 |
| `server/src/modules/brief/service.ts` | new | `BriefService.get` / `.generate` | AC-9, AC-12, AC-13, AC-16–19 |
| `server/src/modules/brief/service.test.ts` | new | unit, mocked repository, `MockLLMProvider` | same |
| `server/src/modules/brief/routes.ts` | new | the two routes | AC-2, AC-18, AC-30 |
| `server/src/modules/brief/brief.it.test.ts` | new | HTTP + real Postgres | AC-2, AC-9, AC-17–19, AC-21, AC-30 |
| `server/src/modules/index.ts` | modify | one import + one registry entry | AC-2 |
| `client/src/lib/hooks/brief.ts` | new | `usePrBrief`, `useGenerateBrief` | AC-2, AC-18 |
| `client/src/lib/hooks/brief.test.ts` | new | hook tests | AC-2, AC-18 |
| `client/src/lib/hooks/index.ts` | modify | `export * from "./brief"` | AC-2 |
| `client/messages/en/brief.json` | modify | add keys (existing keys stay) | AC-29 |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBriefBlock/{PrBriefBlock.tsx,index.ts,constants.ts,helpers.ts,styles.ts}` | new | presentational block | AC-1, AC-3, AC-5–7, AC-20, AC-21, AC-24–29 |
| `.../_components/PrBriefBlock/PrBriefBlock.test.tsx` | new | component tests | same |
| `client/src/components/showcase/Showcase.tsx`, `constants.ts` | modify | gallery group and fixture for `PrBriefBlock` | AC-3 |
| `client/src/components/diff-viewer/helpers.ts` | modify | `DiffTarget` type, `hasNewLine(lines, n)` | AC-22, AC-23 |
| `client/src/components/diff-viewer/constants.ts` | modify | `TARGET_HIGHLIGHT_MS` | AC-22 |
| `client/src/components/diff-viewer/styles.ts` | modify | target highlight style (CSS vars only) | AC-22 |
| `client/src/components/diff-viewer/index.ts` | modify | export `DiffTarget` | AC-22 |
| `client/src/components/diff-viewer/FileCard/FileCard.tsx` | modify | optional `target` prop: force open, scroll, highlight | AC-22, AC-23 |
| `client/src/components/diff-viewer/CodeLine/CodeLine.tsx` | modify | optional `highlighted` prop | AC-22 |
| `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx` | modify | pass `target` to the matching `FileCard` | AC-22, AC-23 |
| `client/src/components/diff-viewer/FileCard/FileCard.test.tsx` | modify | target cases | AC-22, AC-23 |
| `.../_components/DiffTab/DiffTab.tsx` | modify | optional `target` prop: open the role group and card | AC-22, AC-23 |
| `.../_components/DiffTab/DiffTab.test.tsx` | modify | collapsed-group target case | AC-22 |
| `.../_components/OverviewTab/OverviewTab.tsx` | modify | call the brief hooks, render `PrBriefBlock` above Blast radius | AC-1, AC-2, AC-4 |
| `.../_components/OverviewTab/OverviewTab.test.tsx` | modify | brief wiring cases | AC-2, AC-4, AC-28 |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | modify | `openInDiff` (target in page state), pass target to `DiffTab` | AC-22, AC-23 |

Not touched: `server/src/db/schema/reviews.ts`, `server/src/db/migrations/**`, every lock file, the LLM providers (`server/src/adapters/llm/**`, `reviewer-core/src/llm/**`) and both `vendor/shared/adapters.ts` copies.

## Decision: PrBrief contract

**Choice: a combination.** A separate schema for the model's reply (b), and a reshaped stored/served `PrBrief` with `intent` and `history` nullable (a).

Evidence:

- `PrBrief` has no runtime consumer. The only references outside the two contract files are a type re-export at `client/src/lib/types.ts:35` and the `pr_brief` table definition (`server/src/db/schema/reviews.ts:57-62`). Nothing reads or writes the table, so no stored row and no caller constrains the shape.
- Today's `PrBrief` (`server/src/vendor/shared/contracts/brief.ts:127-132`) requires `intent`, `blast`, `risks`, `history`. This fork has no intent and no history (NG1, NG5), and a stored blast snapshot is a non-goal (NG5). The model must not emit blast, head SHA, intent or history.
- `completeStructured` validates the reply against the schema it is given and hands the same schema to the provider as `json_schema` / tool input (`server/src/adapters/llm/openai.ts:89,103-106`, `anthropic.ts:90,108-115`). The model's schema must therefore contain only what the model writes.

Shapes (identical in both copies):

```ts
ReviewFocusItem      = { file: string, line: int, reason: string }
PrBriefDraft         = { summary: string, risks: Risk[], review_focus: ReviewFocusItem[] }   // the model's reply
PrBrief              = PrBriefDraft.extend({ head_sha: string, intent: Intent.nullable(), history: PrHistory.nullable() })
PrBriefGenerateInput = { head_sha: string (min 1, max 64) }                                   // POST body
PrBriefResponse      = { brief: PrBrief.nullable() }                                          // GET and POST 200
```

- `Risk` is reused unchanged (`brief.ts:61-67`). `file_refs` stay plain paths with no line suffix.
- `PrBrief.risks` becomes `Risk[]`, not the `Risks` wrapper. `blast` is removed from `PrBrief`. `Intent`, `PrHistory`, `Risks`, `BlastRadius` exports stay.
- `intent` and `history` stay in `PrBrief` as nullable fields and are always written as `null` in this fork. **Decided by the spec owner (cross-model review F-3 proposed removing them):** they are fields of the starter contract, to be filled by the Intent Layer and PR history when those exist, so the stored JSON shape will not have to change; and `null` lets the UI show "no intent available" from the data rather than from a hard-coded assumption (AC-5).
- `PrBriefDraft` carries no refinements (`min`, `positive`, `max`). Strict `json_schema` is sent as-is (`openai.ts:105`) and number or length keywords are a rejection risk. Positivity of `line` and the caps are enforced by grounding.
- `GET` returns `200 { brief: null }` when nothing is stored, so "no brief yet" is never confused with the `404` of AC-30 or a load failure (AC-27).

**Head SHA** lives inside the stored JSON as `PrBrief.head_sha`, as the requirements say. It is the value the client sends in `PrBriefGenerateInput.head_sha`, i.e. the SHA the page shows (AC-19). The server never substitutes `pull_requests.head_sha`.

**Migration: none.** `pr_brief` is already `pr_id` primary key + `json jsonb not null`. One row per PR is the primary key (AC-19); "last write wins" is `onConflictDoUpdate` on `pr_id` (EC-8).

## Implementation notes

### Input reduction (AC-14)

- Budget: `BRIEF_INPUT_TOKEN_BUDGET = 8_000`. It covers the whole input: system text (template + injection guard) plus the user message. The JSON-schema / tool envelope a provider adds around the messages is not counted.
- Measured as `container.tokenizer.count(system + "\n\n" + user)` (`server/src/platform/container.ts:134-138`; `server/src/adapters/tokenizer/index.ts:28-42`, cl100k_base, `ceil(chars/4)` fallback at `:24-26`).
- The builder is a pure function taking `count` as an argument. Build the full input first; if over budget, cut in this order, recounting the whole input after each cut and stopping as soon as it fits:
  1. Blast radius caller files, one caller file at a time, last in blast order first (blast order is rank-descending, `server/src/modules/blast/helpers.ts:40-41,67`). The blast summary line stays.
  2. File rows with role `boilerplate` or `docs`, lowest churn (`additions + deletions`) first.
  3. The tail of the PR description: keep the longest prefix that fits; if an empty description still does not fit, drop the description section.
  4. Collapse every remaining file's ranges to one range: first line of its first range to last line of its last range.
  5. Remaining file rows role by role — `tests`, then `wiring`, then `core` — lowest churn first within a role.
  6. The tail of the PR title: keep the longest prefix that fits, ending in `…` (review F-2).
- After step 5 only instructions, title and blast summary remain. The instructions are fixed (under 1 500 tokens, tested) and the blast summary is four counts (`blast/helpers.ts:31-38`), so the title is the only unbounded part left; step 6 bounds it, so the loop always terminates within the budget. A generation is never failed for size.
- Hunk bodies are never sent. The builder never receives a patch, only the ranges derived from it.
- The builder returns `{ system, user, tokens }`; `tokens` is the number that goes into the log record.

### Facts and model input (AC-15)

- PR row: `container.reviewRepo.getPull(workspaceId, prId)` (`server/src/modules/reviews/repository/pull.repo.ts:9-19`) gives title and body.
- Files: `container.reviewRepo.getPrFiles(prId)` (`pull.repo.ts:29-34`) gives path, additions, deletions, patch.
- Role: `classifyFile(path)` (`server/src/modules/_shared/classify-file.ts:48-54`).
- Hunk ranges: new side, from hunk headers only. A line-anchored `@@ -a[,b] +c[,d] @@` match per patch line gives `c .. c+d-1` (`d` defaults to 1; `d = 0` gives no range). Do not use `parseUnifiedDiff` on a bare patch: it drops hunks that have no `diff --git` / `+++` header (`server/src/adapters/git/diff-parser.ts:33-44,62`), and stored patches are bare (`server/src/modules/reviews/diff-loader.ts:36-42` has to synthesize headers).
- Blast: `new BlastService(container, log).forPull(workspaceId, prId)` (`server/src/modules/blast/service.ts:19-61`) inside `try/catch`. On a throw the brief proceeds with PR files only. A degraded result is used as-is.
  - Service-to-service use follows `server/src/modules/conventions/service.ts:86`.
  - Call it only after the "no recorded files" check: with zero files `forPull` triggers a GitHub refresh (`service.ts:27-38`).
- Sent to the model: title; description when present; one row per file `path | +A -D | role | 10-13,40-52`; when blast succeeded, its `summary` (`blast/helpers.ts:31-38`) and one `file:line` per caller.
- Not sent: caller names, symbol names, anything in NFR-3.
- "No recorded changed files" (AC-9) is checked against stored `pr_files` only; the refusal does not try a GitHub refresh.
- Row order: role order of `SmartDiffRole` (`brief.ts:92`), highest churn first.

### Untrusted data

- Title, description, the file-row block and the caller block are each wrapped with `wrapUntrusted(label, text)` (`reviewer-core/src/prompt.ts:30-34`, exported at `reviewer-core/src/index.ts:17`). Labels: `pr-title`, `pr-description`, `changed-files`, `blast-callers`.
- System text = `renderPrompt('brief.system.md', {})` (`server/src/platform/prompts.ts:40-42`) + `"\n\n"` + `INJECTION_GUARD` — the same composition as `reviewer-core/src/prompt.ts:150`. The guard is a module-private `const` today (`prompt.ts:16-28`); T-4 exports it, text unchanged.
- The template describes the job only. Per `reviewer-core/CLAUDE.md` it does not describe the JSON shape.
- The reply is trusted only through schema validation plus grounding. In the client it is rendered as React text nodes only (no `dangerouslySetInnerHTML`, no markdown renderer). A model-supplied path becomes a navigation target only after grounding and only when it is in the PR's files.

### Grounding (AC-6, AC-7, AC-8, AC-10, AC-11, AC-12)

- Allowed path set = PR file paths ∪ `changed_symbols[].file` ∪ `downstream[].callers[].file`.
- Known lines: for a changed file, every new-side line inside its hunk-header ranges; for a caller file, its caller lines; for a file that is both, the union. A file with no patch has no known lines (EC-4).
- Path comparison: exact string match after stripping one leading `./` from the model's path. Case differences, a leading `/`, backslashes do not match. The stored path is the normalized (allowed-set) form.
- Checks run against the full facts — the full allowed set and the full uncollapsed ranges — never against the reduced input.
- Order of operations:
  1. Filter each risk's `file_refs`; drop a risk left with none.
  2. Drop focus items whose file is not allowed or whose line is not known.
  3. Stable-sort risks high → medium → low (model order kept within a severity).
  4. Cap at `MAX_RISKS = 7` and `MAX_FOCUS = 5`.
- A brief with zero risks and zero focus items is still stored (EC-5).
- Risk file references carry no line: `Risk.file_refs` stays `string[]` of plain paths (`server/src/vendor/shared/contracts/brief.ts:61-67`) and grounding is exact-path, so a `path:line` from the model is dropped. For AC-23 a risk click therefore always lands at the top of the file; the "line not shown" branch applies to focus items on a caller line outside the rendered patch.

### Model call (AC-13, AC-16, AC-17)

- Model: `resolveFeatureModel(container, workspaceId, 'risk_brief')` (`server/src/modules/settings/feature-models.ts:51-57`; slot at `server/src/vendor/shared/contracts/platform.ts:17,58-64`; client mirror `client/src/lib/feature-models.ts:29`). Resolve it and `container.llm(provider)` only after all code-only work (server INSIGHTS 2026-09-22).
- Call pattern: `server/src/modules/conventions/service.ts:269-301`, with `schema: PrBriefDraft`, `schemaName`, `temperature: 0`, `maxTokens: 4_000`, `timeoutMs: 60_000`, `maxRetries: 0`.
- **Single request — decision and known limitation.** The providers are not changed. The service passes `maxRetries: 0`, which turns off the re-ask loop on an invalid reply (`req.maxRetries ?? 2` at `openai.ts:90-96`, `anthropic.ts:92-99`, `reviewer-core/src/llm/openrouter.ts:61-68`). In the normal case that re-ask is the only possible second request, so a generation sends exactly one.
- Network-level retries stay exactly as they are for reviews — a deliberate decision: `withRetry` on 429/5xx/network (`openai.ts:97`, `anthropic.ts:100`; `server/src/platform/resilience.ts:35-50`) and the SDK's own retries (`openai.ts:52`, `anthropic.ts:46`, `openrouter.ts:54-55`). Known limitation: when the provider answers 429/5xx or the connection drops, the same request may be re-sent, so AC-13 holds for every generation in which the provider answers the first request. A re-sent request carries the same input; no extra reply is ever accepted.
- Time limit: 60 s. The service wraps the provider call in `withTimeout(..., 60_000)` (`resilience.ts:13-24`) so the limit holds for every provider and for mocks; `timeoutMs` is also passed so a provider that honours it aborts (the OpenRouter provider does not read it today, `openrouter.ts:69-84`; there a late reply is simply discarded). A timeout is a failed generation.
- Failure handling: any throw in the model stage (no API key → `ConfigError` from `container.ts:182,190,197`; transport; invalid reply; timeout) is caught and rethrown as one `ExternalServiceError` with a fixed message and `details: { reason }`, where `reason ∈ no_api_key | timeout | invalid_reply | provider_error`. Never rethrow the adapter error: it carries `{ raw }` (`openai.ts:132-134`, `anthropic.ts:147-149`) and the error handler sends `details` to the client (`server/src/app.ts:153-157`). Nothing is stored on failure.
- Log: exactly one `log.info` per generation that reaches the model stage — `{ prId, provider, model, inputTokens, outcome: 'stored' | 'failed' }`, message `brief: generation`. No title, no paths, no reply, no key. A generation that fails at the model stage for a missing key or a timeout still logs its record. Refusals before the model stage (404, no recorded files) log no generation record.

### Code facts the client work builds on

- Deep-linking today is only `?tab=` (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:62-70`); a tab change replaces history (`page.tsx:68`), which stays (NG9). The file/line target is kept in page state and is not written to the address.
- The AC-24 note is always visible on a not-in-diff entry, not revealed on click; the entry has no click handler.
- Server error text is never shown (AC-29): the client maps the error code to `brief.json` copy (`brief_no_files` → `error.noFiles`, anything else → `error.generate`).
- `DiffTab` is mounted only while `tab === "diff"` (`page.tsx:168`), so a target is known at mount.
- A file card has no anchor and opens by size or by its group (`client/src/components/diff-viewer/FileCard/FileCard.tsx:65-67`; `DiffTab/constants.ts:10-17`; `DiffTab.tsx:152-154`). A role group keeps its own open state from `defaultOpen` (`DiffRoleGroup/DiffRoleGroup.tsx:32`).
- A line row's key has no file: `data-line-key="RIGHT:<n>"` (`CodeLine/CodeLine.tsx:63`). Look it up inside the card's own root, never document-wide.
- Only patch lines are rendered (`diff-viewer/helpers.ts:12-38`), so a known caller line of a changed file can be "not shown" → top of file (AC-23).
- Head SHA: the page shows `pr.head_sha` from `GET /pulls/:id` — GitHub's live SHA (`server/src/adapters/github/octokit.ts:98`), or the stored one offline (`server/src/modules/pulls/routes.ts:256`). The detail import does not persist it (`server/src/modules/pulls/repository.ts:44-54`). Generation and the stale check both use the value the page holds; `OverviewTab` already receives it (`page.tsx:140`).
- Overview today: description + blast (`OverviewTab/OverviewTab.tsx:22-42`).
- `client/messages/en/brief.json` exists and no code reads it (no `useTranslations("brief")` anywhere).
- 100-file cap (`octokit.ts:79-84`): known limitation, no work (EC-10).

## Tasks

### T-1 — Brief contract in both vendor copies
AC: AC-16, AC-19
Files: `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts`, `server/test/contracts.test.ts`
Test: `server/test/contracts.test.ts` —
- `PrBriefDraft` accepts `{summary, risks, review_focus[{file,line,reason}]}` and rejects a missing `summary`, a string `line`, and a focus item without `reason`.
- `PrBrief` requires `head_sha` and accepts `intent: null, history: null`.
- `PrBriefResponse` accepts `{brief: null}`.
- The two `contracts/brief.ts` files are byte-identical (read both with `node:fs`, compare).
Verify: `pnpm typecheck && pnpm exec vitest run test/contracts.test.ts` in `server/`; `pnpm typecheck` in `client/`
Skills: zod, typescript-expert
Depends on: —

### T-2 — Export the injection guard from reviewer-core
AC: AC-15
Files: `reviewer-core/src/prompt.ts`, `reviewer-core/src/index.ts`
Change: `export` the existing module-private `INJECTION_GUARD` const (`prompt.ts:16-28`) and re-export it from `index.ts`. No text change, no behaviour change. This is the only reviewer-core change in the plan; the LLM providers are not touched (the single-request policy is a call option set by the service in T-5).
Test: the existing `reviewer-core` suite stays green (the guard text is unchanged); its use is asserted in T-4 — `server/src/modules/brief/helpers.test.ts` › the system text ends with `INJECTION_GUARD`.
Verify: `npm run typecheck && npm test` in `reviewer-core/`; `pnpm typecheck` in `server/`
Skills: typescript-expert
Depends on: —

### T-3 — Facts and grounding helpers (pure)
AC: AC-6, AC-7, AC-8, AC-10, AC-11, AC-12
Files: `server/src/modules/brief/constants.ts`, `server/src/modules/brief/helpers.ts`, `server/src/modules/brief/helpers.test.ts`
Signatures: `hunkRanges(patch): LineRange[]` · `buildFacts(pull, files, blast | null): BriefFacts` (file rows, callers, `allowedPaths: Set<string>`, `knownLines: Map<string, Set<number>>`) · `groundDraft(draft, facts): Pick<PrBrief, 'summary' | 'risks' | 'review_focus'>`
Test: `server/src/modules/brief/helpers.test.ts` —
- `hunkRanges`: multi-hunk patch, `+c` without count, `+c,0`, null patch.
- Risk refs outside the allowed set are removed; a risk with none left is dropped (AC-10).
- A focus item with an unknown file or a line outside the known lines is dropped; a caller line of an unchanged caller file is kept; a file without a patch has no known lines (AC-11).
- `./src/a.ts` matches `src/a.ts`; `/src/a.ts`, `SRC/a.ts`, `src\a.ts` do not; stored paths are normalized (AC-12).
- With `blast = null` only PR files are allowed (AC-12).
- Risks are stably sorted high → low; focus keeps model order (AC-6, AC-7).
- 9 grounded risks + 7 grounded focus items → 7 and 5, counted after grounding and sorting (AC-8).
- Everything fails grounding → summary kept, both lists empty (EC-5).
Verify: `pnpm typecheck && pnpm exec vitest run src/modules/brief/helpers.test.ts` in `server/`
Skills: onion-architecture, typescript-expert, security
Depends on: T-1

### T-4 — Model input builder with budget reduction
AC: AC-14, AC-15
Files: `server/src/prompts/brief.system.md`, `server/src/modules/brief/helpers.ts`, `server/src/modules/brief/helpers.test.ts`
Signature: `buildBriefInput(facts, system, count, budget): { system: string; user: string; tokens: number }`
Test: `server/src/modules/brief/helpers.test.ts` —
- The user message contains the title, the description, each path with `+A -D`, its role and its ranges as numbers, the blast summary and each caller `file:line` (AC-15).
- It contains no patch text, no caller name, no symbol name (AC-14, NFR-3).
- With no description the section is absent (EC-1).
- Title, description, file block and caller block each sit inside an `<untrusted source="…">` block (EC-11).
- Parameterized over title, description, a changed-file path and a caller path: a value containing `</untrusted>` plus an instruction-like line is escaped, stays inside its own block, and the input has exactly one opening and one closing delimiter per block (review F-4).
- With a deterministic `count` and an oversized fixture, `tokens ≤ 8000` at every stage, and the cuts happen in the documented order: callers go before any file row; `boilerplate`/`docs` rows go lowest churn first; the description is truncated before ranges collapse; ranges collapse to one per file before `tests` → `wiring` → `core` rows go.
- A fixture where every row must go still returns an input containing the title and blast summary, and never throws.
- A fixture whose title alone exceeds the budget returns `tokens ≤ 8000` with a truncated title ending in `…`, and never throws (review F-2).
- The system text ends with the `INJECTION_GUARD` exported in T-2, and measured with the real `TiktokenTokenizer` it is under 1 500 tokens.
Verify: `pnpm typecheck && pnpm exec vitest run src/modules/brief/helpers.test.ts` in `server/`
Skills: security, typescript-expert, onion-architecture
Depends on: T-2, T-3

### T-5 — Brief repository and service
AC: AC-9, AC-12, AC-13, AC-16, AC-17, AC-19
Files: `server/src/modules/brief/repository.ts`, `server/src/modules/brief/service.ts`, `server/src/modules/brief/service.test.ts`, `server/src/modules/brief/constants.ts`
Signatures: `BriefRepository.get(workspaceId, prId): Promise<unknown | undefined>` (joins `pull_requests` for the workspace scope) · `BriefRepository.upsert(prId, brief: PrBrief): Promise<void>` · `BriefService(container, log)` with `get(workspaceId, prId): Promise<PrBriefResponse>` and `generate(workspaceId, prId, headSha): Promise<PrBriefResponse>`
Order inside `get`: workspace-scoped pull lookup via `reviewRepo.getPull` (missing or other workspace → 404) → `BriefRepository.get` → `safeParse` (review F-1). "No row" is therefore never confused with "no such PR".
Order inside `generate`: pull (404) → files (empty → `AppError('brief_no_files', …, 409)`) → blast (try/catch) → facts → input and token count → resolve model → one model call under the 60 s limit → ground → upsert with `head_sha`, `intent: null`, `history: null` → log.
Test: `server/src/modules/brief/service.test.ts` (repository, `../blast/service.js` and `../settings/feature-models.js` mocked as in `server/src/modules/conventions/service.test.ts:40-45`; `new MockLLMProvider(undefined, opts)`) —
- No recorded files → 409 `brief_no_files`, `llm.calls` empty, no upsert, and `BlastService` not called (AC-9).
- Success → `llm.calls.length === 1`, the request carries `maxRetries: 0`, `timeoutMs: 60000`, `schema === PrBriefDraft` (AC-13).
- An invalid reply (a fixture that fails the schema) → `ExternalServiceError` without `raw`, the provider was called exactly once, no upsert (AC-13, AC-16, EC-6).
- `container.llm` rejecting with `ConfigError` → failure, zero model calls, no upsert (EC-6).
- A provider that never resolves, with fake timers advanced 60 s → failure, no upsert.
- Provider and model are exactly what the stubbed `resolveFeatureModel` returned, and it was called with `'risk_brief'` (AC-17).
- The stored brief carries the `headSha` argument, not the pull row's SHA (AC-19, EC-7).
- With a tiny `count` budget forcing rows out of the input, a reply citing a cut file still survives grounding (AC-12).
- Blast throwing → the brief is still stored, grounded on PR files only (AC-12, EC-2).
- Exactly one `log.info` with `prId`, `provider`, `model`, `inputTokens`, `outcome`; the serialized record contains neither the PR title nor a key (NFR-5).
- `get` returns `{brief: null}` for no row and for a row that fails `PrBrief`.
- `get` for a PR that `getPull` does not return (missing or other workspace) → `NotFoundError`, and `BriefRepository.get` is not called (AC-30, review F-1).
Verify: `pnpm typecheck && pnpm exec vitest run src/modules/brief/service.test.ts` in `server/`
Skills: onion-architecture, drizzle-orm-patterns, zod, security
Depends on: T-1, T-4

### T-6 — Brief routes and module registration
AC: AC-2, AC-9, AC-17, AC-18, AC-19, AC-21, AC-30
Files: `server/src/modules/brief/routes.ts`, `server/src/modules/index.ts`, `server/src/modules/brief/brief.it.test.ts`
Routes: `GET /pulls/:id/brief` (`params: IdParams`, `response 200: PrBriefResponse`) · `POST /pulls/:id/brief` (`params: IdParams`, `body: PrBriefGenerateInput`, `response 200: PrBriefResponse`). Both use `getContext` and `IdParams` (`server/src/modules/_shared/context.ts:14`, `schemas.ts:11`) and follow the route shape of `server/src/modules/blast/routes.ts:13-26`.
Test: `server/src/modules/brief/brief.it.test.ts` (testcontainers; setup as `server/test/blast.it.test.ts:41-105`; recording `repoIntel` mock; provider id taken from `FEATURE_MODELS` as in `conventions.it.test.ts:40`) —
- `GET` before any generation → `200 {brief: null}`.
- `POST {head_sha}` → `200` with a brief whose `head_sha` equals the body; `pr_brief` has one row (AC-2, AC-19).
- `GET` afterwards returns the same brief, and the LLM mock's call count did not change (AC-18).
- A second `POST` with another SHA → still one row, new SHA, one more model call (AC-19, AC-21).
- PRs with status `closed` and `merged` generate (AC-9).
- A PR without `pr_files` → `409 brief_no_files`, no model call (AC-9).
- After `PUT /settings` with `feature_models.risk_brief` set to an opaque model, the next call's `req.model` equals it; before that it equals the registry default (AC-17).
- A PR of another workspace → `404 not_found` on both verbs (AC-30).
- A missing or empty `head_sha` → `422`.
Verify: `pnpm typecheck && pnpm test` in `server/` (integration needs Docker)
Skills: fastify-best-practices, onion-architecture, zod
Depends on: T-5

### T-7 — Client data hooks for the brief
AC: AC-2, AC-18
Files: `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/brief.test.ts`, `client/src/lib/hooks/index.ts`
Signatures: `usePrBrief(prId)` → query `["pr-brief", prId]`, `api.get<PrBriefResponse>` · `useGenerateBrief(prId)` → mutation `(headSha: string) => api.post<PrBriefResponse>(…, { head_sha: headSha })`; on success it writes the response into the query cache; on error the cache is untouched.
Contract types are `import type` only (`client/src/lib/feature-models.ts:6-11`). Pattern: `client/src/lib/hooks/blast.ts:9-15`, `client/src/lib/hooks/conventions.ts:66-70`.
Test: `client/src/lib/hooks/brief.test.ts` (`../api` mocked as in `client/src/lib/hooks/reviews.test.ts:7-18`) —
- Mounting `usePrBrief` issues one `api.get` to `/pulls/pr1/brief` and no `api.post` (AC-18).
- `useGenerateBrief().mutateAsync("sha1")` posts `{ head_sha: "sha1" }`, and afterwards the query data is the returned brief without a refetch (AC-2).
- A rejected mutation leaves the previous query data in place.
- `prId = null` disables the query.
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: T-1

### T-8 — PrBriefBlock component, messages, showcase
AC: AC-1, AC-3, AC-5, AC-6, AC-7, AC-20, AC-21, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29
Files: `client/messages/en/brief.json`, `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBriefBlock/*`, `client/src/components/showcase/Showcase.tsx`, `client/src/components/showcase/constants.ts`
Props (presentational, no hooks for data):
`{ status: "loading" | "loadError" | "ready"; brief: PrBrief | null; headSha: string; prFilePaths: ReadonlySet<string>; generating: boolean; generateError: "noFiles" | "failed" | null; onGenerate(): void; onRetryLoad(): void; onOpenFile(path: string, line: number | null): void }`
New message keys (camelCase; existing keys untouched): `title`, `generate`, `refresh`, `stale`, `block.summary`, `block.riskAreas`, `block.reviewFocus`, `noFocus`, `inputs.noIntent`, `inputs.noSpecs`, `notInDiff` (= `File not in this PR's diff`), `severity.high|medium|low`, `loading`, `generating`, `error.load`, `error.generate`, `error.noFiles`, `error.retry`. Reuse existing `noRisks`.
Behaviour notes:
- "Generate brief", "Refresh" and "Try again" carry three distinct labels (client INSIGHTS, duplicate-name button error).
- Server error text is never rendered: the block maps `generateError` to `error.noFiles` / `error.generate`.
- All model text goes into text nodes.
- A file reference inside a risk stops click propagation so it does not toggle the row.
- An entry whose path is not in `prFilePaths` renders as plain text with the `notInDiff` note next to it and has no click handler.
Test: `PrBriefBlock.test.tsx` (messages from `brief.json`) —
- `ready` + no brief → the `generate` button, no lists (AC-1).
- With a brief → summary, Risk areas, Review focus; each empty list shows `noRisks` / `noFocus` (AC-3).
- Both `inputs.*` statements are shown with a brief and absent without one (AC-5).
- Each risk shows title, severity label and at least one path, in the order given (AC-6).
- Each focus item shows `file:line` and reason, in the order given (AC-7).
- `brief.head_sha !== headSha` → `stale` text, brief still shown; equal → no marker (AC-20).
- A refresh button is present with a brief and calls `onGenerate` in both the stale and fresh case (AC-21).
- A focus item and a risk ref for a path outside `prFilePaths` show `notInDiff`, and clicking does not call `onOpenFile`; an in-diff focus item calls `onOpenFile(path, line)` and an in-diff risk ref calls `onOpenFile(path, null)` (AC-24).
- The explanation is absent initially; a click on the risk row shows it and a second click hides it; a click on the file reference does not toggle it (AC-25).
- `generating` → skeleton test id present; the generate/refresh button is disabled (AC-26).
- `generating` together with `generateError: "failed"` → the "Try again" button is disabled too; it is a generation control (AC-26, review F-7).
- `loading` → placeholder and no generate button; `loadError` → `error.load` copy and no generate button. Assert on copy, not on `role="alert"` (AC-27; client INSIGHTS 2026-09-22).
- `generateError: "failed"` with a previous brief → `error.generate` + `error.retry` button + the brief still rendered; `"noFiles"` → `error.noFiles` (AC-28, AC-9).
- A summary containing `<img src=x onerror=alert(1)>` renders as text and `queryByRole("img")` is null (NFR-4).
- Every asserted label is read from the imported `brief.json` (AC-29).
- `client/src/test/smoke.test.tsx` still mounts the gallery with the new group.
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library, security
Depends on: T-1

### T-9 — Files changed accepts a file/line target
AC: AC-22, AC-23
Files: `client/src/components/diff-viewer/{helpers.ts,constants.ts,styles.ts,index.ts}`, `client/src/components/diff-viewer/FileCard/FileCard.tsx`, `client/src/components/diff-viewer/CodeLine/CodeLine.tsx`, `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`, `client/src/components/diff-viewer/FileCard/FileCard.test.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx`, `.../DiffTab/DiffTab.test.tsx`
Shapes: `DiffTarget = { path: string; line: number | null }` · `FileCard` prop `target?: { line: number | null }` · `CodeLine` prop `highlighted?: boolean` · `DiffViewer` and `DiffTab` prop `target?: DiffTarget | null`. All optional, so existing callers and the showcase compile unchanged.
Behaviour:
- A targeted `FileCard` starts open regardless of size and `defaultOpen`.
- On mount it looks for `[data-line-key="RIGHT:<line>"]` inside its own root. Found → scroll that row into view and mark it highlighted for `TARGET_HIGHLIGHT_MS`. No line, or line not rendered (`hasNewLine` false) → scroll the card's top into view.
- `DiffTab` passes `defaultOpen = meta.startsOpen || group contains target.path` to `DiffRoleGroup` (`DiffTab.tsx:152`) and the target to the matching card in both the grouped and the `DiffViewer` branch (`DiffTab.tsx:140-162`).
- No change to `DiffRoleGroup` itself.
Test:
- `FileCard.test.tsx` (stub `Element.prototype.scrollIntoView` — jsdom has none): with `target {line: 3}` and `defaultOpen={false}`, the body is rendered, the `RIGHT:3` row carries the highlight marker, and `scrollIntoView` was called on that row. After `TARGET_HIGHLIGHT_MS` (fake timers) the marker is gone. `target {line: 999}` and `target {line: null}` → no row is highlighted and `scrollIntoView` was called on the card root. No target → `scrollIntoView` not called.
- `DiffTab.test.tsx`: with `target {path: "README.md", line: 2}` the `docs` group button has `aria-expanded="true"` and the README card body is rendered; the `boilerplate` group stays collapsed.
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, react-best-practices, react-testing-library
Depends on: —

### T-10 — Overview wiring and navigation from the brief
AC: AC-1, AC-2, AC-4, AC-18, AC-21, AC-22, AC-23, AC-26, AC-27, AC-28
Files: `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`, `.../OverviewTab/OverviewTab.test.tsx`, `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`
Changes:
- `OverviewTab` gains props `files: PrFile[]` and `onOpenFile(path, line)`. It calls `usePrBrief(prId)` and `useGenerateBrief(prId)`, maps them to `PrBriefBlock` props (`ApiError.code === "brief_no_files"` → `"noFiles"`, any other error → `"failed"`; `client/src/lib/api.ts:8-19`), and calls `mutate(headSha)` with the `headSha` prop it already has.
- `PrBriefBlock` renders above the existing blast section, which is unchanged (`OverviewTab.tsx:31-40`).
- `page.tsx`: `openInDiff(path, line)` stores the target in page state and switches to the Files changed tab with the existing `setParam("tab", "diff")` (`page.tsx:64-69`). `setTab` clears the target, so opening Files changed by hand shows no stale highlight. `DiffTab` receives `target` from page state. Nothing about the target is written to the address.
Test:
- `OverviewTab.test.tsx` (mock `@/lib/hooks/brief` beside the existing blast mock, `OverviewTab.test.tsx:8-9`; add `brief.json` to the provider messages):
  - the brief block and the blast block are both rendered (AC-4);
  - `usePrBrief` is called with the PR id, and the mutation is not called on mount (AC-18);
  - clicking Generate calls `mutate("abc")` (the `headSha` prop), and when the query mock then returns a brief its summary is shown (AC-2);
  - a pending mutation → skeleton, control disabled (AC-26);
  - a pending query → placeholder (AC-27);
  - a mutation error with code `brief_no_files` → `error.noFiles`; any other → `error.generate`, with the stored brief still shown (AC-28);
  - clicking a focus item calls `onOpenFile(path, line)`.
manual: on a running stack, click a focus item for a file in a collapsed `docs` group — Files changed opens, the group and file open, and the line is centred and flashes. Click a risk's file — the file opens at its top.
Verify: `pnpm typecheck && pnpm test` in `client/`
Skills: frontend-architecture, next-best-practices, react-best-practices, react-testing-library
Depends on: T-7, T-8, T-9

## Traceability

| AC | task(s) | test (file › case) |
|---|---|---|
| AC-1 | T-8, T-10 | `PrBriefBlock.test.tsx` › no brief → generate control; `OverviewTab.test.tsx` › brief block rendered |
| AC-2 | T-6, T-7, T-10 | `brief.it.test.ts` › POST returns the stored brief; `brief.test.ts` › mutation fills the cache; `OverviewTab.test.tsx` › click Generate → summary shown |
| AC-3 | T-8 | `PrBriefBlock.test.tsx` › summary + lists, empty-state texts |
| AC-4 | T-10 | `OverviewTab.test.tsx` › brief block and blast block together |
| AC-5 | T-8 | `PrBriefBlock.test.tsx` › no-intent and no-specs statements |
| AC-6 | T-3, T-8 | `helpers.test.ts` › stable severity sort; `PrBriefBlock.test.tsx` › title, severity, path in order |
| AC-7 | T-3, T-8 | `helpers.test.ts` › focus keeps model order; `PrBriefBlock.test.tsx` › `file:line` + reason in order |
| AC-8 | T-3 | `helpers.test.ts` › 9/7 grounded → 7/5 after grounding |
| AC-9 | T-5, T-6, T-8 | `service.test.ts` › no files → 409, zero model calls; `brief.it.test.ts` › closed and merged PRs generate; `PrBriefBlock.test.tsx` › `error.noFiles` |
| AC-10 | T-3 | `helpers.test.ts` › refs outside the set removed, empty risk dropped |
| AC-11 | T-3 | `helpers.test.ts` › focus dropped on unknown file / unknown line |
| AC-12 | T-3, T-5 | `helpers.test.ts` › path normalization, blast null; `service.test.ts` › grounding on full facts after reduction, blast throwing |
| AC-13 | T-5 | `service.test.ts` › the request carries `maxRetries: 0`; `service.test.ts` › invalid reply → error, provider called once |
| AC-14 | T-4 | `helpers.test.ts` › ≤ 8000 at every stage, cut order, no patch text, never throws |
| AC-15 | T-2, T-4 | `helpers.test.ts` › facts present, names absent, untrusted wrapping, system text ends with the exported `INJECTION_GUARD` |
| AC-16 | T-1, T-5 | `contracts.test.ts` › draft/brief parse + both copies identical; `service.test.ts` › invalid reply stores nothing |
| AC-17 | T-5, T-6 | `service.test.ts` › `resolveFeatureModel('risk_brief')` result used; `brief.it.test.ts` › default, then changed setting on the next generation |
| AC-18 | T-6, T-7, T-10 | `brief.it.test.ts` › GET makes no model call; `brief.test.ts` › mount issues GET only; `OverviewTab.test.tsx` › mutation not called on mount |
| AC-19 | T-5, T-6 | `service.test.ts` › stored SHA = request SHA; `brief.it.test.ts` › one row after two generations |
| AC-20 | T-8 | `PrBriefBlock.test.tsx` › stale marker when SHAs differ, brief still shown |
| AC-21 | T-6, T-8, T-10 | `brief.it.test.ts` › second POST replaces with one more call; `PrBriefBlock.test.tsx` › refresh calls `onGenerate` stale or not, marker gone when SHAs match |
| AC-22 | T-9, T-10 | `FileCard.test.tsx` › open + highlight + scroll; `DiffTab.test.tsx` › collapsed group opens; manual: line centred and flashing in the browser |
| AC-23 | T-9, T-10 | `FileCard.test.tsx` › null line / unshown line → card top; `PrBriefBlock.test.tsx` › risk ref calls `onOpenFile(path, null)`; manual: risk file opens at its top |
| AC-24 | T-8 | `PrBriefBlock.test.tsx` › not-in-diff note, no `onOpenFile` |
| AC-25 | T-8 | `PrBriefBlock.test.tsx` › row click toggles explanation, file-ref click does not |
| AC-26 | T-8, T-10 | `PrBriefBlock.test.tsx` › skeleton + disabled control; `OverviewTab.test.tsx` › pending mutation |
| AC-27 | T-8, T-10 | `PrBriefBlock.test.tsx` › loading placeholder, load-error copy, no generate button; `OverviewTab.test.tsx` › pending query |
| AC-28 | T-8, T-10 | `PrBriefBlock.test.tsx` › error + try again + previous brief kept; `OverviewTab.test.tsx` › error-code mapping |
| AC-29 | T-8 | `PrBriefBlock.test.tsx` › every label equals its `brief.json` value; manual: `grep` the component folder for string literals in JSX |
| AC-30 | T-6 | `brief.it.test.ts` › other-workspace PR → 404 on GET and POST |

## Skills for the implementer

| skill | task(s) | why |
|---|---|---|
| onion-architecture | T-3, T-4, T-5, T-6 | route → service → repository; adapters only via the container; cross-module reads |
| fastify-best-practices | T-6 | zod route schemas, response schema, error envelope |
| drizzle-orm-patterns | T-5 | `onConflictDoUpdate` upsert and the workspace-scoping join; no schema change |
| zod | T-1, T-5, T-6 | contract shapes, strict-schema-safe draft, inferred types |
| typescript-expert | T-1, T-2, T-3, T-4 | contract typing, the reviewer-core export, pure helper typing |
| security | T-3, T-4, T-5, T-8 | prompt-injection wrapping, grounding as the trust gate, no raw/keys in errors or logs, plain-text rendering |
| frontend-architecture | T-7, T-8, T-9, T-10 | `_components/<Name>/` layout, fixed internals, hooks-only data access, i18n namespace, showcase |
| react-best-practices | T-7, T-8, T-9, T-10 | derived state over effects, scroll/highlight effect, mutation state |
| next-best-practices | T-10 | `useSearchParams` + `router.replace` in a client page |
| react-testing-library | T-7, T-8, T-9, T-10 | hook and component tests, fake timers, role/copy queries |
| engineering-insights | any | record a non-obvious finding met during the work |

## Risks

| risk | where (file:line) | mitigation |
|---|---|---|
| The contract exists in two copies; drift breaks AC-16 | `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` | T-1 edits both and adds a byte-identity test |
| A runtime import from `@devdigest/shared` breaks the client webpack build | `client/src/lib/feature-models.ts:6-11` | client code uses `import type` only; the client never parses with the schema |
| A 429/5xx or a dropped connection re-sends the request, so more than one provider request is possible | `server/src/platform/resilience.ts:35-50`; `openai.ts:52,97`; `anthropic.ts:46,100`; `reviewer-core/src/llm/openrouter.ts:54-55` | accepted, known limitation: network retries stay as for reviews; only the re-ask on an invalid reply is turned off (`maxRetries: 0`) |
| The default re-ask (2) fires if `maxRetries` is forgotten | `openai.ts:90`, `anthropic.ts:92`, `openrouter.ts:61` | `service.test.ts` asserts the request carries `maxRetries: 0` and that an invalid reply leaves the provider called once |
| `withTimeout` only races; it does not abort the request | `server/src/platform/resilience.ts:13-24` | also pass `timeoutMs` so the SDK aborts; a late reply is discarded and nothing is stored |
| The OpenRouter provider ignores `req.timeoutMs` today (its SDK timeout is 90 s) | `reviewer-core/src/llm/openrouter.ts:54,69-84` | accepted: the service's 60 s `withTimeout` fails the generation; the late reply is discarded and nothing is stored |
| Adapter errors carry the raw model reply, and the error handler returns `details` | `openai.ts:132-134`; `anthropic.ts:147-149`; `server/src/app.ts:153-157` | the service rethrows a fixed `ExternalServiceError` with `{ reason }` only |
| Strict `json_schema` may reject numeric or length keywords | `openai.ts:103-106` | `PrBriefDraft` has no refinements; caps and positivity are enforced in grounding |
| The token budget counts messages, not the provider's schema/tool envelope | `server/src/adapters/tokenizer/index.ts:28-42` | accepted: the spec's unit is the server tokenizer over instructions + facts |
| `parseUnifiedDiff` drops hunks of a bare patch | `server/src/adapters/git/diff-parser.ts:33-44,62` | own header-only `hunkRanges`, unit tested |
| `BlastService.forPull` refreshes from GitHub when a PR has no files | `server/src/modules/blast/service.ts:27-38` | the brief checks "no recorded files" first and refuses |
| Importing another module's service vs onion rule 10 | `.claude/skills/onion-architecture/SKILL.md` rule 10; precedent `server/src/modules/conventions/service.ts:86` | accepted: same blast the page shows, zero duplication; recorded here |
| A missing key turning a domain refusal into a key error | server INSIGHTS, Codebase Patterns 2026-09-22 | resolve model and provider after files/blast/input |
| `INJECTION_GUARD` wording is review-specific ("report it as a finding") | `reviewer-core/src/prompt.ts:16-28` | reused verbatim as required; its first paragraph is the data-not-instructions rule; text not edited |
| A `reviewer-core/**` change triggers `server-unit` CI and needs its own checks | root `CLAUDE.md` Cross-package gotchas | T-2 (an export only) runs `npm run typecheck && npm test` in `reviewer-core/` |
| `data-line-key` has no file; a document-wide query hits the wrong file | `client/src/components/diff-viewer/CodeLine/CodeLine.tsx:63` | query inside the card's root ref only |
| jsdom has no `scrollIntoView` | `client/` vitest + jsdom | tests stub `Element.prototype.scrollIntoView` |
| Cards remount when smart-diff data arrives, which repeats the scroll | `DiffTab.tsx:93-94,140-162` | accepted: the result is still the target line; the effect runs on mount only |
| Correcting state in an effect renders one wrong frame | client INSIGHTS, What Doesn't Work 2026-09-20 | open/stale/not-in-diff are derived in render; the only effect is scroll + highlight timer |
| Two buttons with one accessible name break RTL queries | client INSIGHTS, Recurring Errors 2026-09-22 | distinct labels for generate / refresh / try again |
| `role="alert"` assertions pass for the wrong reason | client INSIGHTS, Codebase Patterns 2026-09-22 | assert on copy |
| New message keys look missing in a running dev server | client INSIGHTS, Recurring Errors 2026-09-20 (`src/i18n/request.ts:20`) | hard reload / restart `next dev` during the manual check |
| The showcase smoke test fails on a component that needs a QueryClient | client INSIGHTS, Recurring Errors 2026-09-22 | `PrBriefBlock` is presentational; the gallery group needs only the intl provider |
| Migrations and lock files | root `CLAUDE.md` Do not touch | no schema change, no dependency change; `server/src/db/migrations/**` untouched |
| A stored row of an unexpected shape | `server/src/db/schema/reviews.ts:57-62` | `get` uses `safeParse`; an invalid row is served as `{brief: null}` with a warn log |
| More than 100 changed files | `server/src/adapters/github/octokit.ts:79-84` | known limitation (EC-10); no work |

## Out of scope

- Linked issue as a fact, in any form.
- A Files changed target in the page address (deep link); the target lives in page state only.
- A per-request switch for network-level retries in the LLM providers.
- Back returning to Overview; tab changes keep `router.replace` (`page.tsx:68`).
- A generation that survives a page reload; after reload the block shows the stored state.
- `VerdictBanner` / PR score inside the brief.
- workflow-retro and cost report.
- Extra stored metadata (`generated_at`, model name, token counts): no AC needs it.
- A blast snapshot in the brief; the Blast radius block stays live and unchanged.
- An e2e flow, MCP exposure, posting to GitHub, showing the model call in the studio.
- Doc updates (`server/README.md` API map, `client/specs/pages.md`): no AC; worth a follow-up.
- Refactoring `pulls/routes.ts` to a service, or fixing `parseUnifiedDiff` for bare patches.

## Cross-model review

Reviewed by `openai/gpt-5.6-terra` on 2026-10-11; findings and decisions in `docs/hw5/cross-model-review.md`. Accepted and applied here: F-1 (T-5), F-2 (Input reduction, T-4), F-4 (T-4), F-7 (T-8). Not accepted: F-3 (owner decision recorded under "Decision: PrBrief contract"), F-5, F-6.

Changed after the review, by owner decision: T-2 was reduced to the `INJECTION_GUARD` export and the providers are left untouched (see "Model call"); the file/line target is no longer written to the page address (AC-22).

## Deviations

- **Local delimiter escape.** `wrap()` in `server/src/modules/brief/helpers.ts` neutralises a forged opening `<untrusted` tag before calling `wrapUntrusted`, which escapes only the closing tag (`reviewer-core/src/prompt.ts:30-34`). It is kept local on purpose: changing `wrapUntrusted` would alter every review prompt, which is outside this feature. Next step: move the escape into `wrapUntrusted` in a separate PR with reviewer-core tests, then reduce `wrap()` to a plain call.
- **AC-13 stays PARTIAL by decision.** Re-sending a request on 429/5xx or a dropped connection is not turned off, because the brief should survive a transient provider failure the same way a review does; only the re-ask on an invalid reply is disabled (`maxRetries: 0`).
- **`classifyFile` moved.** The classifier, its test and its rules now live in `server/src/modules/_shared/` (`classify-file.ts`, `smart-diff-rules.ts`), so `brief` no longer imports from the internals of `reviews` (architecture review, round 2).
