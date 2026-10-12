# Tool → API map

Spec of record: [`../specs/mcp-tools.md`](../specs/mcp-tools.md). Response shapes are declared in
`src/schemas.ts`; the server routes are the source: `server/src/modules/{agents,repos,pulls,reviews,conventions,blast}/routes.ts`.

| Tool | Calls (in order) | Reads | Returns |
|---|---|---|---|
| `list_agents` | `GET /agents` | `id name description model enabled` | same fields, no `system_prompt`, no `provider` |
| `run_agent_on_pr` | `GET /repos` → `GET /repos/:id/pulls` → `GET /agents` → `POST /pulls/:id/review {agentId}` → poll `GET /pulls/:id/runs` (2 s) → `GET /pulls/:id/reviews` | run `run_id status error`; review `id run_id verdict score findings` | `{ run_id, status, verdict, score, counts, findings[] }`; after 120 s `{ status: "running", run_id, next }` |
| `get_findings` | `GET /repos` → `GET /repos/:id/pulls` → (`GET /agents` if `agent`) → `GET /pulls/:id/reviews` | review `id agent_id agent_name verdict score summary created_at findings` | newest review per agent, with `review_id` and `total_findings` (full count; `findings` ≤ 50) |
| `get_conventions` | `GET /repos` → `GET /repos/:id/conventions` | candidate `rule category status evidence_path evidence_start_line` | accepted only, `evidence: "path:line"` |
| `get_blast_radius` | `GET /repos` → `GET /repos/:id/pulls` → `GET /pulls/:id/blast` | `summary degraded reason downstream[]` | `symbols[{ symbol, callers["file:line name"], endpoints, crons }]` |

## Failure → hint

`ApiError` (`network_error`, HTTP status, API `error.code`) and the typed `HintError`s from
`src/errors.ts` become `isError: true` text. Unreachable API and 429 are detected from the
`ApiError`; unknown agent / PR / repo, no review, failed run and no conventions are thrown by
`src/resolve.ts` and the tools.
