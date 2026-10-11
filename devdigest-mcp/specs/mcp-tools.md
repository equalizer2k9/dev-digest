# devdigest-mcp — MCP tools

**Status:** approved · **Package:** devdigest-mcp · **Date:** 2026-10-11

Siblings: [`server/specs/blast-radius.md`](../../server/specs/blast-radius.md) ·
[`client/specs/blast-radius.md`](../../client/specs/blast-radius.md) ·
requirements: [`docs/hw4/requirements.md`](../../docs/hw4/requirements.md)

## Problem

Everything DevDigest knows about a PR — configured reviewers, findings, repo conventions, the
blast-radius map — is reachable only through the browser. A coding agent in Claude Code cannot ask
"what does PR #12 touch" or "run the Security Reviewer on it". There is no MCP server in the repo
and no `.mcp.json`.

## Goals / non-goals

**Goals**

- A fifth standalone package at the repo root, `devdigest-mcp/`: own `package.json` and
  `package-lock.json`, both produced only by npm (`npm init`, `npm install`) — never hand-written.
- A local MCP server on `@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport` + zod),
  stdio transport, exposing exactly the five tools of §2.
- A thin wrapper: every byte of data comes from HTTP calls to the DevDigest API
  (`DEVDIGEST_API_URL`, default `http://localhost:3001`). No import from `server/`, `client/` or
  `reviewer-core/`, no path alias to `@devdigest/shared`, no DB access, no copy of domain logic.
- Registered in the root `.mcp.json`; started by its own command, never by `scripts/dev.sh`.
- `get_blast_radius` returns the same map the Overview block shows, from the same route.

**Non-goals**

- `list_prs`, `list_repos` — `gh pr list` and the GitHub MCP cover them.
- The lab's token audit with the GitHub MCP. Not a homework criterion.
- HTTP / SSE transport, auth, publishing to npm, a build step (`tsx` runs the source).
- Any model call inside the MCP server.
- New API endpoints for the MCP server's convenience. Only `GET /pulls/:id/blast` is new, and it
  belongs to the server spec.

## Behaviour

### 1. Package

```
devdigest-mcp/
  package.json · package-lock.json      npm only · "type": "module" · "private": true
  tsconfig.json                          ESM, strict, noEmit
  README.md · AGENTS.md (≤ 60 lines) · CLAUDE.md → AGENTS.md · INSIGHTS.md · docs/ · specs/
  src/
    index.ts            McpServer + StdioServerTransport, registers five tools
    constants.ts        DEFAULT_API_URL · RUN_TIMEOUT_MS = 120_000 · POLL_INTERVAL_MS
    api-client.ts       fetch wrapper; decodes { error: { code, message } } into ApiError
    resolve.ts          resolveRepo · resolvePull · resolveAgent
    errors.ts           toToolError — failure → next-step hint
    format.ts           compact output shape per tool (field whitelist)
    tools/<tool-name>.ts   one file per tool
```

Scripts: `start` (`tsx src/index.ts`), `typecheck`, `test`, `inspect` (MCP Inspector).
Dependencies: `@modelcontextprotocol/sdk`, `zod` (the major the SDK's peer range accepts — checked
at install); dev: `typescript`, `tsx`, `vitest`, `@types/node`.

stdout carries protocol frames only. All logging goes to `console.error`.

### 2. Tools

Arguments are flat. A PR is addressed as a human would: `pr_number` plus optional `repo`
(`owner/name`); the server resolves it to the API's row uuid through `GET /repos` and
`GET /repos/:id/pulls`. `repo` may be omitted when exactly one repo is imported.

