import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { apiUrl } from './api-client.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

// stdout carries protocol frames only — every log goes to stderr.
const server = new McpServer({ name: 'devdigest', version: '1.0.0' });

registerListAgents(server);
registerRunAgentOnPr(server);
registerGetFindings(server);
registerGetConventions(server);
registerGetBlastRadius(server);

await server.connect(new StdioServerTransport());
console.error(`devdigest-mcp ready (API: ${apiUrl()})`);
