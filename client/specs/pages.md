# Route contract — the studio's pages

**Status:** implemented · **Package:** client · **Date:** 2026-09-20

## What this is

Every route that exists under [src/app](../src/app), and for each one: whether it renders on the
server or the client, which params it reads, which data hook it calls, which API endpoint that
hook ultimately hits, and what it shows while loading, when empty and on failure.

This is a **contract, not a description**. A row here is what the rest of the app — the shell,
the e2e flows in [../e2e/specs](../../e2e/specs), links written in other components — is
entitled to assume. Changing a route's kind, its params, its endpoint or its failure behaviour
means changing the row in the same commit; adding a route means adding one. The mechanics behind
the columns (how a hook is built, how the boundary is drawn) are in
[docs/ui-architecture.md](../docs/ui-architecture.md).

## The routes

Seven routes and one layout. There are no route groups, no parallel or intercepting routes, no
Route Handlers, and no `loading.tsx` / `error.tsx` / `not-found.tsx` anywhere — every state below
is a branch inside the page.

| Route | Page file | Kind | Params read | i18n namespace |
|---|---|---|---|---|
| *(all)* | [app/layout.tsx](../src/app/layout.tsx) | Server (`async`) | — | loads all |
| `/` | [app/page.tsx](../src/app/page.tsx) | Client | — | none (literal English) |
| `/onboarding` | [app/onboarding/page.tsx](../src/app/onboarding/page.tsx) | Client | — | none (literal English) |
| `/agents` | [app/agents/page.tsx](../src/app/agents/page.tsx) | **Server** wrapper → client view | — | `agents` |
| `/agents/[id]` | [app/agents/[id]/page.tsx](<../src/app/agents/[id]/page.tsx>) | Client | `id`, `?tab` | `agents` |
| `/settings/[section]` | [app/settings/[section]/page.tsx](<../src/app/settings/[section]/page.tsx>) | **Server** wrapper → client view | `section` | `settings` |
| `/repos/[repoId]/pulls` | [app/repos/[repoId]/pulls/page.tsx](<../src/app/repos/[repoId]/pulls/page.tsx>) | Client | `repoId`, `?status` | `prReview` |
| `/repos/[repoId]/pulls/[number]` | [app/repos/[repoId]/pulls/[number]/page.tsx](<../src/app/repos/[repoId]/pulls/[number]/page.tsx>) | Client | `repoId`, `number`, `?tab`, `?trace` | `prReview`, `runs`, `common` |

## True for every route

- The root layout renders `<html data-theme="dark" data-density="regular">`, injects the
  no-flash theme script, and wraps the tree in `NextIntlClientProvider → Suspense → Providers`
  ([app/layout.tsx](../src/app/layout.tsx)).
- `Providers` mounts `QueryClientProvider → ThemeProvider → ToastProvider → RepoProvider`
  ([lib/providers.tsx](../src/lib/providers.tsx)). Because `RepoProvider` calls `useRepos()`,
  **`GET /repos` fires on every route**, including `/onboarding`.
- A query that fails with status `0` (API unreachable) or `>= 500` raises a toast; any failed
  mutation raises a toast. An expected 4xx is silent so the page can render its own inline
  state.
