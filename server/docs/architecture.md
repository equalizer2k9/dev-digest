# Server Architecture

**Package:** server · **Date:** 2026-09-20

How an HTTP request becomes a database write in `@devdigest/api`: the composition root, the DI
container, the adapter layer, the route → service → repository → Drizzle path, what is (and is
not) transactional, and where config and secrets come from.

Everything here is anchored to code that exists today. The API surface itself is listed in
[README.md](../README.md); this doc is the layer map behind it.

## 1. Boot sequence — the composition root

There is exactly one composition root: `buildApp()` in [app.ts](../src/app.ts) (`src/app.ts:41`).
`src/server.ts` only loads config, calls `buildApp`, installs SIGTERM/SIGINT handlers and listens
(`src/server.ts:5-35`). Tests call `buildApp` directly and use `app.inject()` — no port is bound.

Order inside `buildApp`, which matters:

| # | Step | Where |
|---|---|---|
| 1 | `loadConfig()` unless a config was injected | `src/app.ts:42` |
| 2 | `createDb(config.databaseUrl)` unless a `db` was injected | `src/app.ts:43-44` |
| 3 | Fastify instance: `bodyLimit` 1 MiB, pino logger (`false` when `logLevel === 'silent'`) | `src/app.ts:46-60` |
| 4 | Zod validator + serializer compilers | `src/app.ts:64-65` |
| 5 | `new Container(config, db, opts.overrides)` → `app.decorate('container', …)` | `src/app.ts:67-68` |
| 6 | `new ReviewService(container).reapStaleRuns()`, **awaited**, failure is logged and swallowed | `src/app.ts:80-85` |
| 7 | Plugins: `helmet`, `cors` (origin `config.webOrigin`, credentials), `fastify-sse-v2` | `src/app.ts:89-91` |
| 8 | `@fastify/rate-limit` 120/min — **skipped entirely when `NODE_ENV=test`** | `src/app.ts:95-97` |
| 9 | `/health` and `/health/ready` (both `rateLimit: false`) | `src/app.ts:100-112` |
| 10 | `app.setErrorHandler(…)` | `src/app.ts:116-164` |
| 11 | Feature modules, registered from the static registry | `src/app.ts:168-170` |
| 12 | `onClose` hook closing the pg handle — only when `buildApp` created it | `src/app.ts:173` |

Steps 7–10 run **before** step 11 on purpose: each module is an encapsulated Fastify plugin, so it
inherits the plugins and the error handler registered above it, and nothing a module registers
leaks back out.

Step 6 is the only DB write that happens before the server accepts traffic: every `agent_runs` row
still in `running` belongs to a dead process, so it is flipped to `failed`
([run.repo.ts](../src/modules/reviews/repository/run.repo.ts) `reapStaleRunningRuns`,
`src/modules/reviews/repository/run.repo.ts:105-112`). The comment at `src/app.ts:78` states the
assumption this rests on: a single API instance per database.

## 2. The DI container

[platform/container.ts](../src/platform/container.ts) is the only place that constructs adapters.
One `Container` per app instance (`src/app.ts:67`).

**Eagerly constructed in the constructor** (`src/platform/container.ts:80-87`):

| Field | Value | Override key |
|---|---|---|
| `config` | the `AppConfig` passed in | — |
| `db` | the Drizzle handle passed in | — |
| `secrets` | `new LocalSecretsProvider(config.secretsPath)` | `secrets` |
| `auth` | `new LocalNoAuthProvider(db)` | `auth` |
| `runBus` | the **module-level singleton** `runBus` from `platform/sse.ts` | — |
| `jobs` | `new JobRunner(db)` | — |

`runBus` is worth calling out: `src/platform/sse.ts:103` exports a single `RunBus` instance and
`src/platform/container.ts:85` assigns that same object to every container, so two apps built in
one process share run buffers and cancellation state.

**Lazily constructed getters**, each memoised in a private field and each short-circuited by an
override:

