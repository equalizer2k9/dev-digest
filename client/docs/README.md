# client/docs

Stable, long-form docs too big for [CLAUDE.md](../CLAUDE.md) or [README.md](../README.md):
architecture deep dives, decision records, walkthroughs. Linked from CLAUDE.md, never
`@`-imported. Adding a doc → add a row below.

| Doc | About |
|---|---|
| [`ui-architecture.md`](ui-architecture.md) | How the studio is wired below the routes: the Server/Client boundary, `api.ts` + the TanStack Query hook layer (keys, invalidation, the SSE subscription), where the QueryClient is mounted, CSS-variable tokens and `data-theme`, and the auto-merged next-intl namespaces. |
