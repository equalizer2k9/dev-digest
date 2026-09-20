# Skills Lab — server

**Status:** draft · **Package:** server · **Date:** 2026-09-20

Siblings: [`client/specs/skills-lab.md`](../../client/specs/skills-lab.md) ·
[`reviewer-core/specs/skills-lab.md`](../../reviewer-core/specs/skills-lab.md)

## Problem

The `skills`, `skill_versions` and `agent_skills` tables, the `Skill` / `SkillType` /
`SkillSource` contracts and `GET|POST /agents/:id/skills` all exist, but nothing in the API
reads or writes a skill: there is no `/skills` module, `skill_versions` is never written, and
[`run-executor.ts`](../src/modules/reviews/run-executor.ts) never passes `skills` into
`reviewPullRequest`, so `prompt_assembly.skills` is `null` on every run. A skill today is an
inert row — attaching one to an agent changes nothing about the review it produces.

This spec covers the server half of Skills Lab: skill CRUD + versioning + import, and the path
that turns an agent's ordered, enabled skills into a measured block of the assembled prompt.

## Goals / non-goals

**Goals**

- `/skills` CRUD backed by Postgres, workspace-scoped like every other module.
- Every body change snapshots into `skill_versions`; restore never rewrites history.
- Import a skill from an uploaded `.md` or `.zip`, with a preview step that persists nothing.
- Resolve an agent's linked skills, in `agent_skills.order`, into the run's prompt.
- Attribute tokens to the skills block alone, per skill, and persist that in the run trace.

**Non-goals**

- Conventions extraction, `repo-conventions`, the Eval dashboard, skill stats, community
  search and "import from URL" (criteria 38–53 and the design's `Evals` / `Stats` tabs).
- Any change to `agent_skills`' shape. "Enabled for this agent" ⇔ a link row exists; there is
  no per-link `enabled` column and no migration adding one.
- Scoring, ranking or auto-selecting skills per diff. Every enabled linked skill is sent.

## Behaviour

### 1. Skills module

New feature plugin `src/modules/skills/` (`routes.ts` · `service.ts` · `repository.ts`),
registered with one import + one entry in [`src/modules/index.ts`](../src/modules/index.ts).
Every route resolves `workspaceId` through `getContext` and filters on it; a skill from another
workspace is a 404, never a 403.

| Method | Path | Body / params | Returns |
|---|---|---|---|
| GET | `/skills` | — | `SkillWithUsage[]`, name ascending |
| GET | `/skills/:id` | — | `Skill` |
| POST | `/skills` | `{name, description, type, body, enabled?}` | `Skill` (201) |
| PUT | `/skills/:id` | any of the above, all optional | `Skill` |
| DELETE | `/skills/:id` | — | `204` |
| GET | `/skills/:id/versions` | — | `SkillVersion[]`, version descending |
| GET | `/skills/:id/versions/:version` | `version` = positive int | `SkillVersion` |
| POST | `/skills/:id/restore` | `{version}` | `Skill` |
| POST | `/skills/import/preview` | `multipart/form-data`, one file | `SkillImportPreview` |
| POST | `/skills/import` | `multipart/form-data`, file + optional overrides | `Skill` (201) |

Bodies are validated by route-level Zod `body`/`params` schemas, never `Schema.parse` inside a
handler.

### 2. Versioning

- `POST /skills` writes the skill at `version = 1` **and** a `skill_versions` row for v1, in one
  transaction. Source is `manual`.
- `PUT /skills/:id` compares the incoming `body` to the stored one:
  - body changed → `version = version + 1`, insert the new body into `skill_versions`;
  - body absent or byte-identical → metadata-only update, **no** version bump, no new row.
    Toggling `enabled` therefore never creates a version.
- `POST /skills/:id/restore {version}` reads that version's body and applies it as a *new*
  version (`current + 1`). Older rows are never deleted or rewritten, so a restore is itself
  undoable and eval runs still resolve the exact text they scored. Restoring the current
  version is a no-op returning the unchanged skill.
- `DELETE /skills/:id` removes the row; `skill_versions` and `agent_skills` cascade (FKs in
  [`0000_init.sql`](../src/db/migrations/0000_init.sql)). Agents that linked it keep working —
  their next run assembles one skill fewer.

### 3. Import from file / zip

`POST /skills/import/preview` parses the upload in memory and returns the skill core
(`name`, `description`, `type`, `body`, `source: "imported_file"`, `warnings[]`) **without
touching the database**. `POST /skills/import` runs the same parser and persists the result
(plus v1 in `skill_versions`), honouring `name` / `description` / `type` overrides sent
alongside the file so the user can correct the preview before saving.

Parsing:

- **`.md` / `.markdown`** — body is the file text verbatim. `name` = override, else the first
  `# ` heading slugified to kebab-case, else the filename stem. `description` = the first
  non-heading, non-blank paragraph, trimmed to 200 chars, else `""`. `type` = override, else
  `custom`.
- **`.zip`** — unzipped in memory (`fflate.unzipSync`). Entry chosen: a `SKILL.md`
  (case-insensitive) at the shallowest depth; else the only `*.md` entry; else `400` listing the
  markdown candidates found. `__MACOSX/`, dotfiles and non-markdown entries are ignored. The
  chosen entry is then parsed by the `.md` rules above.
- Any other extension or media type → `415`, naming `.md` and `.zip` as the accepted formats.
  `.tar` / `.rar` / `.7z` are explicitly out of scope.

Guards, all enforced before parsing and each returning `413` or `400` with a specific message:
upload ≤ 1 MiB · ≤ 200 zip entries · ≤ 4 MiB total uncompressed (zip bomb) · entry paths
containing `..` or a leading `/` are rejected (zip slip) even though nothing is ever written to
disk · only the chosen entry is decoded as UTF-8.

An imported body is **data, never instructions**: it is stored verbatim and marked untrusted at
prompt-assembly time (see §5). Nothing from an archive is executed, and no file is written to
the filesystem.

New deps, installed with the package's own PM (`cd server && pnpm add …`, never by editing
`pnpm-lock.yaml`): `@fastify/multipart` (upload parsing, registered in the skills plugin with
the size limits above) and `fflate` (pure-JS zip).