| Member | Real implementation | Override key | Notes |
|---|---|---|---|
| `git` | `SimpleGitClient(config.cloneDir)` — `src/platform/container.ts:89-93` | `git` | |
| `codeIndex` | `RipgrepCodeIndex(this.git)` — `:103-107` | `codeIndex` | built on top of `git` |
| `repoIntel` | `RepoIntelService(this)` — `:114-118` | `repoIntel` | takes the whole container |
| `depgraph` | `DepCruiseGraph()` — `:121-125` | `depgraph` | repo-intel pipeline only |
| `tokenizer` | `TiktokenTokenizer()` — `:128-132` | `tokenizer` | repo-map budget search only |
| `priceBook` | `PriceBook(loader, estimateCost)` — `:140-151` | — | loader returns `[]` on any failure |
| `agentsRepo` | `AgentsRepository(this.db)` — `:95-97` | — | shared repository, not an adapter |
| `reviewRepo` | `ReviewRepository(this.db)` — `:99-101` | — | shared repository, not an adapter |
| `github()` | `OctokitGitHubClient(token)` — `:153-160` | `github` | **async**; throws `ConfigError` without `GITHUB_TOKEN` |
| `llm(id)` | per-provider, cached in `llmCache` — `:163-193` | `llm[id]` | **async**; throws `ConfigError` without the key |
| `embedder()` | `OpenAIEmbedder(await this.llm('openai'))` — `:195-208` | `embedder` | **async** |

Two members are async because they need a secret before they can be constructed. `llm(id)` resolves
`openai` → `OpenAIProvider`, `anthropic` → `AnthropicProvider`, `openrouter` →
`OpenRouterProvider` **from `@devdigest/reviewer-core`** with the `PriceBook` injected as its cost
estimator (`src/platform/container.ts:179-189`) — the server does not own an OpenRouter adapter.

`embedder()` throws `ConfigError` *before* constructing any OpenAI client when
`config.embeddingsEnabled` is false (`src/platform/container.ts:201-203`), which is what makes
"embeddings off ⇒ zero OpenAI requests" true rather than aspirational.

`invalidateSecretCaches()` (`src/platform/container.ts:214-218`) clears `llmCache`, `_github` and
`_embedder` — it does **not** clear `_git`, `_codeIndex` or `_repoIntel`, which need no secrets.
Its one caller is the settings route after persisting a BYO key
(`src/modules/settings/routes.ts:83-84`).

### How a module gets the container

`app.decorate('container', container)` plus the module augmentation at `src/app.ts:22-26` puts
`container` on `FastifyInstance`. A module plugin reads it off the instance at registration time:

```ts
const app = appBase.withTypeProvider<ZodTypeProvider>();
const { container } = app;          // src/modules/reviews/routes.ts:20-21
const service = new ReviewService(container);
```

Services take the container itself, not individual adapters — `ReviewService`
(`src/modules/reviews/service.ts:33-37`), `RepoIntelService`
(`src/modules/repo-intel/service.ts:101-105`), `ReviewRunExecutor`
(`src/modules/reviews/run-executor.ts:44-48`). They resolve adapters at the point of use, which is
why a missing API key surfaces as a failed *run* rather than a failed boot.

### How mocks swap in

`ContainerOverrides` (`src/platform/container.ts:40-54`) is the single seam. `buildApp` forwards
`opts.overrides` straight into the container (`src/app.ts:67`), so a test builds a real app — real
routes, real services, real repositories, real Postgres — with fake edges:

```ts
// test/reviews.it.test.ts:118-128
buildApp({
  config: config(),
  db: pg.handle.db,
  overrides: {
    embedder: new MockEmbedder(),
    git: new MockGitClient({ diff: DIFF }),
    llm: { openai: new MockLLMProvider('openai', { structured, ...llmOpts }) },
  },
});
```

