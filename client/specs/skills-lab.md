# Skills Lab — client

**Status:** draft · **Package:** client · **Date:** 2026-09-20

Siblings: [`server/specs/skills-lab.md`](../../server/specs/skills-lab.md) ·
[`reviewer-core/specs/skills-lab.md`](../../reviewer-core/specs/skills-lab.md)

## Problem

The studio has no Skills surface at all: no `/skills` route, no skills hook in
[`src/lib/hooks`](../src/lib/hooks), and `Agents` sits in the **WORKSPACE** sidebar section
([`vendor/ui/nav.ts`](../src/vendor/ui/nav.ts)) rather than a Skills Lab. `messages/en/skills.json`
already carries most of the copy, which is the only part of the feature that exists.

The Agent editor shows a single `Config` tab ([`AgentEditor/constants.ts`](<../src/app/agents/[id]/_components/AgentEditor/constants.ts>)),
so there is nowhere to attach a skill to an agent, let alone order the attachments. Deletions
confirm through `window.confirm`. The Run Trace already renders a skills `PromptBlock` when
`prompt_assembly.skills` is non-null ([`TraceBody.tsx`](<../src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx>)),
but that field is always null today and the block carries no token number.

## Goals / non-goals

**Goals**

- A SKILLS LAB sidebar section holding Skills and Agents.
- `/skills` (grid of cards + side-panel preview) and `/skills/:id` (Config · Preview ·
  Versioning).
- Create and import skills; delete them behind a real confirmation modal.
- An agent `Skills` tab: every skill in the system, per-agent toggle, name search, drag-and-drop
  order over the enabled ones.
- A Run Trace that shows one block per assembled skill with its token weight.

**Non-goals**

- `Conventions`, `Eval Dashboard`, `Memory`, community search, "import from URL" and the
  design's `Evals` / `Stats` tabs (criteria 38–53 and later homework).
- New UI primitives. `Modal`, `Drawer`, `Tabs`, `SearchableSelect`, `Toggle`, `Markdown`,
  `Chip`, `Badge`, `Dropdown`, `FormField`, `TextInput`, `Textarea`, `SelectInput` all exist in
  `@devdigest/ui` and are used as they are.
- A drag-and-drop dependency. Native HTML5 drag events, plus keyboard move buttons.

## Behaviour

### 1. Sidebar and routes

[`vendor/ui/nav.ts`](../src/vendor/ui/nav.ts) becomes two groups:

| Section | Items |
|---|---|
| WORKSPACE | Pull Requests (`/repos/:repoId/pulls`, `g p`) |
| SKILLS LAB | Skills (`/skills`, `g s`) · Agents (`/agents`, `g a`) |

`Agents` moves out of WORKSPACE; its href, key and `g a` chord are unchanged. `SHORTCUTS` gains
`g s`. Both new routes are client components inside `AppShell`, breadcrumb `Skills Lab ›
Skills` (`skills.page.crumbLab` / `crumbSkills`, both already in the namespace) and `Skills Lab
› Agents` for the agent pages.

| Route | Kind | Params | Hook → endpoint | i18n |
|---|---|---|---|---|
| `/skills` | Client | — | `useSkills()` → `GET /skills` | `skills` |
| `/skills/[id]` | Client | `id`, `?tab` | `useSkill(id)`, `useSkillVersions(id)` | `skills` |

Both rows get added to [`specs/pages.md`](pages.md) in the same commit that implements them,
per that file's contract.

### 2. `/skills` — the grid

A responsive CSS grid (`repeat(auto-fill, minmax(280px, 1fr))`) of `SkillCard`s, header with
`h1` + an `Add Skill` `Dropdown`, and a client-side search box filtering on name and
description.

**`SkillCard`** (`_components/SkillCard/`) — name, type chip coloured per
`SKILL_TYPE` from the design, description (single line, ellipsised), `enabled` `Toggle`,
`v{version}` badge, `{n} agents` counter from `agent_count`, and a trash `IconBtn`. The toggle
fires `PUT /skills/:id {enabled}` optimistically; a disabled card renders at `opacity: .6`, as
the design does.

**Card click → side panel.** Clicking anywhere but the toggle or the trash opens
`SkillPreviewDrawer`, a right-hand `Drawer` (width 480): name, type chip, `v{version}`,
`agent_count`, the body rendered through the `Markdown` primitive, and an `Open →` link to
`/skills/:id`. It is a drawer, not a modal and not a navigation — the preview and the grid are
on screen together.

