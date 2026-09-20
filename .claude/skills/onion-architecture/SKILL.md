---
name: onion-architecture
description: "ALWAYS invoke when touching anything under server/src — a routes.ts, service.ts, repository.ts, a new module, platform/container.ts, an adapter in src/adapters/**, or when wiring an outside dependency (GitHub, git, LLM, embeddings, secrets, ripgrep, ast-grep) into a feature. Do NOT use it for Fastify mechanics (fastify-best-practices), query/migration syntax (drizzle-orm-patterns) or contract shapes (zod): this skill decides layer boundaries and dependency direction only."
version: 1.0.0
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Onion Architecture — server/

**Version:** 1.0.0 · scope: `server/` (`@devdigest/api`, Fastify 5 + Drizzle)

One direction of dependency: **route → service → repository → db**, with every outside system behind
an adapter at the edge. See [server/AGENTS.md](../../../server/AGENTS.md) and
`server/docs/architecture.md` for the annotated layer map.

## The rings

```
        HTTP (outer)
  src/modules/<d>/routes.ts        transport only: zod schema, getContext, status codes
            ↓ delegates
  src/modules/<d>/service.ts       business logic; takes the Container; no HTTP, no raw SQL
            ↓ persists via
  src/modules/<d>/repository.ts    the ONLY place touching Drizzle tables; workspaceId-scoped
            ↓
  src/db/schema/*.ts               innermost: tables + contracts (src/vendor/shared)

  src/adapters/**                  the edge: llm, github, git, codeindex, embedder, secrets,
                                   auth, astgrep, depgraph, tokenizer + mocks.ts
  src/platform/container.ts        composition root — the ONLY place adapters are constructed
```

Dependencies point **inward**. A service depends on the interfaces (`GitHubClient`, `GitClient`,
`LLMProvider`, `CodeIndex`, `Embedder`, `SecretsProvider`, `AuthProvider` from `@devdigest/shared`)
resolved off the `Container`, never on a concrete adapter class. `repository.ts` imports no
`fastify`; `service.ts` imports no `FastifyRequest`/`FastifyReply`.

## Rules

1. **A route never reaches an adapter.** No import from `../../adapters/**` and no
   `container.github()` / `container.llm()` / `container.git` / `container.codeIndex` /
   `container.embedder` / `container.secrets` inside `routes.ts`. The route calls the service; the
   service resolves the adapter at point of use.
2. **A route never touches the DB.** No `container.db`, no `drizzle-orm` operators, no
   `src/db/schema` import in `routes.ts` — that belongs in `repository.ts`.
3. **Services take the `Container`, not individual adapters** — `new RepoService(app.container)`.
   Resolving lazily is why a missing API key fails a *run*, not the boot.
4. **Adapters are constructed only in `src/platform/container.ts`.** New outside dependency = an
   interface + an adapter folder + a lazy getter on `Container` + an entry in `ContainerOverrides`.
5. **Tests swap the edge, never the core.** `buildApp({ overrides })` with mocks from
   `src/adapters/mocks.ts`. No real key, no network.
6. **Every repository query is workspace-scoped** (`eq(t.x.workspaceId, workspaceId)`); the route gets
   the scope from `getContext(app.container, req)`.
7. **Validation at the boundary only** — route-level zod `params`/`body`/`querystring`. Never
   `Schema.parse(req.body)` inside a handler.
8. **New module = one import + one `app.register` in `src/modules/index.ts`** (no autoload), and it
   ships `routes.ts` + `service.ts` (+ `repository.ts` when it owns a table).
9. **Secrets only through `SecretsProvider`** (`src/adapters/secrets/local.ts`) — never from
   `AppConfig`, the DB, or git.
10. **Cross-module reads go through the composition root**, not another module's folder: use
    `container.agentsRepo` / `container.reviewRepo` / `container.repoIntel`, not
    `new AgentsRepository(db)` from a foreign module.

## Good / bad — real paths

**Good** — `src/modules/repos/routes.ts`: parse, scope, delegate, map status.

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

The clone itself — `git clone` via the `GitClient` adapter plus the stored PAT — lives in
`src/modules/repos/service.ts` (`runCloneJob`), and the `repos` table is touched only by
`src/modules/repos/repository.ts`.

**Bad** — the same endpoint written into the route:

```ts
app.post('/repos', async (req) => {
  const gh = await app.container.github();              // ← adapter called from the route
  const meta = await gh.getRepo(parseRepoUrl(req.body.url));
  const [row] = await app.container.db                  // ← SQL in the route
    .insert(t.repos).values({ owner: meta.owner }).returning();
  const token = app.container.config.githubToken;       // ← secret off AppConfig
  return row;                                           // ← no workspaceId scope anywhere
});
```

## Known legacy exceptions — do not copy, do not refactor unasked

`src/modules/pulls/routes.ts`, `src/modules/polling/routes.ts`, `src/modules/settings/routes.ts` and
`src/modules/workspace/routes.ts` have no `service.ts`: they call `container.github()` /
`container.llm()` / `container.db` straight from the handler. That is pre-existing debt, not the pattern.

- Adding an endpoint to one of these modules → extract the logic into a new `service.ts` for the code
  you add; leave the surrounding handlers alone.
- Do not cite them as precedent for a new module.

## Do not

- Do not import `server/src/**` from `reviewer-core/` — the engine is pure (no DB, no GitHub, no fs;
  its only side effect is the injected `LLMProvider`).
- Do not hand-edit `server/src/db/migrations/**` (incl. `meta/_journal.json`, `*_snapshot.json`);
  change `src/db/schema/*.ts` then `pnpm db:generate`.
- Do not name an integration test without the marker: a test importing `test/helpers/pg.ts` MUST be
  `*.it.test.ts`.

## Defer to

| Question | Skill |
|---|---|
| Hooks, plugins, serialization, error handler, lifecycle | `fastify-best-practices` |
| Query building, relations, transactions, `db:generate` | `drizzle-orm-patterns` |
| Table/column/index design | `postgresql-table-design` |
| Contract schemas in `src/vendor/shared` | `zod` |
| The UI that consumes these routes | `frontend-architecture` |
