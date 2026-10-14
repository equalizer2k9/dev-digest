# devdigest-mcp/specs

One spec per feature, written BEFORE implementation. Create with `/spec devdigest-mcp <feature-name>`.
File name: `<feature-name>.md` (kebab-case). A feature spanning packages gets its spec in the
package that owns the core logic; other packages link to it from their own table.

Status: `draft` → `approved` → `implemented`.

| Spec | Status | Summary |
|---|---|---|
| [mcp-tools](mcp-tools.md) | approved | The package itself and its five tools: a stdio MCP server that wraps the DevDigest API over HTTP only — `list_agents`, `run_agent_on_pr` (the one write, blocks up to 120 s), `get_findings`, `get_conventions`, `get_blast_radius` — with next-step error hints, `.mcp.json` registration and its own start command. Criteria P1-7, P2-8 and the L04 lab prerequisites. |
