# Conventions Extractor — server

**Status:** draft · **Package:** server · **Date:** 2026-09-20

Sibling: [`client/specs/conventions-extractor.md`](../../client/specs/conventions-extractor.md) ·
builds on [`skills-lab.md`](skills-lab.md)

## Problem

A reviewer agent only knows the rules somebody typed into a skill. The house rules a repo
actually follows — naming, error handling, layering — live in its code, and today nothing reads
them out. The scaffolding is half there and unused: a `conventions` table
([`db/schema/knowledge.ts`](../src/db/schema/knowledge.ts)), a `ConventionCandidate` contract, a
`conventions` entry in `FEATURE_MODELS`, and `repoIntel.getConventionSamples()` — but no module,
no route, and no way to turn a finding into a skill.

The table also cannot hold what the feature needs: `accepted boolean` has no third state, so a
rejected candidate is indistinguishable from an undecided one and comes back on the next read;
there is no category, no evidence line, and no commit to pin an evidence link to.

## Goals / non-goals

**Goals**

- `POST /repos/:id/conventions/extract` runs a real analysis and persists its result.
- Sample selection is plain code — configs + top-ranked files — with no model call.
- One cheap model call returns candidates `{category, rule, evidence: file + line, confidence}`.
- Every candidate's evidence is verified against the clone in code; unverifiable ones are dropped.
- Accept / reject / edit persist; a rejected candidate never resurfaces and never reaches a skill.
- Accepted candidates merge into one skill, default name `repo-conventions`, source `extracted`,
  optionally linked to an agent in the same call.
- The model is whatever Settings → Models says for `conventions`; nothing hardcoded in the module.

**Non-goals**