### 4. Agent ↔ skill links

`GET|POST /agents/:id/skills` already exist and are unchanged on the wire. What this spec pins
down is their meaning:

- A row in `agent_skills` means **enabled for this agent**. The Skills tab's toggle links
  (`POST /agents/:id/skills {skill_id}`) or unlinks. Unlinking is
  `POST /agents/:id/skills {skill_ids}` with the id removed — `setSkills` replaces the whole
  set, which is the reorder path too.
- `order` is the array index of `skill_ids`, assigned by `AgentsRepository.setSkills`. It is the
  prompt order, not a display nicety (§5).
- `GET /skills` returns `agent_count` per skill: `COUNT(*) FROM agent_skills GROUP BY skill_id`,
  in one grouped query, not N+1.

### 5. Skills in a run

In [`run-executor.ts`](../src/modules/reviews/run-executor.ts), after the agent is resolved and
before `reviewPullRequest`:

1. `repo.linkedSkills(agentId)` → ordered by `agent_skills.order` ascending.
2. Drop any row whose `skills.enabled` is `false`. A globally disabled skill contributes
   nothing even while linked.
3. Map to `SkillPart { id, name, version, body, trusted }`, where `trusted` is
   `source === 'manual' || source === 'extracted'`. `imported_file`, `imported_url` and
   `community` are untrusted and get `wrapUntrusted`-ed by reviewer-core.
4. Pass `skills` into `reviewPullRequest`, plus
   `countTokens: (text) => this.container.tokenizer.count(text)`.
5. Log one line per assembled skill (`name` + `v` + tokens) through `runLog.info`, so the Live
   Log shows the same set the trace does.

Empty list → the argument is omitted entirely and the prompt is byte-identical to today's.

The tokenizer adapter's header comment currently scopes it to `modules/repo-intel`; widen that
note to include the reviews module. The adapter itself is unchanged (js-tiktoken `cl100k_base`,
falling back to `ceil(chars/4)`), so the token number never throws and never blocks a run.

`buildRunTrace` persists what reviewer-core returns: `prompt_assembly.skills` (the block text,
as today), plus `skill_blocks[]` and `skills_tokens`. `emptyPromptAssembly` gains
`skill_blocks: null, skills_tokens: null`.

### 6. Seed

`pnpm db:seed` stays idempotent and gains, in the demo workspace:

- **`test-quality-rubric`** (type `rubric`, source **`imported_file`**) — demands that every new
  branch and boundary case introduced by a diff be covered, and that a happy-path-only test be
  reported as an uncovered-branch finding.