**`Add Skill` dropdown** — two items:

- *Create from scratch* → `CreateSkillModal`: `Modal` with name, description, type
  (`SelectInput` over the four types) and a markdown body `Textarea`; `Cancel` / `Create` →
  `POST /skills`, then the new card appears in the grid.
- *Import from file* → `ImportSkillModal`: a file input accepting `.md,.zip`. On pick it posts
  to `POST /skills/import/preview` and shows the parsed core — name, description, type, and the
  body rendered with `Markdown` — all editable before saving. `Save` posts the file plus the
  edited fields to `POST /skills/import`; the resulting card shows source *Imported*.
  Server-side rejections (too large, ambiguous zip, unsupported format) surface as an inline
  error in the modal, not a toast.

**Delete.** The trash button opens `ConfirmDialog` (new, `src/components/confirm-dialog/`): a
`Modal` with the skill's name in the body, a destructive `Confirm`, a `Cancel`, and the `Modal`'s
own `×`. Confirm → `DELETE /skills/:id`. This component replaces `window.confirm` here and in
`AgentCard`; the two other `window.confirm` call sites on the PR page are out of scope.

### 3. `/skills/[id]` — the skill page

`Tabs` with exactly `Config` · `Preview` · `Versioning`, tab state in `?tab` via
`router.replace`.

- **Config** — name, description, type, body (markdown `Textarea`), `Enabled` toggle, `Save` →
  `PUT /skills/:id`. A hint states that saving a changed body snapshots the current text as
  `v{version + 1}`. A `Delete skill` zone at the bottom uses the same `ConfirmDialog`.
- **Preview** — the body through the `Markdown` primitive: headings, lists and fenced code
  rendered, never the raw markdown source.
- **Versioning** — `GET /skills/:id/versions`, newest first. The current version is badged
  *Current* and has no buttons. Every older row has:
  - **Diff** → a `Modal` showing a line-level diff of that version against the current body,
    computed in the browser (`helpers.ts`, LCS over lines) from
    `GET /skills/:id/versions/:version` and the current skill; added lines green, removed red,
    context muted.
  - **Restore** → `ConfirmDialog`, then `POST /skills/:id/restore {version}`. The list
    refetches: the restored text becomes the new current version and the old rows stay.

### 4. `/agents` — the tiles

The list becomes the same auto-fill grid as `/skills`. `AgentCard` already renders name,
description, model chip, `enabled` toggle and `{n} skills`; the change is the grid layout and
swapping its `window.confirm` for `ConfirmDialog`. Deleting hits the existing
`DELETE /agents/:id`.

### 5. `/agents/[id]` — Config and Skills

`TABS` in [`AgentEditor/constants.ts`](<../src/app/agents/[id]/_components/AgentEditor/constants.ts>)
becomes exactly two entries, `config` and `skills`; no third tab ships with this feature.

**Config** is already complete — name, description, provider, model (`SearchableSelect` over
`GET /providers/:id/models`), review strategy, system prompt — so the work is verification, not
new fields.

**Skills tab** (`_components/SkillsTab/`), built from `useSkills()` + `useAgentSkills(agentId)`:

- Lists **every** skill in the workspace, not only the linked ones. Each row: drag handle, name,
  type label chip, and an `enabled` `Toggle`.
- *Enabled for this agent* ⇔ a link row exists. Toggling on appends the skill at the end of the
  order; toggling off removes it. Both write through
  `POST /agents/:id/skills {skill_ids}` with the full ordered list of enabled ids, which is the
  same call reordering uses.
- A search input filters rows by name, client-side, without dropping the ordering of what
  remains.
- Enabled rows form an ordered, draggable list at the top; disabled rows follow in name order
  and are **not** draggable — no handle, `draggable={false}`. Dropping a row writes the new
  order and optimistically reorders the list; a failed write rolls back and raises a toast.
- Native HTML5 drag events (`onDragStart` / `onDragOver` / `onDrop`), no library. Each enabled
  row also carries `Move up` / `Move down` `IconBtn`s with `aria-label`s, so the order is
  reachable from the keyboard and assertable in a jsdom test.
