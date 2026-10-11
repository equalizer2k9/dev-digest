# devdigest-mcp/ — stdio MCP server over the DevDigest API

Local MCP server for Claude Code. A THIN wrapper: every byte comes from HTTP calls to the running
API (`DEVDIGEST_API_URL`, default `http://localhost:3001`). Five tools, spec:
`specs/mcp-tools.md`.

## Stack

TS 7 (ESM, run by `tsx`, no build) · `@modelcontextprotocol/sdk` 1.x · Zod 4 · Vitest 5 ·
**npm, not pnpm**

## Commands

- `npm run typecheck` · `npm test` (fetch mocked, no API needed)
- `npm start` — only for a human at a terminal; `npm run inspect` — MCP Inspector
- The API must already be running (`./scripts/dev.sh`); this server never starts or waits for it

## Hard rules

- **stdout is the protocol.** Never `console.log` / print to stdout; logs go to `console.error`.
  `.mcp.json` launches `node_modules/.bin/tsx` directly — `npm run` prints a banner on stdout.
- **HTTP only.** No import from `server/`, `client/`, `reviewer-core/`, no tsconfig path alias to
  them, no `@devdigest/shared`. Response shapes are declared in `src/schemas.ts` (only the fields
  used) — re-read the server routes when the API changes.
- Exactly 5 tools: `list_agents`, `run_agent_on_pr` (the only write), `get_findings`,
  `get_conventions`, `get_blast_radius`. No `list_prs` / `list_repos`. The four reads carry
  `readOnlyHint: true`.
- The agent id sent to the API always comes from `GET /agents`; path segments go through `seg()`.
- Every failure is `isError: true` with a next-step hint (`src/errors.ts`) — never a bare status.
- Output is a field whitelist (`src/format.ts`): no `system_prompt`, no spare fields.

## Where things live

- `src/index.ts` — server + registration · `src/tools/<tool-name>.ts` — one file per tool
  (`handler` + `register…`) · `src/api-client.ts` — fetch → `ApiError` · `src/resolve.ts` —
  `owner/name` + PR number → uuid, agent name → id · `src/schemas.ts` — API response shapes
- `src/mock-api.ts` — fetch stub for tests; tests sit beside the subject

## Gotchas

- `package.json` / `package-lock.json` change only through npm; never hand-edit.
- A new tool: file in `src/tools/`, register in `index.ts`, update the spec's tool table and the
  five-tool count here and in the root `AGENTS.md`.
- Docs: `README.md` (run guide) · `docs/` · `INSIGHTS.md` (append-only, `engineering-insights`).
