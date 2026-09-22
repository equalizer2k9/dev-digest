# e2e/docs

Stable, long-form docs too big for [CLAUDE.md](../CLAUDE.md) or [README.md](../README.md):
architecture deep dives, decision records, walkthroughs. Linked from CLAUDE.md, never
`@`-imported. Adding a doc → add a row below.

| Doc | About |
|---|---|
| [architecture.md](architecture.md) | How the suite runs: `run.ts` (discovery, shared session, step execution, exit codes, failure screenshots), agent-browser itself (Rust + CDP CLI, config, the subcommands used, the banned `chat`), `lib/assert.ts`, hermetic vs dev-stack modes, `{BASE}`, CI |