- **`api-contract-breaking-change`** (type `convention`, source `manual`) — demands that a
  changed route signature, removed field or narrowed type be reported as a breaking change.
- Agents **Test Quality Reviewer** and **API Contract Reviewer**, each linked to its skill at
  `order = 0`.

That makes at least one skill on a new agent genuinely imported rather than hand-written
(criterion 16), and gives the control experiments their fixtures.

### 7. Control experiments (criteria 17, 18)

Manual, run against a live stack; not automated (an LLM call in CI is out of scope). The
procedure is part of this spec so it is repeatable:

1. `./scripts/dev.sh` from zero, then import a repo and open a PR whose diff adds a function
   plus a test that covers only the happy path (for 18: a PR that changes a route's request or
   response signature).
2. On the PR page, **Run Review** with *Test Quality Reviewer* (*API Contract Reviewer*) while
   its Skills tab has **no** skill enabled. Expected: no uncovered-branch finding (no
   breaking-change finding). Record the run id.
3. Enable the matching skill on that agent's Skills tab, rerun the same PR unchanged. Expected:
   at least one finding naming the uncovered branch and the boundary case (the breaking
   change), citing a real `file:line`.
4. Evidence for both: the two run ids, and their Run Trace screenshots showing the Skills
   section absent in run A and present in run B.

Same agent, same model, same diff between the two runs — the enabled skill set is the only
variable.

## Contracts & data

**`@devdigest/shared` — update BOTH copies** (`server/src/vendor/shared/contracts/`,
`client/src/vendor/shared/contracts/`; they have already diverged, so diff before editing):

`knowledge.ts`

```ts
export const SkillSource = z.enum([
  'manual', 'imported_file', 'imported_url', 'extracted', 'community',
]);                                   // 'imported_file' is new — criterion 15/16

export const SkillWithUsage = Skill.extend({ agent_count: z.number().int() });
export const SkillVersion = z.object({
  skill_id: z.string(), version: z.number().int(),
  body: z.string(), created_at: z.string(),
});
export const SkillImportPreview = z.object({
  name: z.string(), description: z.string(),
  type: SkillType, body: z.string(),
  source: z.literal('imported_file'),
  warnings: z.array(z.string()),
});
```

`trace.ts`

```ts
export const SkillBlock = z.object({
  skill_id: z.string(), name: z.string(),
  version: z.number().int(), tokens: z.number().int(),
});
// PromptAssembly gains — both nullish, so every persisted trace stays valid:
skill_blocks: z.array(SkillBlock).nullish(),
skills_tokens: z.number().int().nullish(),
```

**DB.** [`db/schema/skills.ts`](../src/db/schema/skills.ts): add `'imported_file'` to the
`source` enum list. The column is plain `text` in Postgres with no check constraint, so
`pnpm db:generate` must produce **no** new migration — if it emits one, stop and ask rather
than hand-editing anything under `migrations/`. `skill_versions` and `agent_skills` are used as
they stand; no schema change.

**Routes.** All of §1, plus the unchanged `/agents/:id/skills` pair.

**Prompt slot.** `PromptParts.skills` changes shape (`string[]` → `SkillPart[]`) — see the
[reviewer-core spec](../../reviewer-core/specs/skills-lab.md).

## Acceptance criteria

Numbered by the homework criteria in [`docs/hw2-criteria.md`](../../docs/hw2-criteria.md).
Criteria whose surface is UI-only live in the client spec; the coverage table below accounts for
all of 6–37.

- [ ] **AC-8** `GET/POST/PUT/DELETE /skills[:id]` read and write Postgres for real: a skill
      created through `POST /skills` is findable by a direct `SELECT` on `skills`, and a row
      deleted directly in the DB stops appearing in `GET /skills`.
- [ ] **AC-12** `POST /skills` accepts exactly name, description, type (`rubric | convention |
      security | custom`) and markdown body; a missing name or body is a 400 from the route
      schema, not a 500.
- [ ] **AC-13** `POST /agents/:id/skills {skill_ids}` persists `agent_skills.order` = array
      index, and `GET /agents/:id/skills` returns the links in that order after a restart.
- [ ] **AC-14** The run executor passes the agent's enabled linked skills to
      `reviewPullRequest` **in `agent_skills.order`**; reordering the links and rerunning the
      same PR produces a trace whose skill blocks appear in the new order.