- Several skills per scan, import-from-URL, plugin packaging, raising recall by feeding repo-intel
  new data (the homework's optional extras).
- Background jobs / SSE for the scan. The call is synchronous; one model round-trip.
- Any change to `agent_skills` or to the skills module's wire contract beyond what §6 names.

## Behaviour

### 1. Module

New feature plugin `src/modules/conventions/` (`routes.ts` · `service.ts` · `repository.ts` ·
`helpers.ts` · `constants.ts`), registered with one import + one entry in
[`src/modules/index.ts`](../src/modules/index.ts). Every route resolves `workspaceId` through
`getContext`; a repo or convention from another workspace is a 404. Bodies and params are
validated by route-level Zod schemas.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/repos/:id/conventions/extract` | — | `ConventionScan` |
| GET | `/repos/:id/conventions` | — | `ConventionScan` (`extracted_at: null` when never scanned) |
| PUT | `/conventions/:id` | `{status?, rule?, category?}` | `ConventionCandidate` |
| GET | `/repos/:id/conventions/draft` | — | `ConventionSkillDraft` |
| POST | `/repos/:id/conventions/skill` | `{name, description?, type?, enabled?, body, agent_id?}` | `Skill` (201) |

### 2. Sample selection — code only

`selectSamples(repo)` in `helpers.ts`, pure apart from reading the clone. It **must not** touch
`container.llm`; a unit test asserts that.

1. Config files, first match of each family, read with `container.git.readFile(repoRef, path)`,
   missing files skipped silently: `eslint.config.{js,mjs,cjs,ts}` / `.eslintrc*`,
   `tsconfig.json`, `.prettierrc*` / `prettier.config.*`. Probe the repo root and each
   first-level directory that has a `package.json` (this repo has no root tsconfig).
2. `container.repoIntel.getConventionSamples(repoId, 12)` → up to 12 paths, already minus
   tests/configs/migrations. It returns **paths, not contents**, and `[]` when repo-intel is
   disabled or the repo is not indexed.
3. Each file is read, capped at `MAX_SAMPLE_LINES = 200` lines / `MAX_SAMPLE_BYTES = 8_000`, and
   rendered with 1-based line-number prefixes so the model can cite lines it can see.
4. No configs **and** no ranked files → `409 { error: "repo_not_indexed" }` telling the user to
   index the repo first. Configs only → proceed; `ConventionScan.warnings` says ranked samples
   were unavailable.

### 3. The model call

- Provider + model from `resolveFeatureModel(container, workspaceId, 'conventions')`
  ([`settings/feature-models.ts`](../src/modules/settings/feature-models.ts)). No model id or
  provider literal appears anywhere in `modules/conventions/`.
- `container.llm(provider).completeStructured(...)` with the Zod schema below; one call per scan.
- System prompt in `src/prompts/conventions.system.md`, loaded like `onboarding.system.md`. It
  asks for rules the samples **demonstrably follow in more than one place**, each with one
  evidence location taken from the numbered lines, and forbids generic advice not visible in the
  samples.
- Sample contents go in the user message wrapped with `wrapUntrusted('sample:<path>', …)` from
  `@devdigest/reviewer-core`: repo code is data, never instructions.

```ts
// what the model returns — criterion 40
const LlmConventionCandidate = z.object({
  category: ConventionCategory,
  rule: z.string().min(8).max(240),
  evidence: z.object({
    file: z.string(),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
  }),
  confidence: z.number().min(0).max(1),
});
const LlmConventionResult = z.object({ candidates: z.array(LlmConventionCandidate).max(30) });
```

### 4. Evidence verification — code, not the model

`verifyEvidence(candidate, samples)` in `helpers.ts`. A candidate survives only if:

- `evidence.file` is one of the sample paths sent in this scan (a path the model invented fails
  here, without touching the filesystem);
- `1 ≤ start_line ≤ end_line ≤ lineCount(file)` and `end_line - start_line < 40`;
- the cited range contains at least one non-blank, non-comment line.

Survivors get `evidence_snippet` **re-read from the file** for that range — the stored snippet is
real code, never model output. Everything else is dropped; `ConventionScan.dropped` carries the
count and a `runLog`-style reason list goes to the server log.

### 5. Persistence and rescan

Every `extract` inserts one `convention_scans` row — `head_sha =
container.git.currentHead(repoRef)`, the resolved `model`, `sample_files`, `dropped`, `warnings` —
and the candidates it writes point at it through `scan_id`. The head sha is what lets an evidence
link pin the exact commit the lines were read from; the latest scan row is what
`GET /repos/:id/conventions` reports as `extracted_at` / `model`.

A rescan (`extract` on a repo that already has rows) is a merge, keyed on
`normalizeRule(rule)` (lowercased, punctuation and whitespace collapsed):

- `rejected` rows are kept as tombstones; a new candidate matching one is discarded.
- `accepted` rows are kept untouched; a matching new candidate is discarded.
- `pending` rows are deleted and replaced by the new scan's survivors.

`GET /repos/:id/conventions` returns `pending` + `accepted`, confidence descending; `rejected` is
never returned. `PUT /conventions/:id` sets `status` (`pending | accepted | rejected`) and/or edits
`rule` / `category`; an edited rule keeps its evidence.

### 6. Accepted → skill

- `GET …/draft` builds the draft **on the server, from `status = 'accepted'` rows only** —
  `name: "repo-conventions"`, `type: "convention"`, `enabled: true`,
  `description: "<n> house conventions extracted from <repo.name>"`, and a body in the design's
  shape: an H1, one framing sentence ("Flag changes that violate any rule below and cite the
  offending `file:line`."), then per rule `## <slug>` · the rule · `` Detected in `path:Lx-Ly` ``
  · the fenced snippet. No accepted rows → `409`.
- `POST …/skill` takes the (possibly edited) fields back and calls
  `SkillsService.create(workspaceId, input, 'extracted')` with
  `evidence_files` = distinct accepted paths. `CreateSkillInput` and
  `SkillsRepository.insertWithVersion` gain an optional `evidenceFiles`; nothing else in the
  skills module changes.
- A skill with the same `name` and `source = 'extracted'` already in the workspace is **updated**
  instead (`SkillsService.update` → body change → `version + 1`), so re-running the flow keeps the
  agent links instead of forking `repo-conventions-2`.
- `agent_id` present → the skill is appended to that agent's links via the agents repository
  (`linkSkill`, order = current max + 1) in the same request. Unknown agent → 404, nothing
  created. Absent → the user links it from the agent's Skills tab.
- `extracted` is a trusted source in `run-executor.resolveSkills`, so the body reaches the prompt
  verbatim and shows up as its own block in the run trace, like any other linked skill.

## Contracts & data

**`@devdigest/shared` `knowledge.ts` — BOTH copies** (`server/src/vendor/shared`,
`client/src/vendor/shared`; the client may import these as **types only**):

```ts
export const ConventionCategory = z.enum([
  'naming', 'structure', 'error-handling', 'typing', 'testing', 'imports', 'api', 'style', 'other',
]);
export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);

export const ConventionCandidate = z.object({
  id: z.string(),
  category: ConventionCategory,                    // new
  rule: z.string(),
  evidence_path: z.string(),
  evidence_start_line: z.number().int(),           // new
  evidence_end_line: z.number().int(),             // new
  evidence_snippet: z.string(),
  head_sha: z.string().nullable(),                 // new — pins the GitHub link
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,                        // new — source of truth
  accepted: z.boolean(),                           // kept: status === 'accepted'
});

export const ConventionScan = z.object({
  repo_id: z.string(),
  candidates: z.array(ConventionCandidate),
  extracted_at: z.string().nullable(),
  sample_files: z.number().int(),
  dropped: z.number().int(),
  model: z.string().nullable(),
  warnings: z.array(z.string()),
});

export const ConventionSkillDraft = z.object({
  name: z.string(), description: z.string(), type: SkillType,
  enabled: z.boolean(), body: z.string(), count: z.number().int(),
});
```

**DB** — [`db/schema/knowledge.ts`](../src/db/schema/knowledge.ts), **additions only**:

- new table `convention_scans`: `id`, `workspace_id` (FK, cascade), `repo_id` (FK, cascade),
  `head_sha text`, `model text`, `sample_files integer`, `dropped integer`,
  `warnings jsonb`, `created_at`; index on `(repo_id, created_at)`.
- `conventions` gains `scan_id uuid` (FK → `convention_scans`, `set null`),
  `category text not null default 'other'`, `evidence_start_line integer`,
  `evidence_end_line integer`, `status text not null default 'pending'`, `rule_key text` (the
  normalized rule), `created_at`, plus an index on `(repo_id, status)`. `accepted` stays and is
  written in lockstep with `status`; `head_sha` on the wire comes from the joined scan row.

Add-only is deliberate: a diff that both drops and adds (a column or a table) makes
`drizzle-kit generate` stop on an interactive "renamed or created?" prompt, which an agent run
cannot answer. Then `pnpm db:generate` → commit the generated migration **unedited** →
`pnpm db:migrate`. Never hand-edit anything under `migrations/`.

## Acceptance criteria

Numbered by [`docs/hw2-criteria.md`](../../docs/hw2-criteria.md).

- [ ] **AC-38** `POST /repos/:id/conventions/extract` runs the analysis and the result survives a
      server restart: `GET /repos/:id/conventions` after a restart returns the same candidates.
- [ ] **AC-39** Sample selection reads config files (eslint / tsconfig / prettier) plus up to 12
      paths from `repoIntel.getConventionSamples()` and makes no LLM call — a test with a
      throwing `llm` stub still gets its samples.
- [ ] **AC-40** The model is asked for, and its output is parsed as,
      `{category, rule, evidence: {file, start_line, end_line}, confidence}`; a malformed reply is
      a handled error, not a 500 with a stack.
- [ ] **AC-40b** *(homework text, "кодова перевірка доказів")* a candidate citing a file outside
      the samples, or a line range past the end of the file, is dropped and counted in `dropped`;
      every persisted `evidence_snippet` equals the file's real lines for that range.
- [ ] **AC-41** `GET …/draft` returns an editable draft (name, description, type, enabled, body)
      and `POST …/skill` persists the edited values as sent, not the draft's originals.
- [ ] **AC-42** The draft is built from `accepted` rows only; the created skill is named
      `repo-conventions` by default, has `source = 'extracted'`, and with `agent_id` is present in
      `GET /agents/:id/skills` immediately after the call.
- [ ] **AC-48** `PUT /conventions/:id {status:"rejected"}` persists: the row is absent from
      `GET /repos/:id/conventions` after a restart, absent from the draft, and a rescan that
      finds the same rule again does not bring it back.
- [ ] **AC-52** The created skill is returned by `GET /skills` with `agent_count` reflecting the
      optional link.
- [ ] **AC-53** `modules/conventions/` contains no provider or model literal; changing the
      `conventions` row in Settings → Models changes the `model` reported by the next
      `ConventionScan`.

| Criterion | server | client |
|---|---|---|
| 38, 39, 40 | ✓ | — |
| 41, 42, 48, 52, 53 | ✓ | ✓ |
| 44, 45, 46, 47, 49, 50, 51 | — | ✓ |
| 43 | content, not code — four skills authored through the Skills page | |

## Tests

- `helpers.test.ts` — `selectSamples` with a throwing `llm` stub; config probing in root and
  first-level package dirs; line/byte caps; `verifyEvidence` (unknown file, range past EOF,
  blank-only range, snippet re-read); `normalizeRule`; draft builder ignores `pending` and
  `rejected`.
- `service.test.ts` — mocked repository + the `llm` mock from
  [`adapters/mocks.ts`](../src/adapters/mocks.ts): rescan merge rules (rejected tombstone wins,
  accepted kept, pending replaced); model comes from `resolveFeatureModel`; malformed model output
  → typed error.
- `conventions.it.test.ts` — integration, real Postgres: extract → restart-equivalent re-read,
  reject persists, draft → skill with `source = 'extracted'` and `evidence_files`, `agent_id`
  link visible through `/agents/:id/skills`, same-name re-create bumps the version instead of
  inserting.

## Open questions

- `convention_scans` keeps every scan. Nothing reads the history yet; prune to the last N per
  repo only if the table ever shows up in a size report.
- `getConventionSamples` excludes tests, so testing conventions are under-sampled. Left as is;
  raising recall is the homework's optional extra.
