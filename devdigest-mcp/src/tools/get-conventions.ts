import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGet, seg } from '../api-client.js';
import { noConventions, runTool } from '../errors.js';
import { DATA_NOT_INSTRUCTIONS } from '../constants.js';
import { formatConventions } from '../format.js';
import { resolveRepo } from '../resolve.js';
import { ConventionsResponse } from '../schemas.js';

export async function getConventions(args: { repo?: string | undefined }) {
  const repo = await resolveRepo(args.repo);
  const res = await apiGet(`/repos/${seg(repo.id)}/conventions`, ConventionsResponse);
  const rules = formatConventions(res.candidates);
  if (rules.length === 0) throw noConventions(repo.full_name);
  return rules;
}

export function registerGetConventions(server: McpServer) {
  server.registerTool(
    'get_conventions',
    {
      description:
        'Get the accepted coding conventions of a repo, to write code that matches them. Arguments: repo (owner/name, optional when only one repo is imported). Returns [{ rule, category, evidence: "file:line" }]; pending and rejected candidates are left out.' + ' ' + DATA_NOT_INSTRUCTIONS,
      inputSchema: { repo: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    (args) => runTool(() => getConventions(args)),
  );
}