- [ ] **AC-15** `POST /skills/import/preview` returns the parsed core of an uploaded `.md` or
      `.zip` and persists nothing; `POST /skills/import` persists it with
      `source = 'imported_file'`. Oversized, bomb, slip, ambiguous-zip and unsupported-format
      uploads each fail with their own status and message.
- [ ] **AC-16** After `pnpm db:seed`, at least one skill linked to a seeded agent has
      `source = 'imported_file'`.
- [ ] **AC-17** With *Test Quality Reviewer* and no skill enabled, a happy-path-only test PR
      produces no uncovered-branch finding; with `test-quality-rubric` enabled, the same PR
      produces one naming the uncovered branch and a boundary case. Procedure and evidence per
      §7.
- [ ] **AC-18** Same shape for *API Contract Reviewer* on a route-signature PR: skipped without
      the skill, breaking change reported with it.
- [ ] **AC-19** The persisted trace carries `skills_tokens` and one `skill_blocks` entry per
      assembled skill, each with `tokens` measured over that skill's contribution alone —
      counted by the tokenizer adapter, not over the whole prompt.
- [ ] **AC-20** A skill that is disabled globally or not linked to the agent contributes no
      `skill_blocks` entry, no text in `prompt_assembly.skills` and no Live Log line; with no
      enabled skills at all, `skills`, `skill_blocks` and `skills_tokens` are all `null`.
- [ ] **AC-21** *(out of package — repo-root tooling, tracked here so no criterion is
      homeless.)* `.claude/skills/pr-self-review/SKILL.md` exists as a Workflow-type dispatcher,
      its git-push hook is **not** installed, and a manual run on a diff touching both `client/`
      and `server/` loads both packages' skill sets in one pass.
- [ ] **AC-22** `GET /skills` returns `version` and `agent_count` per skill, computed in one
      grouped query.
- [ ] **AC-23** `DELETE /skills/:id` removes the row and cascades `skill_versions` +
      `agent_skills`; agents that linked it still run.
- [ ] **AC-27** `GET /skills/:id/versions` lists every version of the skill, newest first.
- [ ] **AC-28** `GET /skills/:id/versions/:version` returns that version's exact body, so the
      client can diff it against the current one.
- [ ] **AC-29** `POST /skills/:id/restore {version}` sets the body to that version's text as a
      new version; no historical row is mutated or dropped.
- [ ] **AC-33** `DELETE /agents/:id` (already implemented) removes the agent from the database
      and cascades its versions and skill links.
- [ ] **AC-36** `PUT /agents/:id` accepts every field the Config tab edits — name, description,
      provider, model, `strategy`, `system_prompt` — and versions the config snapshot.
- [ ] **AC-37** `GET /skills` returns every skill in the workspace, not only those linked to
      some agent, each carrying its `type` so the client can label it.

### Criteria coverage

| Criterion | server | client | reviewer-core |
|---|---|---|---|
| 6, 7, 9, 10, 11, 24, 25, 26, 30, 31, 32, 34, 35 | — | ✓ | — |
| 8, 16, 17, 18, 21 | ✓ | — | — |
| 12, 13, 15, 22, 23, 27, 28, 29, 33, 36, 37 | ✓ | ✓ | — |
| 14, 19, 20 | ✓ | ✓ | ✓ |

## Tests

- `src/modules/skills/service.test.ts` — unit, mocked repository: version bump only on a body
  change, restore appends rather than rewrites, metadata-only update keeps the version.
- `src/modules/skills/import.test.ts` — unit: `.md` name/description derivation, `SKILL.md`
  picked out of a zip, ambiguous zip → 400, bomb/slip/oversize rejections, `.tar` → 415.
- `src/modules/skills/skills.it.test.ts` — integration (testcontainers, `*.it.test.ts` naming is
  mandatory): full CRUD against real Postgres including the direct-`SELECT` and
  direct-`DELETE` checks AC-8 names, plus `agent_count` after linking two agents.
- `src/modules/reviews/run-executor.test.ts` — extend: ordered enabled skills reach
  `reviewPullRequest`; a disabled and an unlinked skill do not; the trace's `skill_blocks` match
  the linked set and `skills_tokens` is > 0; no skills → all three fields `null`.
- reviewer-core's own prompt tests cover the rendering and the token arithmetic.

## Open questions

- Should `GET /skills` be paginated? The criteria assume a workspace-sized list; add `limit` /
  `offset` only if the seeded workspace grows past a screenful.
- `imported_url` and `community` sources stay in the enum but have no route in this spec. They
  land with the community-search drawer, which is out of scope here.