- Copy above the list states that order is prompt order — the same claim the design makes.

### 6. Run Trace — the skills block

In `TraceBody`, the single skills `PromptBlock` becomes a group driven by
`prompt_assembly.skill_blocks`:

- Section header `Skills` with the block total: `{skills_tokens} tokens`, `tnum`, muted.
- One `PromptBlock` per entry, labelled `{name} · v{version}`, coloured `PROMPT_COLORS.skills`,
  with that entry's `tokens` right-aligned. Clicking still opens the existing prompt-search
  modal over the block text.
- `skill_blocks` null or empty → **no** skills section and no header. A skill that is disabled
  or not linked leaves no trace of itself anywhere in the drawer.
- Back-compatibility: a trace with `skills` text but no `skill_blocks` (any run from before this
  feature) renders exactly as it does today — one unlabelled block, no token number.

### 7. Data layer

`src/lib/hooks/skills.ts` (new), every call through `src/lib/api.ts`:

| Hook | Call |
|---|---|
| `useSkills()` | `GET /skills` |
| `useSkill(id)` | `GET /skills/:id` |
| `useSkillVersions(id)` | `GET /skills/:id/versions` |
| `useSkillVersion(id, v)` | `GET /skills/:id/versions/:version` |
| `useCreateSkill()` / `useUpdateSkill()` / `useDeleteSkill()` | `POST` / `PUT` / `DELETE /skills[:id]` |
| `useRestoreSkillVersion()` | `POST /skills/:id/restore` |
| `useImportSkillPreview()` / `useImportSkill()` | `POST /skills/import/preview` / `/skills/import` |
| `useAgentSkills(agentId)` / `useSetAgentSkills()` | `GET` / `POST /agents/:id/skills` |

Mutations invalidate `["skills"]` and, for link changes, `["agents", id, "skills"]` and
`["agents"]` (the tile's skill count and each card's `agent_count` both move). The two import
calls send `FormData`, so `api.ts` gains a multipart path that does not set `Content-Type`
by hand.

### 8. i18n and showcase

`messages/en/skills.json` already covers the page, drawer, file import, list item and preview;
extend it with `card.*` (`agents`, `version`, `delete`), `create.*`, `import.*`, `versions.*`
(`diff`, `restore`, `current`), `confirm.*` and `tabs.*`. `agents.json` gains `editor.tabs`
trimmed to two, plus `skills.*` for the tab (search placeholder, order hint, move up/down).
`runs.json` gains the trace strings (`trace.prompt.skillsTotal`, per-block label).

New or changed components are registered in `src/components/showcase` — `SkillCard`,
`SkillPreviewDrawer`, `ConfirmDialog` — since the showcase smoke test mounts the gallery.

## Contracts & data