The mock classes live in [adapters/mocks.ts](../src/adapters/mocks.ts): `MockLLMProvider`,
`MockEmbedder`, `MockGitHubClient`, `MockGitClient`, `MockCodeIndex`, `MockAuthProvider`,
`MockSecretsProvider`. `MockLLMProvider.completeStructured` validates the caller-supplied fixture
against the request's Zod schema and throws if it does not fit
(`src/adapters/mocks.ts:94-110`) — a fixture can never drift from the contract silently. Its
`costUsd` defaults to `0.001` and accepts an explicit `null` to simulate an unpriced model
(`src/adapters/mocks.ts:56-60`).

There is no mock for `repoIntel`, `depgraph` or `tokenizer` in `mocks.ts`; those override slots
exist and tests supply inline objects instead.

**Real vs mock is never decided by an environment variable.** The only selector is whether an
override was passed. Production and `pnpm dev` pass none and get the real adapters; the one
env-driven behaviour change in adapter land is `EMBEDDINGS_ENABLED` gating `embedder()`.

## 3. The adapter layer

Port interfaces live in [vendor/shared/adapters.ts](../src/vendor/shared/adapters.ts) (the
`@devdigest/shared` alias). Implementations live in `src/adapters/<port>/`. Services depend on the
interface only.

| Port | Interface | Real implementation | Mock | Reached via |
|---|---|---|---|---|
| LLM | `LLMProvider` — `src/vendor/shared/adapters.ts:82-88` | [llm/openai.ts](../src/adapters/llm/openai.ts) · [llm/anthropic.ts](../src/adapters/llm/anthropic.ts) · `OpenRouterProvider` from reviewer-core | `MockLLMProvider` | `await container.llm(id)` |
| Embedder | `Embedder` — `:91-95` | [embedder/openai.ts](../src/adapters/embedder/openai.ts) | `MockEmbedder` | `await container.embedder()` |
| GitHub | `GitHubClient` — `:143-167` | [github/octokit.ts](../src/adapters/github/octokit.ts) | `MockGitHubClient` | `await container.github()` |
| Git | `GitClient` — `:205-228` | [git/simple-git.ts](../src/adapters/git/simple-git.ts) | `MockGitClient` | `container.git` |
| CodeIndex | `CodeIndex` — `:250-254` | [codeindex/ripgrep.ts](../src/adapters/codeindex/ripgrep.ts) | `MockCodeIndex` | `container.codeIndex` |
| Auth | `AuthProvider` — `:268-271` | [auth/local.ts](../src/adapters/auth/local.ts) | `MockAuthProvider` | `container.auth` |
| Secrets | `SecretsProvider` — `:281-288` | [secrets/local.ts](../src/adapters/secrets/local.ts) | `MockSecretsProvider` | `container.secrets` |
| Tokenizer | `Tokenizer` — [tokenizer/index.ts](../src/adapters/tokenizer/index.ts):16-18 | `TiktokenTokenizer` (same file) | — | `container.tokenizer` |
| DepGraph | `DepGraph` — [depgraph/index.ts](../src/adapters/depgraph/index.ts):28-34 | `DepCruiseGraph` (same file) | — | `container.depgraph` |

`Tokenizer` and `DepGraph` are the two ports whose interface is declared next to its implementation
rather than in `vendor/shared` — they are internal to the repo-intel pipeline and never cross a
package boundary.

**ast-grep is not a container port.** [adapters/astgrep/index.ts](../src/adapters/astgrep/index.ts)
exports plain functions (`parseSymbols`, `parseReferences`, `parseImports`,
`parseInvocationHeads`, `langForFile`) that repo-intel imports directly
(`src/modules/repo-intel/service.ts:23-29`, `pipeline/full.ts:29`, `pipeline/incremental.ts:22`).
There is no `container.astgrep` and no mock; tests exercise it through `test/astgrep.test.ts`.

Adapter-level behaviour worth knowing:

- **Resilience is per-adapter, not global.** `withRetry` / `withTimeout` from
  [platform/resilience.ts](../src/platform/resilience.ts) wrap the OpenAI, Anthropic and Octokit
  calls (`src/adapters/llm/openai.ts:10`, `src/adapters/llm/anthropic.ts:11`,
  `src/adapters/github/octokit.ts:15`) and the repo-intel pipelines. External failures surface as
  `ExternalServiceError` (502).
- **Structured output is shared between the two first-party LLM adapters.** Both import
  `toJsonSchema` + `parseWithRepair` from [platform/structured.ts](../src/platform/structured.ts).
- **Cost.** `estimateCost` ([llm/pricing.ts](../src/adapters/llm/pricing.ts)) is a static per-model
  USD/1M table returning `null` for an unknown model; [platform/price-book.ts](../src/platform/price-book.ts)
  layers live OpenRouter pricing over it and is only wired into the OpenRouter provider
  (`src/platform/container.ts:185-188`).
- **`LocalSecretsProvider` is the only code that reads `process.env` for a key**
  (`src/adapters/secrets/local.ts:37-42`): stored file value wins, then env, with `GITHUB_PAT` as a
  fallback for `GITHUB_TOKEN`. `set()` writes `~/.devdigest/secrets.json` at mode `0600`.
- **`LocalNoAuthProvider` resolves the seeded system user + default workspace from the DB** and
  caches them (`src/adapters/auth/local.ts:20-37`); it throws if the DB was never seeded.

## 4. How a request flows

```
HTTP → helmet/cors/rate-limit/SSE → module plugin → routes.ts (zod params/body)
     → service.ts → repository.ts → repository/<entity>.repo.ts → Drizzle → Postgres
```

**Registration.** No autoload. [modules/index.ts](../src/modules/index.ts) exports a
`Record<string, FastifyPluginAsync>` with eight entries — `settings`, `repos`, `pulls`, `polling`,
`workspace`, `agents`, `reviews`, `repoIntel` — and `src/app.ts:168-170` registers them in that
object's order. Adding a module is one import plus one entry
(`src/modules/index.ts:15-18` explains why: native dynamic `import()` of `.ts` is not portable
across tsx, the bundler and vitest).

Two modules also register background job handlers at plugin-load time, which is the only work that
happens outside a request: `RepoService.registerCloneJobHandler()`
(`src/modules/repos/routes.ts:24`) and `RepoIntelService.registerIndexJobHandlers()`
(`src/modules/repo-intel/routes.ts:29-30`).

**Validation.** Every module opts into the Zod type provider with
`appBase.withTypeProvider<ZodTypeProvider>()` and declares schemas on the route:
`schema: { params: IdParams }` and, where there is a body, `schema: { body: SomeContract }`.
[`IdParams`](../src/modules/_shared/schemas.ts) is `z.object({ id: z.string().uuid() })`, so a
malformed id is a 422 at the edge instead of a Postgres error deeper in. Bodies come from the Zod
contracts in `src/vendor/shared/contracts/` (e.g. `RepoInput` at `src/modules/repos/routes.ts:26`,
`SettingsUpdate` at `src/modules/settings/routes.ts:49`, `PrCommentInput` at
`src/modules/pulls/routes.ts:317-319`).

Response serialization compilers are installed (`src/app.ts:65`) but no route in the starter
declares a `response` schema, so responses are not schema-filtered today; the error handler still
carries the `isResponseSerializationError` branch for when one does.

**Tenancy.** The first line of almost every handler is
`const { workspaceId } = await getContext(container, req)`
([modules/_shared/context.ts](../src/modules/_shared/context.ts):14-23), which resolves user +
workspace through `container.auth`. Repositories then take `workspaceId` as an explicit argument —
there is no ambient tenancy.

**Errors.** The single handler at `src/app.ts:116-164` maps:

| Condition | Status | Body |
|---|---|---|
| `hasZodFastifySchemaValidationErrors` (route schema) | 422 | `validation_error` + `err.validation` |
| `isResponseSerializationError` | 500 | `internal_error`, real error only in the log |
| `ZodError` by `instanceof` **or** by shape | 422 | `validation_error` + issues |
| `AppError` (and its subclasses) | `err.statusCode` | `err.code` / message / details |
| anything else | `err.statusCode ?? 500` | `internal_error` |

The shape-based `ZodError` check (`src/app.ts:138-142`) exists because `instanceof` fails across
duplicate zod module instances — the server and `vendor/shared` can resolve different copies. The
taxonomy itself is [platform/errors.ts](../src/platform/errors.ts): `AppError` (400 default),
`NotFoundError` (404), `ValidationError` (422), `ExternalServiceError` (502), `ConfigError` (500).

### Worked example — `GET /pulls/:id/reviews`

| Layer | File:line | What happens |
|---|---|---|
| route | `src/modules/reviews/routes.ts:129-132` | `schema: { params: IdParams }` validates the uuid; `getContext` resolves `workspaceId`; delegates |
| service | `src/modules/reviews/service.ts:160-174` | `repo.getPull(workspaceId, prId)` → `NotFoundError` if the PR is not in this workspace; fetches rows; resolves agent names via `container.agentsRepo`; maps each row with `reviewToDto` |
| repository facade | `src/modules/reviews/repository.ts:65-67` | forwards to the entity repo — the facade holds no SQL |
| entity repo | `src/modules/reviews/repository/review.repo.ts:65-89` | `select({ review, run }).from(reviews).leftJoin(agentRuns, …).orderBy(desc(reviews.createdAt))`, then one `inArray` query for findings; returns `{ review, findings, usage }` |
| DTO | `src/modules/reviews/helpers.ts:59-82` | row shape → wire shape (`cost_usd`, `tokens_in`, `tokens_out`, ISO timestamps) |

The `leftJoin` is deliberate: `reviews.run_id` carries no FK (`src/db/schema/reviews.ts:19`), so a
review whose run was deleted must still come back with null usage rather than vanish
(`src/modules/reviews/repository/review.repo.ts:69-70`).

The write path — `POST /pulls/:id/review` — is documented as a behaviour contract in
[specs/review-flow.md](../specs/review-flow.md).

### Module map

| Module | Plugin | Routes |
|---|---|---|
| settings | `src/modules/settings/routes.ts` | `GET/PUT /settings`, `GET /settings/secrets-status`, `POST /settings/test-connection` |
| repos | `src/modules/repos/routes.ts` | `POST /repos`, `GET /repos`, `POST /repos/:id/refresh`, `DELETE /repos/:id` |
| pulls | `src/modules/pulls/routes.ts` | `GET /repos/:id/pulls`, `GET /pulls/:id`, `GET/POST /pulls/:id/comments` |
| polling | `src/modules/polling/routes.ts` | `POST /repos/:id/poll` |
| workspace | `src/modules/workspace/routes.ts` | `GET /workspace` |
| agents | `src/modules/agents/routes.ts` | `GET/POST /agents`, `GET/PUT/DELETE /agents/:id`, `/agents/:id/versions`, `/agents/:id/skills`, `/agents/:id/models`, `GET /providers/:id/models` |
| reviews | `src/modules/reviews/routes.ts` | `POST /pulls/:id/review`, `GET /runs/:id/events`, `GET /runs/:id/trace`, `GET /pulls/:id/runs`, `GET /pulls/:id/runs/active`, `POST /runs/:id/cancel`, `DELETE /runs/:id`, `GET /pulls/:id/reviews`, `DELETE /reviews/:id`, `POST /findings/:id/accept|dismiss` |
| repoIntel | `src/modules/repo-intel/routes.ts` | `GET /repos/:id/index-state`, `POST /repos/:id/resync` |

Rate-limit overrides are declared on the route itself: `POST /pulls/:id/review` 10/min
(`src/modules/reviews/routes.ts:29`), `POST /settings/test-connection` 20/min
(`src/modules/settings/routes.ts:72`), `GET /runs/:id/events` exempt
(`src/modules/reviews/routes.ts:50`).

