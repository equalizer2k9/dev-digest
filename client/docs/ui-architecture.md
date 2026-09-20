# UI architecture

How the studio is wired underneath the routes: where the Server/Client boundary is drawn, how
data reaches a component, and where colors and strings come from. The route-by-route contract
lives in [specs/pages.md](../specs/pages.md); the design-system layer map lives in
[src/vendor/ui/README.md](../src/vendor/ui/README.md).

## The Server/Client boundary

The boundary sits one level below the route entry: **the root layout and two thin page wrappers
render on the server, everything that needs data or interaction is a Client Component.**

| File | Kind | Why |
|---|---|---|
| [app/layout.tsx](../src/app/layout.tsx) | Server (`async`) | awaits `getLocale()` / `getMessages()` from `next-intl/server`, which read message files off disk (`layout.tsx:14-16`) |
| [app/agents/page.tsx](../src/app/agents/page.tsx) | Server | two-line wrapper — renders `<AgentsListView />` and nothing else |
| [app/settings/[section]/page.tsx](<../src/app/settings/[section]/page.tsx>) | Server | same shape — renders `<SettingsView />` |
| [app/page.tsx](../src/app/page.tsx) | `"use client"` | `useRouter`, `useRepos`, a redirect `useEffect` |
| [app/onboarding/page.tsx](../src/app/onboarding/page.tsx) | `"use client"` | wrapper, already marked client |
| [app/agents/[id]/page.tsx](<../src/app/agents/[id]/page.tsx>) | `"use client"` | `useParams` / `useSearchParams` + agent hooks |
| [app/repos/[repoId]/pulls/page.tsx](<../src/app/repos/[repoId]/pulls/page.tsx>) | `"use client"` | route params, local filter/sort state, `usePulls` |
| [app/repos/[repoId]/pulls/[number]/page.tsx](<../src/app/repos/[repoId]/pulls/[number]/page.tsx>) | `"use client"` | route + query params, seven data hooks, cache invalidation |

The two server pages are not an optimisation — they are the naming convention (a route entry is
thin, the view lives in `_components/<Name>/`) meeting the fact that a wrapper with no hooks
needs no directive. The layer that *first* needs hooks is the view:
[AgentsListView.tsx](../src/app/agents/_components/AgentsListView/AgentsListView.tsx) (search
state, `useAgents`, `useUpdateAgent`) and
[SettingsView.tsx](<../src/app/settings/[section]/_components/SettingsView/SettingsView.tsx>)
(`useParams`, `useTranslations`) both declare `"use client"` themselves.

Four consequences worth knowing before changing anything here:

- **Nothing fetches on the server.** No page or layout calls `fetch`; every byte of API data
  arrives through a client hook after hydration. The app's only server-side I/O is the message
  read in [src/i18n/request.ts](../src/i18n/request.ts).
- **`src/vendor/ui` carries no `"use client"` at all** — not one of its 45 component files. Several
  of them use hooks anyway, e.g. the hover state in
  [Button.tsx](../src/vendor/ui/primitives/Button.tsx) (`const [h, setH] = React.useState(false)`),
  [Modal.tsx](../src/vendor/ui/kit/Modal.tsx) and
  [CommandPalette.tsx](../src/vendor/ui/command-palette/CommandPalette.tsx). They work because
  every importer is already inside a client module. Importing `@devdigest/ui` from a Server
  Component is therefore not supported — mark the importing view `"use client"` first.
- **`useTranslations` everywhere, `getTranslations` nowhere.** Every translated component is a
  client component; the server-side variant is mentioned in the `request.ts` doc comment but is
  not used in the codebase.
- **No `loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx` or `route.ts` exists under
  `src/app`.** Loading, empty and error states are branches inside each client page (see
  [specs/pages.md](../specs/pages.md)); there are no Route Handlers, so the browser talks to the
  Fastify API directly.

The root layout wraps `<Providers>` in `<Suspense fallback={null}>` (`layout.tsx:29`), which is
what lets the client pages below it call `useSearchParams()`.

