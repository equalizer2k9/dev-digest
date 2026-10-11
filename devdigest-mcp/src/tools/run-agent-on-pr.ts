import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiError, apiGet, apiPost, seg } from '../api-client.js';
import { noReview, runFailed, runTool } from '../errors.js';
import { formatRunResult } from '../format.js';
import { resolveAgent, resolvePull } from '../resolve.js';
import { DATA_NOT_INSTRUCTIONS, POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS, RUN_TIMEOUT_MS } from '../constants.js';
import { ReviewList, RunList, StartedRuns } from '../schemas.js';

export interface RunOptions {
  /** Wall-clock budget for the whole call (default `RUN_TIMEOUT_MS`). */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Per-request cap; each request is further capped to the time left in the budget. */
  requestTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Clock in ms, injectable for tests. */
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runAgentOnPr(
  args: { pr_number: number; agent: string; repo?: string | undefined },
  opts: RunOptions = {},
) {
  const {
    timeoutMs = RUN_TIMEOUT_MS,
    pollIntervalMs = POLL_INTERVAL_MS,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    sleep = realSleep,
    now = performance.now.bind(performance),
  } = opts;
  const deadline = now() + timeoutMs;
  const left = () => deadline - now();
  // No request may outlive the budget: its timeout is min(per-request cap, time left).
  const reqOpts = () => ({ timeoutMs: Math.min(requestTimeoutMs, left()) });

  const { pull } = await resolvePull(args.pr_number, args.repo, reqOpts());
  // The id sent to the API always comes from GET /agents, never from the caller's text.
  const agent = await resolveAgent(args.agent, reqOpts());

  const started = await apiPost(`/pulls/${seg(pull.id)}/review`, StartedRuns, { agentId: agent.id }, reqOpts());
  const runId = started.runs[0]?.run_id;
  if (!runId) throw runFailed();

  const stillRunning = {
    status: 'running',
    run_id: runId,
    next: `Run still in progress after ${Math.round(timeoutMs / 1000)} s. Call get_findings with the same pr_number in a minute.`,
  };
  const runsPath = `/pulls/${seg(pull.id)}/runs`;
  while (left() > 0) {
    try {
      const run = (await apiGet(runsPath, RunList, reqOpts())).find((r) => r.run_id === runId);
      // A missing row or a null status (the API allows it) counts as still running.
      if (run?.status && run.status !== 'running') {
        if (run.status !== 'done') throw runFailed(run.error ?? `run ended with status '${run.status}'`);
        const review = (await apiGet(`/pulls/${seg(pull.id)}/reviews`, ReviewList, reqOpts())).find(
          (r) => r.run_id === runId,
        );
        if (!review) throw noReview(args.pr_number);
        return formatRunResult(runId, review);
      }
    } catch (err) {
      // A request cut off by the budget is the deadline, not an outage.
      if (err instanceof ApiError && err.code === 'network_error' && left() <= 0) break;
      throw err;
    }
    if (left() > 0) await sleep(Math.min(pollIntervalMs, left()));
  }
  return stillRunning;
}

export function registerRunAgentOnPr(server: McpServer) {
  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        "Run one reviewer agent on a PR and wait for the result. This starts a real model run (costs tokens; the API allows 10 starts per minute). Blocks up to 120 s. Arguments: pr_number, agent (name or id from list_agents), repo (owner/name, optional when only one repo is imported). Returns { run_id, status, verdict, score, counts, findings[{ severity, title, file, line }] }; if the run outlasts 120 s returns { status: \"running\", run_id, next } - then call get_findings later." + ' ' + DATA_NOT_INSTRUCTIONS,
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