## 5. Data access

Three shapes exist, all built on the same `Db` type from [db/client.ts](../src/db/client.ts)
(`drizzle(postgres(url, { max: 10 }), { schema })`):

1. **Facade + entity repos** — the reviews module. [repository.ts](../src/modules/reviews/repository.ts)
   is a class of one-line delegations; the SQL lives in
   `repository/{review,run,pull}.repo.ts` as free functions taking `db` first. The facade exists so
   its public API stays stable while queries are split by aggregate
   (`src/modules/reviews/repository.ts:10-14`).
2. **Plain repository class** — `AgentsRepository` (`src/modules/agents/repository.ts`),
   `RepoIntelRepository` (`src/modules/repo-intel/repository.ts`), both holding their own SQL.
3. **Query in the route** — `settings`, `polling`, `workspace` and parts of `pulls` query
   `container.db` directly (e.g. `src/modules/settings/routes.ts:30-34`). No repository layer.

Cross-module entity access goes through the container, not through another module's folder:
`container.agentsRepo` and `container.reviewRepo` are constructed in the composition root exactly
for that (`src/platform/container.ts:70-72`).

Row types shared across modules are inferred once in [db/rows.ts](../src/db/rows.ts) so a consumer
never has to import another module's data layer. The schema is one file per domain under
`src/db/schema/`, re-exported by the [schema.ts](../src/db/schema.ts) barrel, which also assembles
the `schema` object used for Drizzle client typing (`src/db/schema.ts:50-92`).

### Transaction boundaries

**There are none.** `db.transaction(` does not appear anywhere under `server/src` — every write is
a standalone statement in its own implicit transaction. The consequences are concrete, not
theoretical:

| Multi-statement sequence | Statements | If the process dies midway |
|---|---|---|
| Review completion — `src/modules/reviews/run-executor.ts:219-290` | `insertReview` → `insertFindings` → `markReviewed` → `completeAgentRun` → `saveRunTrace` | a review can exist without findings, or with findings but with its run still `running` (until the next boot reaps it to `failed`) |
| `deleteAgentRun` — `src/modules/reviews/repository/run.repo.ts:78-91` | `delete reviews where run_id = …` → `delete agent_runs where id = …` | the review is gone but the run row survives |
| `PUT /settings` — `src/modules/settings/routes.ts:52-60` | one upsert per key in a loop | a partial settings update |
| Job bookkeeping — `src/platform/jobs.ts:53-95` | insert `jobs` row → handler → status/attempt updates | a job row stuck in `running` |

Atomicity that *is* guaranteed comes from Postgres itself, not from application transactions:

- **Batch inserts are single statements.** `insertFindings` inserts every finding of a review in
  one `INSERT … VALUES (…), (…)` (`src/modules/reviews/repository/review.repo.ts:42-61`) — all or
  nothing, and it returns early for an empty array.
- **`ON CONFLICT DO UPDATE` replaces read-modify-write.** `run_traces`
  (`run.repo.ts:179-184`), `pr_intent` (`pull.repo.ts:49-62`), `settings`, `agents`, `pulls`,
  `polling` and two repo-intel caches all upsert instead of check-then-insert.
- **Conditional updates carry their guard in the `WHERE`.** `cancelRunIfRunning` only matches
  `status = 'running'` (`run.repo.ts:94-101`), so a cancel racing a completion is a no-op rather
  than a lost update.
- **Cascades are declared in the schema.** `findings` cascade from `reviews`
  (`src/db/schema/reviews.ts:30-32`) and `run_traces` cascades from `agent_runs`
  (`src/db/schema/runs.ts:36-40`), so those deletes need no application-side cleanup.

## 6. Config and secrets

[platform/config.ts](../src/platform/config.ts) is loaded once at startup and validated with Zod
(`EnvSchema`, `src/platform/config.ts:15-39`). It reads `.env` via `import 'dotenv/config'` at
`src/platform/config.ts:1`.

