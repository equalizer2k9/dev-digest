# Conventions Extractor — client

**Status:** draft · **Package:** client · **Date:** 2026-09-20

Sibling: [`server/specs/conventions-extractor.md`](../../server/specs/conventions-extractor.md) ·
builds on [`skills-lab.md`](skills-lab.md)

## Problem

Skills Lab lets a user write or import a skill, but the rules a repo already follows have to be
typed out by hand. The server half of this feature reads them out of the code; the studio has no
page to run that scan, judge what came back, or turn the keepers into a skill. The design's
`Conventions` screen (`screen_conv_conf.jsx` in the bundle, decoded per
[`docs/design-reference.md`](../../docs/design-reference.md)) is the reference.

## Goals / non-goals

**Goals**

- A `Conventions` item in the SKILLS LAB sidebar section.
- A repo-scoped page: run a scan, rescan, and review candidates as cards with real evidence.
- Accept / Reject / inline Edit per candidate, all persisted.
- `Create skill` → a modal where name, description, type, enabled and the merged body are all
  editable, with an optional agent to link.
- The new skill appears on `/skills` without a reload.

**Non-goals**

- Several skills from one selection, import-from-URL, plugin packaging.
- New UI primitives or dependencies: `Modal`, `FormField`, `TextInput`, `Textarea`,
  `SelectInput`, `SearchableSelect`, `Toggle`, `ProgressBar`, `MonoLink`, `EmptyState`,
  `ErrorState`, `Button`, `Chip` already exist in `@devdigest/ui`. The design's `CodeEditor` is
  **not** ported — the body is a mono `Textarea`.

## Behaviour

### 1. Sidebar and route

[`vendor/ui/nav.ts`](../src/vendor/ui/nav.ts), SKILLS LAB becomes
`Skills · Agents · Conventions`:

```ts
{ key: "conventions", label: "Conventions", icon: "ListChecks", href: "/repos/:repoId/conventions", gKey: "c" }
```

`SHORTCUTS` gains `g c`. If `ListChecks` is missing from `vendor/ui/icons.tsx`, add it there
(lucide path), do not substitute another icon.

| Route | Kind | Params | Hook → endpoint | i18n |
|---|---|---|---|---|
| `/repos/[repoId]/conventions` | Client | `repoId` | `useConventions(repoId)` → `GET /repos/:id/conventions` | `conventions` |

The row is added to [`specs/pages.md`](pages.md) in the commit that implements the route.
Breadcrumb `Skills Lab › Conventions`. Unknown repo → the existing `RepoNotFound`.

### 2. Header — two scan buttons

`h1` "Conventions in `<repo.name>`", subtitle "Detected from `{sample_files}` sample files · last
scan `{relative time}`" (omitted before the first scan), and **two separate buttons, both always
rendered**:

| Button | Enabled when | Action |
|---|---|---|
| `Run Scan` (primary) | the repo has never been scanned (`extracted_at === null`) | `POST /repos/:id/conventions/extract` |
| `ReScan` (secondary, `RefreshCw`) | a scan exists | same endpoint — the server merges, see its §5 |

While a scan is in flight both are disabled, the active one shows a spinner and the label
"Scanning…" — the call is one synchronous model round-trip and can take tens of seconds. A `409
repo_not_indexed` renders inline under the header with the server's message; other failures use
`ErrorState`. Scan `warnings` render as a muted line under the subtitle.

Before the first scan the list area is the design's `EmptyState` ("No conventions extracted
yet"); its CTA triggers the same `Run Scan`.

### 3. Candidate cards

One `ConventionCard` per candidate, confidence descending (server order). Per the design:

- left border `var(--ok)` when accepted, `var(--border)` otherwise;
- the **rule**, italic, 14/600; a category `Chip` beside it;
- an evidence box: header = `MonoLink` with `evidence_path:L{start}-L{end}` that opens
  `githubBlobUrl(repo.full_name, head_sha ?? repo.default_branch, path, start, end)` in a new tab
  ([`lib/github-urls.ts`](../src/lib/github-urls.ts)), plus a copy-path icon; body = the snippet
  in a `<pre className="mono">`;
