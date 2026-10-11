import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGet, seg } from '../api-client.js';
import { runTool } from '../errors.js';
import { formatBlast } from '../format.js';
import { resolvePull } from '../resolve.js';
import { BlastResponse } from '../schemas.js';

export async function getBlastRadius(args: { pr_number: number; repo?: string | undefined }) {
  const { pull } = await resolvePull(args.pr_number, args.repo);
  return formatBlast(await apiGet(`/pulls/${seg(pull.id)}/blast`, BlastResponse));
}

export function registerGetBlastRadius(server: McpServer) {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        "Show what else in the repo a PR can break: who calls the symbols its diff changes, and which HTTP endpoints and crons depend on those callers. Call before judging or merging a PR that touches shared code. Arguments: pr_number, repo (owner/name, optional when only one repo is imported). Returns { summary, degraded, reason, symbols[{ symbol, callers[\"file:line name\"], endpoints, crons }] }; degraded=true means the index is incomplete and reason says why. Read from the prebuilt index, no model call.",
      inputSchema: { pr_number: z.number().int().positive(), repo: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    (args) => runTool(() => getBlastRadius(args)),
  );
}
