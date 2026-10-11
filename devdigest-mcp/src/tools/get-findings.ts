import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGet, seg } from '../api-client.js';
import { noReview, runTool } from '../errors.js';
import { formatReview } from '../format.js';
import { resolveAgent, resolvePull } from '../resolve.js';
import { ReviewList, type ReviewRow } from '../schemas.js';

export async function getFindings(args: {
  pr_number: number;
  repo?: string | undefined;
  agent?: string | undefined;
}) {
  const { pull } = await resolvePull(args.pr_number, args.repo);
  const agentId = args.agent === undefined ? undefined : (await resolveAgent(args.agent)).id;
  const reviews = await apiGet(`/pulls/${seg(pull.id)}/reviews`, ReviewList);

  // Newest review per agent.
  const newest = new Map<string, ReviewRow>();
  for (const r of reviews) {
    if (agentId !== undefined && r.agent_id !== agentId) continue;
    const cur = newest.get(r.agent_id);
    if (!cur || r.created_at > cur.created_at) newest.set(r.agent_id, r);
  }
  if (newest.size === 0) throw noReview(args.pr_number);
  return [...newest.values()].map(formatReview);
}

export function registerGetFindings(server: McpServer) {
  server.registerTool(
    'get_findings',
    {
      description:
        "Read the findings of reviews already finished on a PR; does not start a run (use run_agent_on_pr for that). Arguments: pr_number, repo (owner/name, optional when only one repo is imported), agent (name or id, optional; default all agents). Returns, per agent, its newest review: { agent, verdict, score, summary, counts, findings[{ severity, title, file, line }] }.",
      inputSchema: {
        pr_number: z.number().int().positive(),
        repo: z.string().optional(),
        agent: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    (args) => runTool(() => getFindings(args)),
  );
}