No contract is authored here. The client copy of `@devdigest/shared` must be updated in lockstep
with the server's — `SkillSource += 'imported_file'`, `SkillWithUsage`, `SkillVersion`,
`SkillImportPreview`, `SkillBlock`, `PromptAssembly.skill_blocks`, `PromptAssembly.skills_tokens`
— exactly as written in the
[server spec](../../server/specs/skills-lab.md#contracts--data). The two copies have already
diverged; diff before editing.

## Acceptance criteria

Numbered by [`docs/hw2-criteria.md`](../../docs/hw2-criteria.md). Criteria whose surface is
API-only are in the server spec; the coverage table there accounts for all of 6–37.

- [ ] **AC-6** `Agents` renders under the **SKILLS LAB** sidebar heading, not WORKSPACE.
- [ ] **AC-7** `/agents` shows every agent as a tile in a grid, not a single-column list.
- [ ] **AC-9** `/skills` shows a card per skill with name, type, description and an enabled
      toggle.
- [ ] **AC-10** Clicking a skill card opens its preview in a right-hand side panel — not a
      modal, not a navigation; the grid stays visible behind it.
- [ ] **AC-11** The `Add Skill` button opens a menu offering *create* and *import*; choosing
      *create* opens the creation modal.
- [ ] **AC-12** The creation modal has exactly name, description, type and a markdown body, and
      creating from it adds the skill to the grid.
- [ ] **AC-13** The agent's `Skills` tab attaches and detaches skills, and reorders the attached
      ones by drag-and-drop; the order survives a reload.
- [ ] **AC-14** That order is not cosmetic: after reordering and rerunning the agent, the Run
      Trace lists the skill blocks in the new order. *(Client half — the server and the engine
      carry the rest.)*
- [ ] **AC-15** *Import* accepts a `.md` file or a `.zip` archive and shows the parsed skill
      core — name, description, type, rendered body — before anything is saved.
- [ ] **AC-16** At least one skill attached to the new agents shows source *Imported*, not
      *Manual*.
- [ ] **AC-19** The Run Trace's prompt-assembly section shows a skills block with a token number
      beside it — the weight of that block, not of the whole prompt — and one labelled
      sub-block per skill with its own count.
- [ ] **AC-20** A disabled or unlinked skill has no block in the trace at all; with no enabled
      skills the section is absent entirely.
- [ ] **AC-22** A skill card shows its current version and the number of agents it is attached
      to, alongside name, type, description and toggle.
- [ ] **AC-23** A skill card has a Delete button.
- [ ] **AC-24** Delete opens a modal with confirm, cancel and a close `×`; cancelling leaves the
      skill in place.
- [ ] **AC-25** `/skills/:id` has the tabs `Config`, `Preview` and `Versioning`.
- [ ] **AC-26** `Preview` renders the body — headings, lists, code blocks — not raw markdown.
- [ ] **AC-27** `Versioning` lists every version of the skill.
- [ ] **AC-28** Each older version has a `Diff` button showing its difference from the current
      version.
- [ ] **AC-29** Each older version has a `Restore` button that returns the body to that version.
- [ ] **AC-30** The agent's `Skills` tab has a search field filtering skills by name.
- [ ] **AC-31** Only enabled skills are draggable; disabled rows have no drag handle and cannot
      be reordered.
- [ ] **AC-32** An agent tile shows name, description, model, an enabled toggle and the count of
      attached skills.
- [ ] **AC-33** An agent tile has a Delete button that removes the agent from the database.
- [ ] **AC-34** Agent delete opens a modal with confirm, cancel and `×` — `window.confirm` is
      gone from `AgentCard`.
- [ ] **AC-35** `/agents/:id` has exactly two tabs: `Config` and `Skills`.
- [ ] **AC-36** The `Config` tab edits name, description, provider, model (from a list), review
      strategy and the system prompt.
- [ ] **AC-37** The `Skills` tab lists **all** skills in the system, each with an enabled toggle
      and a type label (`security` / `convention` / `rubric` / `custom`).

## Tests

Component tests beside each subject, jsdom + Testing Library, `fetch` mocked:

- `SkillCard.test.tsx` — version and agent count render; toggle and delete do not trigger the
  card's own click; delete opens the dialog rather than deleting.
- `SkillsGridView.test.tsx` — card click opens the drawer and the grid stays mounted; search
  filters; the `Add Skill` menu offers create and import.
- `CreateSkillModal.test.tsx` / `ImportSkillModal.test.tsx` — required fields; preview is shown
  and editable before save; a server rejection renders inline.
- `SkillDetailView.test.tsx` — the three tabs; `Preview` emits rendered elements, not a `<pre>`
  of markdown; `Diff` shows added/removed lines; `Restore` confirms first.
- `SkillsTab.test.tsx` — all skills listed, not just linked; search; toggling writes the full
  ordered id list; disabled rows are not draggable; the move-up button reorders and posts.
- `AgentCard.test.tsx` (extend) — delete goes through the dialog.
- `TraceBody.test.tsx` (extend) — one block per `skill_blocks` entry with its token number and
  the block total in the header; no section when the array is null or empty; a legacy trace with
  `skills` but no `skill_blocks` still renders.
- `ConfirmDialog.test.tsx` — confirm, cancel and `×` paths.
- Showcase smoke test covers the new components by mounting the gallery.

An `e2e` flow is out of scope here; if one is added it belongs in
[`e2e/specs`](../../e2e/specs) as `NN-skills-lab.flow.json`.

## Open questions

- Should `/skills` keep a URL-driven selection (`?skill=<id>`) so a preview is linkable, or is
  the drawer purely local state? Spec'd as local state for now.
- The design's `Add Skill` menu also offers *Import from URL* and *Search community skills*.
  Both are deferred, so the menu ships with two items — confirm that is acceptable for the
  demo rather than shipping disabled entries.