## The fetch client — `src/lib/api.ts`

[api.ts](../src/lib/api.ts) is 74 lines and has no dependencies. It exports three things:

- **`API_BASE`** — `process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001"` (`api.ts:5-6`).
  The value is inlined at build time by the `env` block in
  [next.config.mjs](../next.config.mjs), and documented in [.env.example](../.env.example).
- **`ApiError`** — an `Error` subclass carrying `status`, `code` and `details`, so callers can
  branch on the status (`api.ts:8-19`).
- **`apiFetch<T>` plus the `api.{get,post,put,patch,del}` sugar** (`api.ts:21-74`).

What `apiFetch` does, in order:

1. Sends `content-type: application/json` **only when a body is actually present**
   (`api.ts:30`) — a body-less POST otherwise trips Fastify's "Body cannot be empty when
   content-type is application/json".
2. Turns a thrown `fetch` (API down, DNS, CORS) into `ApiError(status 0, code
   "network_error")` with the message "Cannot reach the DevDigest engine at …"
   (`api.ts:34-42`). Status `0` is what the global toast rule keys off.
3. On `!res.ok`, tries to read `{ error: { code, message, details } }` from the body and falls
   back to `"<status> <statusText>"` when the body is not JSON (`api.ts:44-59`).
4. Returns `undefined` for `204`, otherwise `res.json()` **cast** to `T` (`api.ts:61-62`).

**There is no runtime validation at this boundary.** The Zod contracts in
[src/vendor/shared](../src/vendor/shared/index.ts) are used as TypeScript types only — every
`@devdigest/shared` import in `src/` outside the vendor folder itself is an `import type`, and
no client file calls `.parse()` or `.safeParse()`. A server response that drifts from the
contract fails at the point of use, not at the fetch.

Two small facts that save a search: `api.patch` is defined but no hook uses it, and no component
calls `api.*` directly — five files import `ApiError` alone, to turn a failure into a message
(e.g. [pulls/page.tsx](<../src/app/repos/[repoId]/pulls/page.tsx>)`:116`).

## The hook layer — `src/lib/hooks/*`

One file per domain, all re-exported from
[hooks/index.ts](../src/lib/hooks/index.ts); every file starts with `"use client"`. Components
import either the barrel (`@/lib/hooks`) or the domain file (`@/lib/hooks/reviews`) — both
resolve to the same modules.

| File | Covers |
|---|---|
| [core.ts](../src/lib/hooks/core.ts) | settings, secrets status, repos, pull requests, project context |
| [agents.ts](../src/lib/hooks/agents.ts) | agent CRUD + the provider model list |
| [reviews.ts](../src/lib/hooks/reviews.ts) | reviews, runs, findings, PR comments, the SSE stream |
| [trace.ts](../src/lib/hooks/trace.ts) | the single-document run trace |
| [repo-intel.ts](../src/lib/hooks/repo-intel.ts) | repo-intel index state + resync |

### Queries