| Tool | Type | Arguments | API calls | Returns |
|---|---|---|---|---|
| `list_agents` | read | — | `GET /agents` | `[{ id, name, description, enabled, provider, model }]` — never `system_prompt` |
| `run_agent_on_pr` | **write** | `pr_number`, `agent` (name or id), `repo?` | resolve → `POST /pulls/:id/review` → poll `GET /pulls/:id/runs` until that run leaves `running` or 120 s pass → `GET /pulls/:id/reviews`, picked by `run_id` | `{ run_id, status, verdict, score, counts, findings[] }`; on timeout `{ status: "running", run_id, next }` — not an error |
| `get_findings` | read | `pr_number`, `repo?`, `agent?` | resolve → `GET /pulls/:id/reviews` | per agent, its newest review: `{ agent, verdict, score, summary, counts, findings[{ severity, title, file, line }] }` |
| `get_conventions` | read | `repo?` | resolve repo → `GET /repos/:id/conventions`, keep `status === 'accepted'` | `[{ rule, category, evidence: "file:line" }]` — accepted conventions of that repo only |
| `get_blast_radius` | read | `pr_number`, `repo?` | resolve → `GET /pulls/:id/blast` — that one call; the route loads the PR's files itself | `{ summary, degraded, reason, symbols[{ symbol, callers["file:line name"], endpoints, crons }] }` |

Per-tool checklist (lab rules): a description that says when to call it, what the arguments are and
what comes back, plus its limit; flat arguments; a compact structured answer with no spare fields;
`readOnlyHint: true` on the four read tools and not on `run_agent_on_pr`. Annotations are hints —
real limits are enforced by the API (rate limit, validation), not by the MCP server.

### 3. Errors point at the next step

Every failure is `isError: true` with text, never a bare status code.

| Failure | Message |
|---|---|
| API unreachable | "DevDigest API is not reachable at <url>. Start it with ./scripts/dev.sh, then retry." |
| Unknown agent | "Agent '<x>' not found. Call list_agents and pass one of: <names>." |
| Unknown PR | "PR #<n> not found in <repo>. Check the number with `gh pr list`; the PR must be imported in DevDigest." |
| Unknown / ambiguous repo | "Repo '<x>' is not imported. Known repos: <list>. Pass repo as owner/name." |
| No review yet | "No review for PR #<n> yet. Call run_agent_on_pr first." |
| Run failed | "Run failed: <error>. Fix the cause and call run_agent_on_pr again." |
| 429 | "Rate limited (10 review starts per minute). Wait a minute and retry." |
| No accepted conventions | "No accepted conventions for <repo>. Open its Conventions page in DevDigest, run a scan and accept rules." |

The agent id sent to `POST /pulls/:id/review` always comes from `GET /agents` — model-supplied text
is never forwarded as an id. Path segments are URL-encoded.

### 4. Registration and launch

