import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { MockAuthProvider, MockLLMProvider } from '../../adapters/mocks.js';
import { loadConfig } from '../../platform/config.js';
import type { PerfRunRow } from './helpers.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const WS = 'w1';

const run = (over: Partial<PerfRunRow>): PerfRunRow => ({
  id: Math.random().toString(36),
  workspaceId: WS,
  agentId: A,
  status: 'done',
  source: 'local',
  ranAt: new Date('2026-10-05T00:00:00Z'),
  model: 'gpt-4.1',
  durationMs: 1200,
  costUsd: 0.25,
  accepted: 0,
  dismissed: 0,
  pending: 0,
  critical: 0,
  warning: 0,
  suggestion: 0,
  ...over,
});

const fixture = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('./repository.js', () => ({
  AgentPerformanceRepository: class {
    runsInPeriod = async () => fixture.rows;
  },
}));

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const m1 = new MockLLMProvider('openai');
const m2 = new MockLLMProvider('anthropic');
const m3 = new MockLLMProvider('openai');

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  fixture.rows = [
    run({ accepted: 3, dismissed: 1, pending: 2, critical: 1, warning: 3 }),
    run({ costUsd: null, model: null, accepted: 1, ranAt: new Date('2026-10-07T00:00:00Z') }),
    run({ status: 'failed', costUsd: 0.1, durationMs: null }),
    run({ model: 'claude', costUsd: 0.4, dismissed: 2 }),
    run({ agentId: B, source: 'ci', costUsd: 0.7 }),
    run({ agentId: null, costUsd: 0.2 }),
    run({ status: 'running', costUsd: 5, accepted: 9 }),
  ];
  app = await buildApp({
    config,
    overrides: {
      auth: new MockAuthProvider(),
      llm: { openai: m1, anthropic: m2, openrouter: m3 },
    },
  });
  const agents = [
    { id: A, name: 'Alpha' },
    { id: B, name: 'Beta' },
    { id: C, name: 'Gamma' },
  ];
  vi.spyOn(app.container.agentsRepo, 'list').mockResolvedValue(agents as never);
  vi.spyOn(app.container.agentsRepo, 'getById').mockImplementation((async (_ws: string, id: string) =>
    agents.find((a) => a.id === id)) as never);
});
afterAll(async () => {
  await app.close();
});

describe('agent-performance routes (no DB)', () => {
  it("GET /agents/:id/stats equals that agent's row of GET /agent-performance for the same period, and no model adapter is called", async () => {
    const q = 'period=custom&from=2026-10-01&to=2026-10-10';
    const dash = await app.inject({ method: 'GET', url: `/agent-performance?${q}` });
    const stats = await app.inject({ method: 'GET', url: `/agents/${A}/stats?${q}` });
    expect(dash.statusCode).toBe(200);
    expect(stats.statusCode).toBe(200);

    const perf = dash.json();
    const row = perf.rows.find((r: { agent_id: string }) => r.agent_id === A);
    const { agent_id, agent_name, period, ...statsRest } = stats.json();
    const { agent_id: _i, agent_name: _n, ...rowRest } = row;
    expect(agent_id).toBe(A);
    expect(agent_name).toBe('Alpha');
    expect(period).toEqual(perf.period);
    expect(statsRest).toEqual(rowRest);
    expect(rowRest.runs).toBe(4);

    expect(m1.calls).toEqual([]);
    expect(m2.calls).toEqual([]);
    expect(m3.calls).toEqual([]);
  });
});