| Hook | Query key | Request | Non-default options |
|---|---|---|---|
| `useSettings` | `["settings"]` | `GET /settings` | — |
| `useSecretsStatus` | `["secrets-status"]` | `GET /settings/secrets-status` | `staleTime: 30_000` |
| `useRepos` | `["repos"]` | `GET /repos` | — |
| `usePulls(repoId)` | `["pulls", repoId]` | `GET /repos/:repoId/pulls` | `enabled: !!repoId`, `refetchInterval: 60_000`, `refetchOnWindowFocus: true` |
| `usePullDetail(prId)` | `["pull", prId]` | `GET /pulls/:prId` | `enabled: prId != null` |
| `useContextFiles(repoId)` | `["context", repoId]` | `GET /repos/:repoId/context` | `enabled: !!repoId` |
| `useAgents` | `["agents"]` | `GET /agents` | — |
| `useAgent(id)` | `["agent", id]` | `GET /agents/:id` | `enabled: !!id` |
| `useProviderModels(provider)` | `["provider-models", provider]` | `GET /providers/:provider/models` | `enabled: !!provider`, `staleTime: 5 * 60_000` |
| `usePrActiveRuns(prId)` | `["pr-active-runs", prId]` | `GET /pulls/:prId/runs/active` | polls every `4000` ms while the array is non-empty |
| `usePrRuns(prId)` | `["pr-runs", prId]` | `GET /pulls/:prId/runs` | polls every `4000` ms while any run is `running` |
| `usePrReviews(prId)` | `["reviews", prId]` | `GET /pulls/:prId/reviews` | `enabled: !!prId` |
| `usePrComments(prId)` | `["pr-comments", prId]` | `GET /pulls/:prId/comments` | `enabled: !!prId` |
| `useRunTrace(runId, enabled)` | `["run-trace", runId]` | `GET /runs/:runId/trace` | `retry: false` |
| `useRepoIntelStatus(repoId, poll)` | `["repo-intel-state", repoId]` | `GET /repos/:repoId/index-state` | `refetchInterval: 1500` while `poll` |

The two polling hooks are the mechanism behind live review state: in-flight runs are read from
the server (`agent_runs` with `status='running'`) rather than held in React state, so a run
survives navigation and reload and the poll self-cancels when the array empties
(`reviews.ts:26-48`).

### Mutations and what they invalidate

| Hook | Request | Cache effect |
|---|---|---|
| `useUpdateSettings` | `PUT /settings` | `setQueryData(["settings"], data)` — writes the response straight in, no refetch |
| `useTestConnection` | `POST /settings/test-connection` | on `ok`, invalidates `["provider-models"]` and `["secrets-status"]` |
| `useAddRepo` | `POST /repos` | invalidates `["repos"]` |
| `useRefreshRepo` | `POST /repos/:repoId/refresh` | invalidates `["repos"]` and `["pulls", repoId]` |
| `useDeleteRepo` | `DELETE /repos/:repoId` | invalidates `["repos"]` |
| `useReindexContext` | `POST /repos/:repoId/context/reindex` | invalidates `["context", repoId]` |
| `useCreateAgent` | `POST /agents` | invalidates `["agents"]` |
| `useUpdateAgent` | `PUT /agents/:id` | invalidates `["agents"]`, `setQueryData(["agent", id], data)` |
| `useDeleteAgent` | `DELETE /agents/:id` | invalidates `["agents"]`, `removeQueries(["agent", id])` |
| `useRunReview` | `POST /pulls/:prId/review` | invalidates `["reviews", prId]` |
| `useCancelRun` | `POST /runs/:runId/cancel` | none — the polls pick the change up |
| `useDeleteRun` | `DELETE /runs/:runId` | invalidates `["pr-runs", prId]` **and** `["reviews", prId]` (deleting a run deletes the review it produced) |
| `useDeleteReview` | `DELETE /reviews/:reviewId` | invalidates `["reviews", prId]` |
| `useFindingAction` | `POST /findings/:findingId/:action` | invalidates `["reviews", prId]` when a `prId` was passed |
| `useCreatePrComment` | `POST /pulls/:prId/comments` | invalidates `["pr-comments", prId]` |
| `useResyncRepoIntel` | `POST /repos/:repoId/resync` | invalidates `["repo-intel-state", repoId]` |

`:action` in `useFindingAction` is a `FindingActionKind` —
[contracts/findings.ts](../src/vendor/shared/contracts/findings.ts)`:82` defines
`accept | dismiss | learn | reply`; the findings UI sends `accept` and `dismiss`.

The PR detail page invalidates two keys by hand rather than through a mutation, because the
trigger is an SSE stream finishing rather than a request:
`qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] })` and the same for `["pr-runs",
prId]` (`pulls/[number]/page.tsx:51-58`).

`useContextFiles`, `useReindexContext`, `useRepoIntelStatus` and `useResyncRepoIntel` are
defined but no route consumes them today; the two `context` paths also have no counterpart in
`server/src/modules`.

