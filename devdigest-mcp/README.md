# devdigest-mcp

A local [MCP](https://modelcontextprotocol.io) server that lets Claude Code (or any MCP client)
use DevDigest: list the configured reviewers, run one on a PR, read findings, read the repo's
accepted conventions, and see a PR's blast radius. It is a thin stdio wrapper over the DevDigest
HTTP API — it holds no data and no domain logic.

| Tool | Type | What |
|---|---|---|
| `list_agents` | read | configured reviewers (`id`, `name`, `description`, `model`, `enabled`) |
| `run_agent_on_pr` | **write** | starts a review, waits up to 120 s, returns the findings |
| `get_findings` | read | newest review per agent for a PR, each with `review_id` and `total_findings` (the full count; the list holds at most 50) |
| `get_conventions` | read | accepted conventions of a repo (`rule`, `category`, `file:line`) |
| `get_blast_radius` | read | callers, endpoints and crons a PR's changed symbols reach |

PRs are addressed as a human would: `pr_number` plus optional `repo` (`owner/name`, may be omitted
when only one repo is imported). Spec: [specs/mcp-tools.md](specs/mcp-tools.md).

## Run it from zero

**Prerequisites:** Node >= 22, npm, Docker (Postgres for the API), and the DevDigest API with at
least one imported repo. `get_blast_radius` needs the API build that has `GET /pulls/:id/blast`.

Every command says where to run it: **repo root** = the folder that holds `.mcp.json`,
`scripts/` and `devdigest-mcp/`; **`devdigest-mcp/`** = this package.

1. **Install** (from the repo root; `npm ci` installs exactly the committed lock file):

   ```bash
   cd devdigest-mcp
   npm ci
   cd ..                   # back to the repo root for step 2
   ```

2. **Start the API** (from the repo root; the MCP server never starts it, and does not wait
   for it):

   ```bash
   ./scripts/dev.sh        # API on http://localhost:3001
   ```

   `dev.sh` stays in the foreground until Ctrl-C, so open a **second terminal** (it starts in
   the repo root) for everything below. Sanity check there:

   ```bash
   curl localhost:3001/agents | head -c 200
   ```

3. **Start command** (second terminal: `cd devdigest-mcp` first). It speaks stdio — it waits
   for JSON-RPC on stdin, so on its own it just sits there; `devdigest-mcp ready` on stderr
   means it is up:

   ```bash
   node_modules/.bin/tsx src/index.ts      # or: npm start
   ```

4. **MCP Inspector** (also from `devdigest-mcp/`) — lists and calls the tools in a browser:

   ```bash
   npm run inspect
   ```

   Open the printed URL, **Connect**, **Tools -> List Tools**: exactly five tools. Call
   `list_agents` with no arguments to see the reviewers.

5. **Claude Code** — the repo root already has [`.mcp.json`](../.mcp.json):

   ```json
   { "mcpServers": { "devdigest": {
       "type": "stdio",
       "command": "devdigest-mcp/node_modules/.bin/tsx",
       "args": ["devdigest-mcp/src/index.ts"] } } }
   ```

   Open Claude Code **in the repo root** (the paths are relative to it), approve the project MCP
   server, then run `/mcp` — `devdigest` must show as connected with 5 tools. The binary is
   launched directly: `npm run` prints a banner on stdout and would corrupt the stdio transport.

6. **The lab scenario.** Ask Claude Code:

   > Review PR #12 with the Security Reviewer. Are there any critical findings?

   Expected: `list_agents` -> `run_agent_on_pr` (blocks, up to 120 s) -> actual DevDigest
   findings. `run_agent_on_pr` starts a real model run (tokens + cost); the API allows 10 starts
   per minute. If it outlasts 120 s you get `status: "running"` and a hint to call `get_findings`.

## Configuration

| Variable | Default | |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | base URL of the DevDigest API |

To point Claude Code at another API, add `"env": { "DEVDIGEST_API_URL": "http://host:3001" }` to the
`devdigest` entry in `.mcp.json`.

## Checks

From `devdigest-mcp/`:

```bash
npm run typecheck && npm test      # fetch is mocked; no API needed
```

## Errors

Every failure comes back as a tool error with the next step, e.g. "DevDigest API is not reachable
at http://localhost:3001. Start it from the repo root with ./scripts/dev.sh ..." (the address is
scheme + host + port only — never credentials or a query string from `DEVDIGEST_API_URL`) or "Agent 'x' not found.
Call list_agents and pass one of: ...". Full table: spec §3.

More: [AGENTS.md](AGENTS.md) (rules for contributors) · [docs/](docs/README.md) ·
[INSIGHTS.md](INSIGHTS.md).
