import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiGet, apiPost, seg } from '../api-client.js';
import { noReview, runFailed, runTool } from '../errors.js';
import { formatRunResult } from '../format.js';
import { resolveAgent, resolvePull } from '../resolve.js';
import { POLL_INTERVAL_MS, RUN_TIMEOUT_MS } from '../constants.js';
import { ReviewList, RunList, StartedRuns } from '../schemas.js';

export interface RunOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runAgentOnPr(
  args: { pr_number: number; agent: string; repo?: string | undefined },
  opts: RunOptions = {},
) {
  const { timeoutMs = RUN_TIMEOUT_MS, pollIntervalMs = POLL_INTERVAL_MS, sleep = realSleep } = opts;
  const { pull } = await resolvePull(args.pr_number, args.repo);
  // The id sent to the API always comes from GET /agents, never from the caller's text.
  const agent = await resolveAgent(args.agent);

  const started = await apiPost(`/pulls/${seg(pull.id)}/review`, StartedRuns, { agentId: agent.id });
  const runId = started.runs[0]?.run_id;
  if (!runId) throw runFailed('the API started no run');

  const runsPath = `/pulls/${seg(pull.id)}/runs`;
  let waited = 0;
  for (;;) {
    const run = (await apiGet(runsPath, RunList)).find((r) => r.run_id === runId);
    if (run && run.status !== 'running') {
      if (run.status !== 'done') throw runFailed(run.error ?? `run ended with status '${run.status}'`);
      const review = (await apiGet(`/pulls/${seg(pull.id)}/reviews`, ReviewList)).find(
        (r) => r.run_id === runId,
      );
      if (!review) throw noReview(args.pr_number);
      return formatRunResult(runId, review);
    }
    if (waited >= timeoutMs) {
      return {
        status: 'running',
        run_id: runId,
        next: `Run still in progress after ${Math.round(timeoutMs / 1000)} s. Call get_findings with the same pr_number in a minute.`,
      };
    }
    await sleep(pollIntervalMs);
    waited += pollIntervalMs;
  }
}

export function registerRunAgentOnPr(server: McpServer) {
  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        "Run one reviewer agent on a PR and wait for the result. This starts a real model run (costs tokens; the API allows 10 starts per minute). Blocks up to 120 s. Arguments: pr_number, agent (name or id from list_agents), repo (owner/name, optional when only one repo is imported). Returns { run_id, status, verdict, score, counts, findings[{ severity, title, file, line }] }; if the run outlasts 120 s returns { status: \"running\", run_id, next } - then call get_findings later.",
      inputSchema: {
        pr_number: z.number().int().positive(),
        agent: z.string(),
        repo: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    (args) => runTool(() => runAgentOnPr(args)),
  );
}