### The one subscription: `useRunEvents`

[reviews.ts](../src/lib/hooks/reviews.ts)`:168-216` is the only data hook that does not use
React Query. It opens one `EventSource` per run id against
`${API_BASE}/runs/${runId}/events`, accumulates `RunEvent`s into local state, and reports a
`running` flag that stays true until every stream closes:

- it listens on `onmessage` *and* on the named events `info`, `tool`, `result`, `error`, because
  the server tags events with `kind` as the SSE event name;
- non-JSON frames (keepalives) are swallowed;
- an `error` event with a message is pushed to the toast bridge via `notify.error`, since a
  runtime agent failure never surfaces as a query or mutation error;
- `onerror` closes that source and decrements the open count; the effect cleanup closes all of
  them.

Two components consume it: [RunStatus](<../src/app/repos/[repoId]/pulls/[number]/_components/RunStatus/RunStatus.tsx>)
(the live log under a running review) and
[RunTraceDrawer](<../src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx>)
(the Live-log tab, which falls back to the persisted log from `useRunTrace` for historical runs).

## Where the QueryClient lives

The client is created in [src/lib/providers.tsx](../src/lib/providers.tsx) inside
`React.useState(() => new QueryClient({...}))`, so it is constructed once per mount and never on
a re-render. `Providers` is mounted by the root layout, inside `NextIntlClientProvider` and the
`Suspense` boundary; the nesting is `QueryClientProvider → ThemeProvider → ToastProvider →
RepoProvider → children` (`providers.tsx:46-54`).

Defaults: `retry: 1`, `staleTime: 30_000`, `refetchOnWindowFocus: false` — the per-hook options
in the table above are deliberate overrides of these.

Error surfacing is centralized on the two caches:

- `QueryCache.onError` toasts **only** when the status is `0` (unreachable API) or `>= 500`, so
  an expected 4xx can still render as an inline empty state;
- `MutationCache.onError` always toasts, because a mutation is a user action.

The toast itself comes from [src/lib/toast.tsx](../src/lib/toast.tsx), which keeps a
module-level `notify` bridge so non-React code — the query cache, the SSE handler — can raise
one without a hook.

`RepoProvider` ([src/lib/repo-context.tsx](../src/lib/repo-context.tsx)) resolves the active
repo with the precedence *`:repoId` in the path → `localStorage["dd-repo"]` → first repo from
`useRepos()`*, and exports `useRepoNotFound(repoId)`, which is true only once the repo list has
loaded and does not contain the id — the signal repo-scoped pages use to show a friendly empty
state instead of an error.

## Tokens and theming

"Token" in this package means a **design token: a CSS custom property**. All of them live in
[src/vendor/ui/styles.css](../src/vendor/ui/styles.css), which
[app/globals.css](../src/app/globals.css) imports (and adds only the `Inter` `@font-face` and
the toast keyframe to).

Three token groups:

| Group | Where | Examples |
|---|---|---|
| Color / surface / shadow | `styles.css:9-47` (`:root, [data-theme="dark"]`) and `styles.css:49-86` (`[data-theme="light"]`) | `--bg-primary`, `--border`, `--accent`, `--crit` / `--crit-bg`, `--warn`, `--sugg`, `--info`, `--ok`, `--code-add` |
| Tailwind bridge | `styles.css:88-115` (`@theme inline`) | `--color-accent: var(--accent)` — exposes the same values as Tailwind 4 utilities |
| Density | `styles.css:150-163` | `--row-pad`, `--card-pad`, `--gap`, switched by `data-density="compact\|regular\|comfy"` |

