# INSIGHTS — server/

Non-obvious knowledge from past sessions — read before a non-trivial change here.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review server`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

- **2026-09-20** · Adding a per-run stat means touching FIVE write paths in `run-executor.ts`, not one.
  - Why: a run ends three ways (success, per-agent failure, pre-work `failAll`) and each writes a `RunTrace` alongside; miss one and the field is null on exactly the runs you debug with.
  - Evidence: `completeAgentRun` at `src/modules/reviews/run-executor.ts:76,247,302` · trace `stats` at `:267` and `traceFromBuffer` `:425`
- **2026-09-20** · ALWAYS `leftJoin` when joining `agent_runs` onto `reviews` via `reviews.run_id`.
  - Why: the column carries no FK and `deleteAgentRun` leaves the review behind, so an inner join silently drops reviews whose run was deleted.
  - Evidence: `src/db/schema/reviews.ts:9-26` (no `.references()`) · `src/modules/reviews/repository/review.repo.ts:66` · `run.repo.ts:77`

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->

- **2026-09-20** · `@fastify/multipart` 10.1 CAN be validated by a route-level zod `body` schema — register it with `attachFieldsToBody: 'keyValues'` plus a custom `onFile`.
  - Why: the plugin attaches the parts in a `preValidation` hook, so `req.body` is populated BEFORE the zod validator compiler runs. `onFile` setting `part.value = { filename, mimetype, bytes }` puts the buffered upload on `req.body.file`, where a `z.custom<UploadedFile>()` field validates it. Without this the only way to reach an upload is `req.file()` inside the handler, which forces the `Schema.parse(req.body)` the project bans.
  - Evidence: `src/modules/skills/routes.ts:89` (register) · `:58` `UploadPart` · `:67` `ImportBody` · hook at `node_modules/@fastify/multipart/index.js:72`
- **2026-09-20** · Pair that with `throwFileSizeLimit: false` + `part.file.truncated` to answer an oversized upload with your OWN 413 message.
  - Why: the default (`true`) makes `toBuffer()` throw `FST_REQ_FILE_TOO_LARGE` from inside the hook, so the client gets the plugin's message instead of the route's.
  - Evidence: `src/modules/skills/routes.ts:99` · `src/modules/skills/helpers.ts:322`
- **2026-09-20** · `fflate` 0.8 `unzipSync`'s `filter` enumerates a zip's central directory WITHOUT inflating anything — collect `{ name, originalSize }` and return `false`.
  - Why: it is the only way to enforce entry-count and zip-bomb guards BEFORE decompression; a second `unzipSync(bytes, { filter: f => f.name === chosen })` then inflates the one chosen entry. `originalSize` comes from the central directory (which a hostile archive can lie about), so re-check the decoded length too.
  - Evidence: `src/modules/skills/helpers.ts:240` (enumerate) · `:291` (inflate one) · `:296` (re-check)

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

### 2026-09-20 — Run Cost Badge: persist + serve per-run cost
- Done: `agent_runs.cost_usd` restored (migration `0010`), cost served on `/pulls/:id/runs`, `/runs/:id/trace`, `/pulls/:id/reviews` and `/repos/:id/pulls`; 104 unit + 30 integration tests green.
- Added: Codebase Patterns.

### 2026-09-20 — Skills Lab §1–§4: the `/skills` module
- Done: `src/modules/skills/` (routes · service · repository · helpers · constants) — 10 routes, workspace-scoped (cross-workspace = 404), versioning in the service with two atomic repository primitives, `.md`/`.zip` import with per-guard statuses; 36 unit tests.
- Added: Tool & Library Notes.
- Open: `test/prompt-structured.test.ts` and `test/prompt-callers.test.ts` still pass `skills: string[]` and fail against reviewer-core's new `PromptParts.skills: SkillPart[]` — owned by the §5 run-executor workstream, not touched here.

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