- **confidence**: label, a 90px `ProgressBar` (`var(--ok)` at ≥ 0.85, else `var(--warn)`), and the
  rounded percentage in `mono tnum`;
- a 150px action column with **three** buttons:
  - `Accept` (secondary, `Plus`) ⇄ `Accepted` (primary, `Check`) — toggles
    `PUT /conventions/:id {status}` between `accepted` and `pending`;
  - `Reject` (ghost, `X`) — `PUT … {status:"rejected"}`; the card leaves the list optimistically
    and does not come back on reload (the server never returns rejected rows);
  - `Edit` (ghost, `Pencil`) — switches **this card in place** into edit mode: the rule becomes a
    `Textarea`, the category a `SelectInput`, the action column becomes `Save` / `Cancel`. `Save`
    → `PUT … {rule, category}`; no navigation, no modal. Evidence is read-only in edit mode.

All three mutations are optimistic with rollback + toast on failure.

### 4. Toolbar

`Accept all` / `Deselect all` (ghost), "`{n}` of `{m}` accepted", and on the right **`Create
skill`** (primary, `Sparkles`). The button is **rendered only when at least one candidate is
accepted** — absent, not merely disabled, at zero.

### 5. `CreateSkillFromConventionsModal`

Opens on `Create skill`; fetches `GET /repos/:id/conventions/draft` (built server-side from
accepted rows only). `Modal` width 760, title "Create skill from conventions", subtitle = the
draft name.

- Banner: "Merged from **{count} accepted convention(s)** in `{repo.name}`. Everything below is
  editable before you save." — this is the line that tells the user where the skill comes from.
- `Name` * (mono `TextInput`, default `repo-conventions`) · `Description` (`TextInput`).
- Row: `Type` (`SelectInput`: rubric / convention / security / custom, default `convention`) ·
  `Enabled` (`Toggle`, hint "Whether this block is added to agents' prompts.").
- `Skill body` * — mono `Textarea`, ≥ 14 rows, hint "The only text sent to the model. Merged from
  the accepted rules + evidence — edit freely."
- `Link to agent` (optional `SearchableSelect` over `useAgents()`, placeholder "Don't link yet").
- Footer: muted "Saved as v1 · added to Skills Lab", `Cancel`, `Create skill`.

`Create skill` → `POST /repos/:id/conventions/skill` with the **edited** values (+ `agent_id`
when chosen). On success: close, toast with an `Open in Skills →` link to `/skills/:id`,
invalidate `["skills"]` and, when linked, `["agents"]` + `["agents", id, "skills"]`. Name or body
empty → the button stays disabled; a server error renders inline in the modal.

### 6. Data layer and i18n

`src/lib/hooks/conventions.ts` (new), all through `src/lib/api.ts`:

| Hook | Call |
|---|---|
| `useConventions(repoId)` | `GET /repos/:id/conventions` |
| `useExtractConventions(repoId)` | `POST /repos/:id/conventions/extract` |
| `useUpdateConvention(repoId)` | `PUT /conventions/:id` |
| `useConventionDraft(repoId, enabled)` | `GET /repos/:id/conventions/draft` — enabled only while the modal is open, `staleTime: 0` |
| `useCreateConventionSkill(repoId)` | `POST /repos/:id/conventions/skill` |

Contract types come from the client copy of `@devdigest/shared` as **types only** (a runtime
import of the vendored barrel breaks the webpack build — see `lib/feature-models.ts`); the
category list for the edit `SelectInput` is a local constant mirrored from the contract.

New namespace `messages/en/conventions.json` (`page.*`, `scan.*`, `card.*`, `edit.*`,
`toolbar.*`, `create.*`, `empty.*`, `errors.*`); `nav` label via the existing nav mechanism.
`ConventionCard` is registered in `src/components/showcase`.