**Who sets the attributes.** [app/layout.tsx](../src/app/layout.tsx)`:18` renders
`<html data-theme="dark" data-density="regular" suppressHydrationWarning>` as the SSR default.
Before first paint, the inline script `themeNoFlashScript`
([src/lib/theme.tsx](../src/lib/theme.tsx)`:44`) reads `localStorage["dd-theme"]` and rewrites
both attributes, which is why `suppressHydrationWarning` is on `<html>`. After hydration,
`ThemeProvider` reads the attribute back into state (`theme.tsx:17-20`) and `set()` writes both
`document.documentElement` and `localStorage` (`theme.tsx:22-30`). The only trigger today is
`toggle()`, reached from the topbar and from the "Switch to light/dark theme" command in
[useShellCommands.ts](../src/components/app-shell/hooks/useShellCommands.ts). `data-density` is
never changed after the script sets it.

**The rule: colors come only from vars.** Components use inline styles that reference the
variables (`color: "var(--text-muted)"`), never a hex literal — the one indirection allowed is
the semantic map in
[primitives/tokens.ts](../src/vendor/ui/primitives/tokens.ts)`:6-14`, where `SEV[severity]`
resolves to `{ c: "var(--crit)", bg: "var(--crit-bg)", icon, label }` and `CAT[category]` to
`{ icon, label }`. Note that `SEV` carries a fourth severity, `INFO`, that the wire contract
never emits. A light/dark pair is therefore never written twice: switching `data-theme` swaps
the variable, and everything downstream follows.

The showcase gallery ([src/components/showcase](../src/components/showcase/Showcase.tsx)) is
rendered in both themes by [src/test/smoke.test.tsx](../src/test/smoke.test.tsx), which is how a
broken export or a hard-coded color gets caught. It is mounted by the test only — there is no
`/showcase` route.

## i18n wiring

Single locale `en`, no locale routing, no `[locale]` segment.

- [next.config.mjs](../next.config.mjs) wraps the config in
  `createNextIntlPlugin("./src/i18n/request.ts")`.
- [src/i18n/request.ts](../src/i18n/request.ts) exports `LOCALE = "en"` and `loadMessages()`,
  which **reads every `*.json` in `messages/<locale>/` and merges them into `{ [ns]: … }`**,
  keyed by the file name (`request.ts:16-25`). Adding
  [messages/en/prReview.json](../messages/en/prReview.json) is the entire registration step —
  no import, no index, no shared file to edit, so two feature branches never collide here. The
  loader merges every file it finds, used or not: `messages/en/` currently holds 18 namespaces,
  several of which (e.g. `onboarding.json`, `memory.json`) no component reads today.
- [app/layout.tsx](../src/app/layout.tsx)`:14-16, 28` awaits `getLocale()` / `getMessages()` and
  passes both into `<NextIntlClientProvider>`.

A component consumes one namespace: `const t = useTranslations("prReview")`, then `t("list.title")`
or `t("list.summary", { open, needsReview })` for an interpolated string — see
[pulls/page.tsx](<../src/app/repos/[repoId]/pulls/page.tsx>)`:28, 76-81`. Keys are camelCase
dot-paths inside the namespace file. Which route uses which namespace is listed in
[specs/pages.md](../specs/pages.md).

Two deviations that exist in the code: the severity words rendered by the findings UI come from
`SEV[...].label` in the UI tokens and are not translated, and a handful of files still hold
literal English (`app/page.tsx`, `app/onboarding/_components/AddRepoView/AddRepoView.tsx` and
the chrome of `app/agents/[id]/page.tsx` have no `useTranslations` call at all).

## Auth tokens: there are none

The client has no authentication layer: `apiFetch` sends no `Authorization` header, no cookie or
bearer token is read or written anywhere in `src/`, and there is no sign-in route — DevDigest is
local-first and the Fastify API is unauthenticated on `localhost:3001`.

Provider **API keys** are the only secret the UI touches, and it never holds one:
[SettingsApiKeys.tsx](<../src/app/settings/[section]/_components/SettingsView/_components/SettingsApiKeys/SettingsApiKeys.tsx>)
keeps the typed value in local component state, sends it in the body of
`POST /settings/test-connection`, and reads back only booleans from
`GET /settings/secrets-status` to render the "Configured / Not set" badge. The two keys the
client does persist in `localStorage` are `dd-theme` and `dd-repo`.
