import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTool } from '../errors.js';
import { BASE_ROUTES, mockApi, text } from '../mock-api.js';
import { runAgentOnPr } from './run-agent-on-pr.js';

afterEach(() => vi.unstubAllGlobals());

/** fetch stub: the listed "METHOD /path" keys answer normally, everything else hangs until aborted. */
function hangingAfter(answered: string[]) {
  const base = mockApi({ ...BASE_ROUTES, ...start });
  const answer = base.fn.getMockImplementation()!;
  return vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`;
    const open = answered.includes(key) || key in BASE_ROUTES_KEYS;
    if (open) return answer(input, init);
    return new Promise((_, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
    });
  });
}
const BASE_ROUTES_KEYS = Object.fromEntries(Object.keys(BASE_ROUTES).map((k) => [k, true]));

const start = { 'POST /pulls/p-uuid/review': { pr_id: 'p-uuid', runs: [{ run_id: 'run1', agent_id: 'a1', agent_name: 'Security Reviewer' }], reviews: [] } };
const review = {
  id: 'rev-1', run_id: 'run1', agent_id: 'a1', agent_name: 'Security Reviewer', verdict: 'request_changes', summary: 's', score: 40,
  created_at: '2026-01-01',
  findings: [
    { severity: 'CRITICAL', title: 'SQLi', file: 'a.ts', start_line: 3, rationale: 'x' },
    { severity: 'WARNING', title: 'w', file: 'b.ts', start_line: 9 },
  ],
};
/** Fake wall clock: `sleep` advances it; so can a slow mocked request. */
function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; }, sleep: async (ms: number) => { t += ms; } };
}
const fastClock = () => { const c = fakeClock(); return { now: c.now, sleep: c.sleep, pollIntervalMs: 10, timeoutMs: 50 }; };
const fast = fastClock();
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
    expect(JSON.parse(text(r))).toMatchObject({ error: 'Run failed.', run_error: 'LLM down' });
  });

  it('timeout → still running with a next step, not an error', async () => {
    mockApi({ ...BASE_ROUTES, ...start, 'GET /pulls/p-uuid/runs': [{ run_id: 'run1', status: 'running' }] });
    const r = await runTool(() => runAgentOnPr(args, fast));
    expect(r.isError).toBeUndefined();
    const body = JSON.parse(text(r));
    expect(body).toMatchObject({ status: 'running', run_id: 'run1' });
    expect(body.next).toMatch(/get_findings/);
  });

  it('slow polls still stop at the wall-clock deadline', async () => {
    const clock = fakeClock();
    let polls = 0;
    mockApi({
      ...BASE_ROUTES, ...start,
      'GET /pulls/p-uuid/runs': () => { polls++; clock.advance(40); return [{ run_id: 'run1', status: 'running' }]; },
    });
    const opts = { now: clock.now, sleep: clock.sleep, pollIntervalMs: 10, timeoutMs: 100 };
    const r = await runTool(() => runAgentOnPr(args, opts));
    expect(JSON.parse(text(r))).toMatchObject({ status: 'running', run_id: 'run1' });
    // Sleep-sum accounting would have polled 10 times (100 / 10); wall clock allows 2-3.
    expect(polls).toBeLessThanOrEqual(3);
    expect(clock.now()).toBeLessThan(100 + 40 + 10);
  });

  it('every poll gets a timeout capped to the remaining deadline', async () => {
    const clock = fakeClock();
    const { fn } = mockApi({
      ...BASE_ROUTES, ...start,
      'GET /pulls/p-uuid/runs': () => { clock.advance(30); return [{ run_id: 'run1', status: 'running' }]; },
    });
    const spy = vi.spyOn(AbortSignal, 'timeout');
    await runAgentOnPr(args, { now: clock.now, sleep: clock.sleep, pollIntervalMs: 10, timeoutMs: 100, requestTimeoutMs: 15_000 });
    const runsCalls = fn.mock.calls.filter(([u]) => String(u).endsWith('/runs')).length;
    expect(runsCalls).toBeGreaterThan(1);
    const ms = spy.mock.calls.map(([m]) => m);
    expect(ms.every((m) => m <= 100)).toBe(true);
    expect(ms[ms.length - 1]!).toBeLessThan(ms.find((m) => m < 100)! + 1);
    spy.mockRestore();
  });

  it('a hanging poll is aborted at the remaining deadline → still running', async () => {
    vi.stubGlobal('fetch', hangingAfter(['POST /pulls/p-uuid/review']));
    const r = await runTool(() => runAgentOnPr(args, { sleep: async () => {}, timeoutMs: 60, requestTimeoutMs: 15_000 }));
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(text(r))).toMatchObject({ status: 'running', run_id: 'run1' });
  });

  it('a hanging poll that hits its own request timeout before the deadline → unreachable hint', async () => {
    vi.stubGlobal('fetch', hangingAfter(['POST /pulls/p-uuid/review']));
    const r = await runTool(() => runAgentOnPr(args, { sleep: async () => {}, timeoutMs: 5_000, requestTimeoutMs: 30 }));
    expect(r.isError).toBe(true);
    expect(JSON.parse(text(r)).error).toMatch(/^DevDigest API is not reachable/);
  });

  it('a run whose status is null counts as still running, then completes', async () => {
    let polls = 0;
    mockApi({
      ...BASE_ROUTES, ...start,
      'GET /pulls/p-uuid/runs': () => [{ run_id: 'run1', status: ++polls < 2 ? null : 'done', error: null }],
      'GET /pulls/p-uuid/reviews': [review],
    });
    const out = await runAgentOnPr(args, fastClock());
    expect(out).toMatchObject({ status: 'done', run_id: 'run1' });
    expect(polls).toBe(2);
  });

  it('a null-status run that never settles → still running, not bad_response', async () => {
    mockApi({ ...BASE_ROUTES, ...start, 'GET /pulls/p-uuid/runs': [{ run_id: 'run1', status: null }, { run_id: 'x', status: null, agent_name: null }] });
    const r = await runTool(() => runAgentOnPr(args, fastClock()));
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(text(r))).toMatchObject({ status: 'running' });
  });

  it('a review row with null agent fields does not break the poll', async () => {
    mockApi({
      ...BASE_ROUTES, ...start,
      'GET /pulls/p-uuid/runs': [{ run_id: 'run1', status: 'done' }],
      'GET /pulls/p-uuid/reviews': [{ ...review, run_id: 'old', agent_id: null, agent_name: null }, review],
    });
    expect(await runAgentOnPr(args, fastClock())).toMatchObject({ status: 'done', run_id: 'run1' });
  });

  it('unknown agent never reaches POST /review', async () => {
    const { calls } = mockApi({ ...BASE_ROUTES, ...start });
    const r = await runTool(() => runAgentOnPr({ pr_number: 12, agent: 'ghost' }, fast));
    expect(JSON.parse(text(r))).toMatchObject({ error: 'Agent not found.', requested_agent: 'ghost' });
    expect(calls).not.toContain('POST /pulls/p-uuid/review');
  });

  it('429 from the API → rate-limit hint', async () => {
    mockApi({ ...BASE_ROUTES, 'POST /pulls/p-uuid/review': { status: 429, json: { error: { code: 'rate_limited', message: 'x' } } } });
    expect(JSON.parse(text(await runTool(() => runAgentOnPr(args, fast)))).error).toMatch(/^Rate limited/);
  });
});
