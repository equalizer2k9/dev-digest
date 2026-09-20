# server/docs

Stable, long-form docs too big for [CLAUDE.md](../CLAUDE.md) or [README.md](../README.md):
architecture deep dives, decision records, walkthroughs. Linked from CLAUDE.md, never
`@`-imported. Adding a doc → add a row below.

| Doc | About |
|---|---|
| [architecture](architecture.md) | Boot sequence, the DI container + adapter ports (real vs mock), the route → service → repository → Drizzle path, transaction boundaries (there are none), config + secrets, background work. |
