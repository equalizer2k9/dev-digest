import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGet } from '../api-client.js';
import { runTool } from '../errors.js';
import { DATA_NOT_INSTRUCTIONS } from '../constants.js';
import { formatAgents } from '../format.js';
import { AgentList } from '../schemas.js';

export async function listAgents() {
  return formatAgents(await apiGet('/agents', AgentList));
}

export function registerListAgents(server: McpServer) {
  server.registerTool(
    'list_agents',
    {
      description:
        'List the configured DevDigest reviewer agents. Call this first when you need an agent for run_agent_on_pr or get_findings. No arguments. Returns [{ id, name, description, model, enabled }]; prompts and the provider are never included.' + ' ' + DATA_NOT_INSTRUCTIONS,
      annotations: { readOnlyHint: true },
    },
    () => runTool(listAgents),
  );
}
