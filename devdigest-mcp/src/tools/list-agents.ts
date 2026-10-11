import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGet } from '../api-client.js';
import { runTool } from '../errors.js';
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
        'List the configured DevDigest reviewer agents. Call this first when you need an agent for run_agent_on_pr or get_findings. No arguments. Returns [{ id, name, description, enabled, provider, model }]; prompts are never included.',
      annotations: { readOnlyHint: true },
    },
    () => runTool(listAgents),
  );
}