- Every route except `/onboarding` renders inside
  [AppShell](../src/components/app-shell/AppShell.tsx), which adds the sidebar, the breadcrumb,
  `Cmd/Ctrl+K`, `?` and the `g`-then-key chords. The shell itself calls `usePulls(activeRepoId)`
  (`GET /repos/:repoId/pulls`, for the sidebar's needs-review badge) and can call
  `useDeleteRepo` (`DELETE /repos/:repoId`) from the repo switcher
  ([useShellContext.ts](../src/components/app-shell/hooks/useShellContext.ts)).
- Pages read params with `useParams()` / `useSearchParams()`, never as props — including the two
  routes whose page file is a Server Component, where the client view below it reads them.
- Every query-param write is `router.replace`, so filters and tabs do not stack in the back
  history.

---

## `/` — repo redirect

[app/page.tsx](../src/app/page.tsx) · Client.

| Needs | Hook | Call |
|---|---|---|
| The repo list | `useRepos` ([core.ts](../src/lib/hooks/core.ts)) | `GET /repos` |

A landing stub whose job is to get out of the way: a `useEffect` calls
`router.replace("/repos/<first repo id>/pulls")` as soon as the list arrives non-empty.

- **Loading** — three stacked `Skeleton`s.
- **Empty or error** (`isError || !repos || repos.length === 0`, one branch) — `EmptyState`
  "No repositories yet" with an "Add repository" CTA to `/onboarding`.
- **Success** — "Taking you to your repository…" plus an `Open <full_name>` button, visible only
  for the frame before the redirect lands.

## `/onboarding` — add a repository

[app/onboarding/page.tsx](../src/app/onboarding/page.tsx) → [AddRepoView](../src/app/onboarding/_components/AddRepoView/AddRepoView.tsx) · Client.

| Needs | Hook | Call |
|---|---|---|
| Clone + import a repo | `useAddRepo` | `POST /repos` with `{ url }` |

The only route that does **not** render `AppShell` — it is a full-screen card. On success it
pushes `/repos/<new repo id>/pulls`.

- **Loading** — none; the submit button reads "Cloning…" and is disabled while
  `addRepo.isPending`.
- **Error** — inline red box under the field, from `ApiError.message` (never a toast-only
  failure), keeping the typed URL.
- **Escape** — `Esc` and the close button both `router.push("/")`; the footer advertises it.

## `/agents` — agent list

[app/agents/page.tsx](../src/app/agents/page.tsx) (Server, two lines) →
[AgentsListView](../src/app/agents/_components/AgentsListView/AgentsListView.tsx) (Client).

| Needs | Hook | Call |
|---|---|---|
| All agents | `useAgents` ([agents.ts](../src/lib/hooks/agents.ts)) | `GET /agents` |
| Enable/disable toggle | `useUpdateAgent` | `PUT /agents/:id` |
| Create | `useCreateAgent` (in [CreateAgentModal](../src/app/agents/_components/AgentsListView/_components/CreateAgentModal/CreateAgentModal.tsx)) | `POST /agents` |
| Delete | `useDeleteAgent` (in [AgentCard](../src/app/agents/_components/AgentCard/AgentCard.tsx)) | `DELETE /agents/:id` |

Search is local state filtered by `filterAgents()`; it is not a URL param.

- **Loading** — three `Skeleton` cards.
- **Error** — `ErrorState` with a retry that calls `refetch()`.
- **Empty** (no agents, or none matching the search) — `EmptyState` with a "create" CTA that
  opens the modal.
- Creating pushes `/agents/<id>?tab=config`; deleting is behind a `window.confirm`.

## `/agents/[id]` — agent editor

[app/agents/[id]/page.tsx](<../src/app/agents/[id]/page.tsx>) · Client.

| Needs | Hook | Call |
|---|---|---|
| The left-hand agent list | `useAgents` | `GET /agents` |
| The edited agent | `useAgent(id)` | `GET /agents/:id` |
| Save / toggle | `useUpdateAgent` | `PUT /agents/:id` |
| Model picker options | `useProviderModels(provider)` (in [ConfigTab](<../src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx>)) | `GET /providers/:provider/models` |

**Params.** `id` from the path. `?tab` is validated against `VALID_TABS = ["config"]` and falls
back to `config`; switching tabs is `router.replace`. The editor is one tab today
([AgentEditor.tsx](<../src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx>)) — `?tab`
is kept for the lessons that add more.

- **Loading** — the left list renders as soon as `useAgents` resolves; the editor pane shows two
  `Skeleton`s while `useAgent` is in flight.
- **Error** — `isError` *or* a settled-but-missing agent renders a full-screen `ErrorState`
  ("Couldn't load this agent") with retry, replacing the whole page body but keeping the shell
  and breadcrumb.
- `ConfigTab` holds the form in local state and resets it on `agent.id` change; an empty model
  list after load is treated as "provider key missing" and surfaces a hint rather than an empty
  dropdown.

## `/settings/[section]` — settings

[app/settings/[section]/page.tsx](<../src/app/settings/[section]/page.tsx>) (Server, two lines) →
[SettingsView](<../src/app/settings/[section]/_components/SettingsView/SettingsView.tsx>) (Client).

The section is a path segment, not a query param. Known sections come from `SETTINGS_SECTIONS`
in [vendor/ui/nav.ts](../src/vendor/ui/nav.ts): `api-keys` and `models`.

**`/settings/api-keys`** — [SettingsApiKeys](<../src/app/settings/[section]/_components/SettingsView/_components/SettingsApiKeys/SettingsApiKeys.tsx>):

| Needs | Hook | Call |
|---|---|---|
| Which provider keys are set (booleans only) | `useSecretsStatus` | `GET /settings/secrets-status` |
| Save/validate one key | `useTestConnection` | `POST /settings/test-connection` |

One row per provider — `openai`, `anthropic`, `openrouter`, `github`. The badge renders nothing
at all while the status is `undefined`, then "Configured" or "Not set". The test result renders
inline beneath the row, including the failure message.

**`/settings/models`** — [SettingsModels](<../src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx>):

| Needs | Hook | Call |
|---|---|---|
| Current per-feature model choices | `useSettings` | `GET /settings` |
| Persist a choice | `useUpdateSettings` | `PUT /settings` (`{ feature_models }`) |
| Live model list + prices | `useProviderModels("openrouter")` | `GET /providers/openrouter/models` |

Each feature falls back to its registry default from
[lib/feature-models.ts](../src/lib/feature-models.ts) and is tagged as using the default until
set. A current value missing from the live list is prepended so it stays selectable; an empty
list after load switches the footnote to the "no key" variant.

- **Unknown `:section`** — the sub-nav still renders and the pane shows an `EmptyState` titled
  with the first section's label and the `settings.fallbackBody` message. No 404, no redirect.
- **Loading / error** — neither panel renders a skeleton or an error state; a failed
  `GET /settings` surfaces as the global toast and the pickers show their defaults.

## `/repos/[repoId]/pulls` — pull-request list

[app/repos/[repoId]/pulls/page.tsx](<../src/app/repos/[repoId]/pulls/page.tsx>) · Client.

| Needs | Hook | Call |
|---|---|---|
| The PR rows | `usePulls(repoId)` | `GET /repos/:repoId/pulls` (re-polls every 60 s and on window focus) |
| "Refresh" | `useRefreshRepo` | `POST /repos/:repoId/refresh` |
| Active repo name / validity | `useActiveRepo`, `useRepoNotFound` ([repo-context.tsx](../src/lib/repo-context.tsx)) | — (reads the shared `GET /repos`) |

**Params.** `repoId` from the path. `?status` selects the filter chip and **defaults to
`needs_review`**; `setStatus` always writes the key explicitly so `all` sticks over the default.
Search text and sort order are local state, deliberately not in the URL.

Columns are `COLUMN_KEYS` in [constants.ts](<../src/app/repos/[repoId]/pulls/constants.ts>) —
pull request · author · size · score · status · cost · updated. Sorting is by `updated_at`,
newest first unless `sort === "oldest"`. A row navigates to
`/repos/:repoId/pulls/:number` ([PRRow](<../src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx>)).

- **Unknown `:repoId`** — once the repo list has loaded and does not contain it, the page
  short-circuits to [RepoNotFound](../src/components/repo-not-found/RepoNotFound.tsx) inside the
  shell, before any error can surface. Still loading, or a failed repo fetch, does **not**
  trigger it.
- **Loading** — `SKELETON_ROWS` (4) skeleton rows under a live header row.
- **Error** — `ErrorState` with retry, message from `ApiError` or `list.errorBody`.
- **Empty** — `EmptyState` whose body differs for `status === "all"` versus a specific filter,
  so "nothing here" is distinguishable from "nothing matching this filter".

## `/repos/[repoId]/pulls/[number]` — PR detail

[app/repos/[repoId]/pulls/[number]/page.tsx](<../src/app/repos/[repoId]/pulls/[number]/page.tsx>) · Client.

**The route is keyed by PR number; every PR endpoint is keyed by the row's uuid.** The page
resolves one to the other through the cached list — `usePulls(repoId)` then
`pulls.find(p => p.number === Number(number))?.id` — and every hook below stays disabled until
that `prId` exists. This indirection is part of the contract: arriving here without the list
being fetchable means no detail request is ever made.

| Needs | Hook | Call |
|---|---|---|
| number → uuid | `usePulls(repoId)` | `GET /repos/:repoId/pulls` |
| PR header, body, files, commits | `usePullDetail(prId)` | `GET /pulls/:prId` |
| Persisted runs + findings | `usePrReviews(prId)` | `GET /pulls/:prId/reviews` |
| In-flight runs (live state) | `usePrActiveRuns(prId)` | `GET /pulls/:prId/runs/active` (4 s poll while non-empty) |
| Full run history (timeline) | `usePrRuns(prId)` | `GET /pulls/:prId/runs` (4 s poll while any run is running) |
| Delete a run | `useDeleteRun(prId)` | `DELETE /runs/:runId` |
| Cancel a run | `useCancelRun` | `POST /runs/:runId/cancel` |
| Start a review | `useRunReview` + `useAgents` ([RunReviewDropdown](<../src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx>)) | `POST /pulls/:prId/review`, `GET /agents` |
| Delete one run's review | `useDeleteReview(prId)` ([ReviewRunAccordion](<../src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx>)) | `DELETE /reviews/:reviewId` |
| Accept / dismiss a finding | `useFindingAction` ([FindingsPanel](<../src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx>)) | `POST /findings/:findingId/accept` · `/dismiss` |
| Live log | `useRunEvents` ([RunStatus](<../src/app/repos/[repoId]/pulls/[number]/_components/RunStatus/RunStatus.tsx>)) | **SSE** `GET /runs/:runId/events` |
| Run trace document | `useRunTrace` ([RunTraceDrawer](<../src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx>)) | `GET /runs/:runId/trace` |
| Inline GitHub comments | `usePrComments`, `useCreatePrComment` ([DiffTab](<../src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx>)) | `GET` / `POST /pulls/:prId/comments` |

**Params.** `repoId` and `number` from the path. `?tab` defaults to `overview` and takes
`overview` · `findings` · `diff`; `?trace` holds a run id and, while set on a resolved PR, mounts the
run-trace drawer over the page. Both are written through one `setParam` helper that deletes the key when
the value is `null`.

**Tabs.**

- `overview` → [OverviewTab](<../src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx>) — the PR description, or nothing at all when `pr.body` is empty.
- `findings` → [FindingsTab](<../src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx>) — live-run log, the lethal-trifecta banner, the run/commit timeline, then one `ReviewRunAccordion` per run (newest first, first one open). Its per-run counters and severity filter are specified in [findings-severity-counters.md](findings-severity-counters.md).
- `diff` → [DiffTab](<../src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx>) — the file-by-file diff; inline commenting is offered only when `pr.status === "open"` and a `prId` is known, and existing comments start hidden behind a toggle.

**States.**

- **Unknown `:repoId`** — `RepoNotFound` inside the shell, same rule as the list.
- **Loading** — `pullsLoading || (prId != null && detailLoading)` renders three skeletons. A
  `number` that matches no row leaves `prId === null`, so this is *not* a loading state and the
  page falls through to the error branch.
- **Error** — `isError || !pr` renders a full-screen `ErrorState` with retry.
- **Empty** — no runs and nothing running gives an `EmptyState` on the findings tab pointing at
  the Run Review dropdown; while a run is live the empty state is suppressed.
- Deleting a run is behind a `window.confirm` that warns the logs go too. When the SSE stream
  ends, the page invalidates `["pr-active-runs", prId]` and `["pr-runs", prId]` and refetches
  the reviews, so a finished or failed run appears without a reload.

---

## Private folders and their owners

`_components/` is private to the segment it sits in; the owner is the nearest route above it.

| Folder | Owner |
|---|---|
| [app/onboarding/_components/](../src/app/onboarding/_components/AddRepoView/AddRepoView.tsx) | `/onboarding` |
| [app/agents/_components/](../src/app/agents/_components/AgentsListView/AgentsListView.tsx) | `/agents` — but `AgentCard` is also imported by `/agents/[id]` |
| [app/agents/[id]/_components/](<../src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx>) | `/agents/[id]` |
| [app/settings/[section]/_components/](<../src/app/settings/[section]/_components/SettingsView/SettingsView.tsx>) | `/settings/[section]` |
| [app/repos/[repoId]/pulls/_components/](<../src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx>) | `/repos/[repoId]/pulls` |
| [app/repos/[repoId]/pulls/[number]/_components/](<../src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx>) | `/repos/[repoId]/pulls/[number]` |

Cross-route UI lives outside `src/app` instead: [components/app-shell](../src/components/app-shell/AppShell.tsx),
[components/diff-viewer](../src/components/diff-viewer/index.ts),
[components/page-shell](../src/components/page-shell/PageShell.tsx),
[components/repo-not-found](../src/components/repo-not-found/RepoNotFound.tsx),
[components/mermaid-diagram](../src/components/mermaid-diagram/MermaidDiagram.tsx) and
[components/showcase](../src/components/showcase/Showcase.tsx).

## Link targets that are not routes

Three places name paths this contract does not cover. They resolve to a 404 if reached, and that
is the current expected behaviour:

- [helpers.ts](../src/components/app-shell/helpers.ts)'s `activeKeyFor()` maps `/skills`,
  `/memory`, `/eval`, `/ci-runs`, `/agent-performance`, `/context`, `/conventions`,
  `/multi-agent` to sidebar keys. Only the two entries in `NAV`
  ([vendor/ui/nav.ts](../src/vendor/ui/nav.ts)) — `/repos/:repoId/pulls` and `/agents` — plus
  `SETTINGS_ITEM` (`/settings/api-keys`) are rendered, so the other keys are unreachable today.
- `messages/en/` holds namespaces for those same unbuilt screens; they are merged into the
  message tree but nothing reads them.
- The design system's README refers to a `/showcase` route. There is none — the gallery is
  mounted only by [src/test/smoke.test.tsx](../src/test/smoke.test.tsx).