### 7. Settings → Models

No new UI. `conventions` is already in the client registry
([`lib/feature-models.ts`](../src/lib/feature-models.ts)), so the Feature Models section already
renders its row with the searchable model dropdown. This spec only **verifies** it and keeps the
registry in sync with the server's.

## Contracts & data

No contract is authored here. The client copy of `@devdigest/shared/contracts/knowledge.ts` is
updated in lockstep with the server's — `ConventionCategory`, `ConventionStatus`, the extended
`ConventionCandidate`, `ConventionScan`, `ConventionSkillDraft` — exactly as in the
[server spec](../../server/specs/conventions-extractor.md#contracts--data). The two copies have
already diverged; diff before editing.

## Acceptance criteria

Numbered by [`docs/hw2-criteria.md`](../../docs/hw2-criteria.md).

- [ ] **AC-41** In the create modal the future skill's body **and** its metadata (name,
      description, type, enabled) are editable, and what is saved is what was edited.
- [ ] **AC-42** Choosing an agent in the modal links the created skill to it; the agent's Skills
      tab shows it enabled.
- [ ] **AC-44** `Conventions` sits under the **SKILLS LAB** sidebar heading, not WORKSPACE.
- [ ] **AC-45** The page has two separate buttons, `Run Scan` (first analysis) and `ReScan`
      (repeat / regenerate); exactly one is enabled at a time.
- [ ] **AC-46** After a scan each card shows the rule, the source file and the confidence as a
      percentage.
- [ ] **AC-47** Each card has three buttons: Accept, Reject, Edit.
- [ ] **AC-48** A rejected candidate is gone after a page reload and is not in the draft body.
- [ ] **AC-49** Edit turns the card itself editable in place — no route change, no modal.
- [ ] **AC-50** `Create skill` appears once at least one candidate is accepted, and is not in the
      DOM when none is.
- [ ] **AC-51** The modal says it creates a skill from conventions, has Name and Description
      fields, and `Cancel` / `Create skill` buttons.
- [ ] **AC-52** After creating, the skill is on `/skills` in the grid, source *Extracted*.
- [ ] **AC-53** Settings → Models shows a separate `Conventions` row with a searchable model
      dropdown; picking a model there changes the model the next scan reports.
- [ ] *(homework text)* The evidence path on a card is a link that opens the file at the cited
      lines on GitHub, pinned to the scanned commit.

## Tests

Component tests beside each subject, jsdom + Testing Library, `fetch` mocked:

- `ConventionsView.test.tsx` — never-scanned state: `Run Scan` enabled, `ReScan` disabled, empty
  state shown; after a scan the reverse; in-flight scan disables both; `409 repo_not_indexed`
  renders inline; `Create skill` absent at zero accepted and present at one.
- `ConventionCard.test.tsx` — rule, path with line range, percentage; the evidence link's `href`
  is the GitHub blob URL with `#Lx-Ly`; Accept toggles and posts; Reject removes the card; Edit
  swaps in the fields in place, `Save` posts `{rule, category}`, `Cancel` restores.
- `CreateSkillFromConventionsModal.test.tsx` — draft fields prefilled and editable; the edited
  values are what gets posted; `agent_id` sent only when chosen; empty name/body disables submit;
  server error inline.
- `nav` — `Conventions` is in SKILLS LAB and resolves `:repoId`.
- Showcase smoke test covers `ConventionCard`.

## Open questions

- With no active repo the nav href resolves to `/repos/_/conventions`; it lands on `RepoNotFound`
  like `/repos/_/pulls` does today. Acceptable, or should the item be disabled until a repo is
  selected?
- The design shows every candidate pre-accepted; here a fresh scan is all `pending`, so nothing
  reaches a skill without an explicit Accept. Deliberate — confirm.
