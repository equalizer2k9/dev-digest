# INSIGHTS — server/

Non-obvious knowledge from past sessions — read before a non-trivial change here.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review server`.

## What Works
<!-- Approaches that worked where the obvious one failed -->

- **2026-09-22** · To keep a module's TESTS free of provider ids too, construct `new MockLLMProvider(undefined, opts)` and type the provider param as `Parameters<Container['llm']>[0]`.
  - Why: taking the mock's default id and feeding the stubbed `resolveFeatureModel` `{ provider: llm.id, model: '<opaque stub>' }` means the `'openai' | 'anthropic' | 'openrouter'` union is never spelled out anywhere in the folder.
  - Evidence: `src/modules/conventions/service.test.ts` · `src/modules/conventions/conventions.it.test.ts:40` takes the provider from `FEATURE_MODELS` instead · `grep -rniE "gpt-|claude-|openai|anthropic|openrouter" src/modules/conventions/` is empty

## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->

- **2026-09-22** · NEVER treat a resolved `container.git.readFile()` as proof the path exists — probe with content, not with the absence of a throw.
  - Why: `MockGitClient.readFile` answers a MISSING path with `''`, and `capLines('')` returns `['']` (length 1, not 0), so a read-to-probe sample selector turned every candidate config FILENAME into an empty sample under test.
  - Evidence: `src/adapters/mocks.ts:299` (`?? ''`) · fix treats a file with no non-blank line as absent, `src/modules/conventions/helpers.ts:208`

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->

- **2026-09-20** · Adding a per-run stat means touching FIVE write paths in `run-executor.ts`, not one.
  - Why: a run ends three ways (success, per-agent failure, pre-work `failAll`) and each writes a `RunTrace` alongside; miss one and the field is null on exactly the runs you debug with.
  - Evidence: `completeAgentRun` at `src/modules/reviews/run-executor.ts:76,247,302` · trace `stats` at `:267` and `traceFromBuffer` `:425`
- **2026-09-20** · ALWAYS `leftJoin` when joining `agent_runs` onto `reviews` via `reviews.run_id`.
  - Why: the column carries no FK and `deleteAgentRun` leaves the review behind, so an inner join silently drops reviews whose run was deleted.
  - Evidence: `src/db/schema/reviews.ts:9-26` (no `.references()`) · `src/modules/reviews/repository/review.repo.ts:66` · `run.repo.ts:77`
  - Seen again 2026-09-22: `conventions.scan_id` is nullable with `on delete set null`, so the `head_sha` join is a `leftJoin` too — centralised in one private `joined()` helper at `src/modules/conventions/repository.ts:213`.

- **2026-09-22** · Resolve the LLM provider only AFTER a feature's code-only work, never at the top of the method.
  - Why: `container.llm()` is async and does a secrets lookup, so resolving it first makes a domain 4xx depend on a configured key — the `repo_not_indexed` 409 must fire on an unsampleable repo whether or not the workspace has a key.
  - Evidence: `src/modules/conventions/service.ts:121` (samples) before `:127` (`resolveFeatureModel`) · guarded by a unit test asserting `llm.calls` is empty on that path

- **2026-09-22** · The "same name + `source = 'extracted'` → update instead of insert" rule is WORKSPACE-scoped, not repo-scoped.
  - Why: two repos scanned in one workspace therefore share a single `repo-conventions` skill and the second scan overwrites the first one's body at `version + 1`, keeping the agent links; the user must rename to keep them apart.
  - Evidence: `src/modules/skills/repository.ts:92` `findByNameAndSource` · `src/modules/conventions/service.ts:224` · asserted in `src/modules/conventions/conventions.it.test.ts` ("re-creating the same extracted skill bumps its version")

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
- **2026-09-22** · drizzle-kit 0.30.1 `generate` runs unattended on an ADDITIONS-only diff — a new table plus new columns emits zero `DROP` and asks nothing.
  - Why: the unanswerable "renamed or created?" prompt only appears when one diff both drops and adds; shaping a schema change as add-only is what makes it safe for an agent run. Verify with `grep -in "drop\|rename"` on the generated file before `db:migrate`.
  - Evidence: `src/db/migrations/0011_abandoned_jack_power.sql` (13 statements, all `CREATE TABLE` / `ADD COLUMN` / `ADD CONSTRAINT` / `CREATE INDEX`) · `src/db/schema/knowledge.ts`

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

### 2026-09-22 — Conventions Extractor: the `/conventions` module
- Done: `src/modules/conventions/` (5 routes) — code-only sample selection, ONE structured model call on the Settings-resolved model, code-side evidence verification with the snippet re-read from the file, rescan merge on the normalized rule with rejected tombstones, accepted rows → an editable draft → an `extracted` skill optionally linked to an agent; 39 unit + 9 integration tests, whole suite 237 green.
- Added: What Works, What Doesn't Work, Codebase Patterns, Tool & Library Notes.
- Open: on the §6 update path `evidence_files` keeps its previous value, because the spec scopes the new field to `CreateSkillInput` only.

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->

- **2026-09-22** · Should a re-run of `POST /repos/:id/conventions/skill` refresh `skills.evidence_files`?
  - Known: the insert path writes the distinct accepted paths (`src/modules/conventions/service.ts:241`), the update path does not, because widening `UpdateSkillInput` is what the spec's "nothing else in the skills module changes" forbids.
  - Matters because: after a rescan with different accepted rules, the skill cites paths its body no longer mentions.
