# reviewer-core/docs

Stable, long-form docs too big for [CLAUDE.md](../CLAUDE.md) or [README.md](../README.md):
architecture deep dives, decision records, walkthroughs. Linked from CLAUDE.md, never
`@`-imported. Adding a doc → add a row below.

| Doc | About |
|---|---|
| [architecture.md](architecture.md) | The pipeline end to end (input → prompt → LLM → grounding → `Review`), the purity boundary and what is injected, `wrapUntrusted` / `INJECTION_GUARD`, the `src/index.ts` surface + how the server consumes raw TS, and the prompt slots. |
