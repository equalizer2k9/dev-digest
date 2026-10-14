# INSIGHTS — devdigest-mcp/

Non-obvious knowledge from past sessions — read before a non-trivial change here.
Written by the `engineering-insights` skill. Append-only: add to the end of a section, never edit
or delete; cleanup only via `/engineering-insights review devdigest-mcp`.

## What Works
<!-- Approaches that worked where the obvious one failed -->
- `.mcp.json` launches `devdigest-mcp/node_modules/.bin/tsx devdigest-mcp/src/index.ts` (paths relative to the project root Claude Code is opened in). Verified by spawning exactly that command and sending `initialize` + `tools/list` over stdin: 5 tools, every stdout line a JSON-RPC frame. (2026-10-11)


## What Doesn't Work
<!-- Dead ends and antipatterns, each with what to do instead -->
- Launching through `npm run start` / `npm start` from `.mcp.json`: npm prints a banner on stdout, which corrupts the stdio transport. Launch the `tsx` binary directly. (2026-10-11)

## Codebase Patterns
<!-- Undocumented conventions and architectural decisions, with the reason -->
- Response shapes live in `src/schemas.ts` as minimal Zod schemas and double as the field whitelist: `z.object` strips unknown keys, so `system_prompt` etc. cannot reach a tool result even if `format.ts` forgot one. (2026-10-11)
- `get_blast_radius.symbols` lists only symbols that have callers (the route's `downstream[]`); changed symbols without callers appear in the route's `changed_symbols` but not in the tool output. (2026-10-11)
- Injection hardening: API text (PR/finding titles, rules, agent and repo names, API error messages) reaches the model only as JSON field values, cut to the limits in `src/constants.ts` via `clip()`. Errors are `{ error, hint, …fields }` with fixed prose; names that used to be spliced into hints live in `known_agents` / `known_repos` / `repo` / `run_error`. API error messages are never repeated; the API `code` only if it matches `SAFE_CODE_RE`. (2026-10-11)

## Tool & Library Notes
<!-- Dependency and tooling quirks, with the version -->
- `npm pkg set private=true` stores the STRING `"true"`; use `npm pkg set --json private=true`. (npm 11, 2026-10-11)
- `@modelcontextprotocol/sdk` 1.32 peers `zod ^3.25 || ^4.0`; Zod 4 works with `registerTool({ inputSchema: { … } })` (a raw shape, not `z.object`). (2026-10-11)

## Recurring Errors & Fixes
<!-- Exact error text → real cause → fix -->

## Session Notes
<!-- ### YYYY-MM-DD — task: outcome, sections that got entries, what stayed open -->

## Open Questions
<!-- Unverified hypotheses and unanswered questions; close with a "Resolved" sub-bullet -->