Variables the schema actually knows: `DATABASE_URL`, `EMBEDDINGS_ENABLED`, `REPO_INTEL_ENABLED`,
`API_PORT`, `WEB_PORT`, `DEVDIGEST_CLONE_DIR`, `NODE_ENV`, `LOG_LEVEL`. Nothing else reaches
`AppConfig`.

Derivations in `loadConfig` (`src/platform/config.ts:64-81`):

- `cloneDir` = `DEVDIGEST_CLONE_DIR` or `~/.devdigest/workspace`, resolved against `process.cwd()`
  when relative.
- `secretsPath` = `~/.devdigest/secrets.json`, always — not configurable.
- `webOrigin` = `http://localhost:${WEB_PORT}`, which is the only allowed CORS origin.
- `logLevel` = `LOG_LEVEL`, else `silent` under `NODE_ENV=test`, else `info`. Empty string is
  coerced to undefined first (`:35-38`), because the shipped `.env` has `LOG_LEVEL=`.
- `embeddingsEnabled` = `EMBEDDINGS_ENABLED === 'true'` (opt-in).
- `repoIntelEnabled` = `REPO_INTEL_ENABLED !== 'false'` (opt-out).

**Secrets are deliberately absent from the schema** (`src/platform/config.ts:9-13`). API keys and
`GITHUB_TOKEN` are reached only through `container.secrets`, whose single implementation reads
`~/.devdigest/secrets.json` first and `process.env` second
(`src/adapters/secrets/local.ts:37-42`). Consequences in code:

- The app boots with no keys at all; a missing key becomes a `ConfigError` at the moment an adapter
  is resolved (`src/platform/container.ts:157`, `:176`, `:184`, `:191`).
- Keys can be set at runtime through `POST /settings/test-connection`, which persists via
  `secrets.set` and then calls `container.invalidateSecretCaches()`
  (`src/modules/settings/routes.ts:79-85`).
- `GET /settings/secrets-status` returns booleans only, never values
  (`src/modules/settings/routes.ts:39-47`).

## 7. Background work

Two independent mechanisms, and they are not interchangeable:

**`JobRunner`** ([platform/jobs.ts](../src/platform/jobs.ts)) — a `p-queue` with concurrency 3, a
120 s timeout and 2 retries (`src/platform/jobs.ts:40-42`), mirrored into the `jobs` table with
status/attempts/error. Handlers are registered by kind at plugin load; `enqueue` inserts the row
and schedules the handler, returning `{ id, done }`. Used for repo clone (`repos/service.ts:46`),
repo indexing, refresh and resync (`repo-intel/service.ts:173-180`).

**Fire-and-forget promises** — review execution. `ReviewService.runReview` creates the
`agent_runs` rows, then calls `void this.executor.executeRuns(...).catch(...)` and returns
immediately (`src/modules/reviews/service.ts:131-137`). It does **not** go through `JobRunner`:
there is no `jobs` row, no timeout, no retry, and no queue limit on concurrent reviews. Progress is
observable only through the `RunBus` (SSE) and the `agent_runs` row.

## 8. Files that look live but are not

Three platform modules have no importer anywhere in `server/`, `e2e/` or `reviewer-core/`:
`src/platform/model-router.ts`, `src/platform/prompts.ts`, `src/platform/trace-builder.ts`.

Two more are imported **only by tests**: `src/platform/prompt.ts`
(`test/adapters.test.ts:10`, `test/prompt-structured.test.ts:3`) and
`src/platform/grounding.ts` (`test/adapters.test.ts:11`, `test/grounding.test.ts:3`). The runtime
review path uses the reviewer-core copies — `assemblePrompt` and `groundFindings` are called from
`reviewer-core/src/review/run.ts:10-11`, reached through `reviewPullRequest` at
`src/modules/reviews/run-executor.ts:3`. Editing the `platform/` copy changes no production
behaviour.