Root `.mcp.json` (new):

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "devdigest-mcp/node_modules/.bin/tsx",
      "args": ["devdigest-mcp/src/index.ts"]
    }
  }
}
```

The binary is launched directly — `npm run` prints a banner on stdout and would corrupt the
transport. The exact form is to be confirmed with MCP Inspector and Claude Code `/mcp`.

The API must already be running; the MCP server neither starts nor waits for it.

### 5. Root `AGENTS.md`

One new row in the package table, three edits in place — 77 → 78 lines, budget 80:

```
| [devdigest-mcp/](devdigest-mcp/AGENTS.md) | stdio MCP server: 5 tools over the API, HTTP only | npm | — |
```

"Four standalone packages" → "Five"; `devdigest-mcp` added to the npm list in Commands and to the
lock-file list in "Do not touch". `CLAUDE.md` is a symlink to `AGENTS.md` — edit `AGENTS.md` only.
`.claude/commands/spec.md` gains `devdigest-mcp` in its package list.

## Contracts & data

- No `@devdigest/shared` change from this package. It reads `BlastRadiusResponse` over HTTP and
  declares its own minimal zod shapes for the fields it uses.
- New files outside the package: `.mcp.json`; one row + three edits in root `AGENTS.md`.
- Tool input schemas: `pr_number: z.number().int().positive()`, `repo: z.string().optional()`,
  `agent: z.string()`.

## Acceptance criteria

`P*` ids are those of [`docs/hw4/requirements.md`](../../docs/hw4/requirements.md); `L04-*` are the
lab prerequisites from its «Передумова» section, numbered here.

- [ ] **P1-7** `get_blast_radius` works from Claude Code over stdio and returns the same summary,
      symbols, callers, endpoints, crons, `degraded` and `reason` as `GET /pulls/:id/blast` — the
      same map the Overview block shows for that PR.
- [ ] **P2-8** `get_blast_radius` follows the lab rules: a short "when to call" description, flat
      arguments, a compact response, a useful error for an unknown PR, `readOnlyHint: true`.
- [ ] **L04-1** Exactly five tools are registered: `list_agents`, `run_agent_on_pr`,
      `get_findings`, `get_conventions`, `get_blast_radius`. No `list_prs`, no `list_repos`.
- [ ] **L04-2** The four read tools carry `readOnlyHint: true`; `run_agent_on_pr` does not.
- [ ] **L04-3** `run_agent_on_pr` blocks up to 120 s and returns findings; on timeout it returns
      "still running" plus the next step.
- [ ] **L04-4** Every failure in §3 is `isError: true` with its hint.
- [ ] **L04-5** The package imports nothing from `server/`, `client/`, `reviewer-core/`; all data
      comes over HTTP from `DEVDIGEST_API_URL`. `package.json` and `package-lock.json` were created
      by npm.
- [ ] **L04-6** Registered in root `.mcp.json`; started by its own command; absent from
      `scripts/dev.sh`.
- [ ] **L04-7** Nothing but protocol frames on stdout.
- [ ] **L04-8** Root `AGENTS.md` has the package row and stays ≤ 80 lines; `devdigest-mcp/AGENTS.md`
      ≤ 60.

- [ ] **L04-9** `devdigest-mcp/README.md` has a from-zero run guide: prerequisites, `npm install`,
      starting the API, the start command, MCP Inspector, `.mcp.json` / Claude Code check.

Out of scope: token audit with the GitHub MCP; a CI workflow for this package. Not code: P1-8,
P2-9 (PR description + video).

## Tests

`npm run typecheck && npm test` in `devdigest-mcp/`; vitest, `fetch` mocked, no API needed.

- `api-client.test.ts` — error envelope → `ApiError`; network failure → `network_error`.
- `resolve.test.ts` — repo by `full_name`; single-repo default; ambiguous; unknown PR; agent by
  name (case-insensitive) and by id.
- `errors.test.ts` — one row per message in §3.
- `format.test.ts` — `system_prompt` and other non-whitelisted fields never leave.
- `tools/run-agent-on-pr.test.ts` — done → findings; failed → hint; timeout → "still running".
- `tools/get-blast-radius.test.ts` — after resolving the PR, exactly one call, to
  `/pulls/:id/blast`; output keeps `degraded` and `reason`; unknown PR → hint.
- `tools/get-conventions.test.ts` — pending and rejected candidates are dropped; fields are
  `rule`, `category`, `evidence`; nothing accepted → hint; `GET /skills` is never called.

Manual: MCP Inspector lists five tools; Claude Code `/mcp` shows `devdigest` connected; the lab
scenario (`list_agents → run_agent_on_pr → get_findings`) returns real DevDigest findings.

## Open questions

Decided 2026-10-11: `get_conventions` returns accepted repo conventions only, no skill fallback;
no CI workflow; `devdigest-mcp` is added to `/spec`; `get_blast_radius` calls the blast route only.

- **`.mcp.json` launch form** — unverified until the package exists (§4); confirmed with MCP
  Inspector and Claude Code `/mcp`.
- **Evidence field names** of `ConventionCandidate` (path + line range) are read from the API
  response at implementation time; the tool prints them as `file:line`.
