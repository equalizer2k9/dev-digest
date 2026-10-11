import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTool } from '../errors.js';
import { BASE_ROUTES, mockApi, text } from '../mock-api.js';
import { runAgentOnPr } from './run-agent-on-pr.js';

afterEach(() => vi.unstubAllGlobals());

const start = { 'POST /pulls/p-uuid/review': { pr_id: 'p-uuid', runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'Security Reviewer' }], reviews: [] } };
const review = {
  run_id: 'run1', agent_id: 'a1', agent_name: 'Security Reviewer', verdict: 'request_changes', summary: 's', score: 40,
  created_at: '2026-01-01',
  findings: [
    { severity: 'CRITICAL', title: 'SQLi', file: 'a.ts', start_line: 3, rationale: 'x' },
    { severity: 'WARNING', title: 'w', file: 'b.ts', start_line: 9 },
  ],
};
const fast = { sleep: async () => {}, pollIntervalMs: 10, timeoutMs: 50 };
const args = { pr_number: 12, agent: 'security reviewer' };

describe('run_agent_on_pr', () => {
  it('done → findings, polling until the run leaves running', async () => {
    let polls = 0;
    const { fn } = mockApi({
      ...BASE_ROUTES, ...start,
      'GET /pulls/p-uuid/runs': () => [{ run_id: 'run1', status: ++polls < 3 ? 'running' : 'done' }],
      'GET /pulls/p-uuid/reviews': [{ ...review, run_id: 'other', verdict: 'approve' }, review],
    });
    const out = await runAgentOnPr(args, fast);
    expect(out).toMatchObject({ run_id: 'run1', status: 'done', verdict: 'request_changes', score: 40, counts: { CRITICAL: 1, WARNING: 1 } });
    expect(out).toHaveProperty('findings.0', { severity: 'CRITICAL', title: 'SQLi', file: 'a.ts', line: 3 });
    expect(polls).toBe(3);
    // The agent id sent comes from GET /agents, not from the model's text.
    const post = fn.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ agentId: 'a1' });
  });

  it('failed → isError with the hint', async () => {
    mockApi({ ...BASE_ROUTES, ...start, 'GET /pulls/p-uuid/runs': [{ run_id: 'run1', status: 'failed', error: 'LLM down' }] });
    const r = await runTool(() => runAgentOnPr(args, fast));
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('Run failed: LLM down. Fix the cause and call run_agent_on_pr again.');
  });

  it('timeout → still running with a next step, not an error', async () => {
    mockApi({ ...BASE_ROUTES, ...start, 'GET /pulls/p-uuid/runs': [{ run_id: 'run1', status: 'running' }] });
    const r = await runTool(() => runAgentOnPr(args, fast));
    expect(r.isError).toBeUndefined();
    const body = JSON.parse(text(r));
    expect(body).toMatchObject({ status: 'running', run_id: 'run1' });
    expect(body.next).toMatch(/get_findings/);
  });

  it('unknown agent never reaches POST /review', async () => {
    const { calls } = mockApi({ ...BASE_ROUTES, ...start });
    const r = await runTool(() => runAgentOnPr({ pr_number: 12, agent: 'ghost' }, fast));
    expect(text(r)).toMatch(/Agent 'ghost' not found/);
    expect(calls).not.toContain('POST /pulls/p-uuid/review');
  });

  it('429 from the API → rate-limit hint', async () => {
    mockApi({ ...BASE_ROUTES, 'POST /pulls/p-uuid/review': { status: 429, json: { error: { code: 'rate_limited', message: 'x' } } } });
    expect(text(await runTool(() => runAgentOnPr(args, fast)))).toMatch(/^Rate limited/);
  });
});
