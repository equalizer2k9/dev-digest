import { describe, it, expect } from 'vitest';
import type { AgentPerformanceRow } from '@devdigest/shared';
import { aggregatePerformance, toAgentStats, type PerfRunRow } from './helpers.js';

const WS = 'w1';
const period = {
  preset: 'custom' as const,
  from: new Date('2026-10-01T00:00:00Z'),
  to: new Date('2026-10-11T00:00:00Z'),
};
const A = { id: 'a', name: 'Alpha' };
const B = { id: 'b', name: 'Beta' };
const C = { id: 'c', name: 'Gamma' };

let seq = 0;
const run = (over: Partial<PerfRunRow> = {}): PerfRunRow => ({
  id: `r${++seq}`,
  workspaceId: WS,
  agentId: 'a',
  status: 'done',
  source: 'local',
  ranAt: new Date('2026-10-05T00:00:00Z'),
  model: 'gpt',
  durationMs: 1000,
  costUsd: 0.1,
  accepted: 0,
  dismissed: 0,
  pending: 0,
  critical: 0,
  warning: 0,
  suggestion: 0,
  ...over,
});

const agg = (runs: PerfRunRow[], agents = [A, B, C]) =>
  aggregatePerformance({ workspaceId: WS, period, runs, agents });
const rowOf = (perf: ReturnType<typeof agg>, id: string | null) =>
  perf.rows.find((r) => r.agent_id === id)!;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('aggregatePerformance', () => {
  it('AC-1: toAgentStats equals the agent row', () => {
    const perf = agg([
      run({ agentId: 'a', accepted: 3, dismissed: 1, costUsd: 0.5 }),
      run({ agentId: 'b', costUsd: null }),
    ]);
    for (const a of [A, B, C]) {
      const stats = toAgentStats(perf, a);
      const { agent_id, agent_name, period: p, ...rest } = stats;
      const { agent_id: rid, agent_name: rname, ...rowRest } = rowOf(perf, a.id);
      expect(agent_id).toBe(a.id);
      expect(agent_name).toBe(a.name);
      expect(rid).toBe(a.id);
      expect(rname).toBe(a.name);
      expect(p).toEqual(perf.period);
      expect(rest).toEqual(rowRest);
    }
  });

  it('AC-2: running, cancelled, foreign and out-of-period runs add nothing', () => {
    const perf = agg([
      run({ costUsd: 1, accepted: 1 }),
      run({ status: 'running', costUsd: 10, accepted: 10 }),
      run({ status: 'cancelled', costUsd: 10, accepted: 10 }),
      run({ workspaceId: 'w2', costUsd: 10, accepted: 10 }),
      run({ ranAt: new Date('2026-10-11T00:00:00Z'), costUsd: 10, accepted: 10 }),
    ]);
    const a = rowOf(perf, 'a');
    expect(a.runs).toBe(1);
    expect(a.total_cost_usd).toBeCloseTo(1, 9);
    expect(a.accepted).toBe(1);
    expect(perf.totals.runs).toBe(1);
  });

  it('AC-4: averages only over priced / timed runs', () => {
    const perf = agg([
      run({ costUsd: 0.2, durationMs: 1000 }),
      run({ costUsd: 0.4, durationMs: null }),
      run({ costUsd: null, durationMs: 3000 }),
    ]);
    const a = rowOf(perf, 'a');
    expect(a.runs).toBe(3);
    expect(a.priced_runs).toBe(2);
    expect(a.unpriced_runs).toBe(1);
    expect(a.total_cost_usd).toBeCloseTo(0.6, 9);
    expect(a.avg_cost_usd).toBeCloseTo(0.3, 9);
    expect(a.avg_latency_ms).toBe(2000);
  });

  it('EC-5: every run unpriced -> null cost, empty breakdowns', () => {
    const perf = agg([run({ costUsd: null }), run({ costUsd: null }), run({ costUsd: null })]);
    const a = rowOf(perf, 'a');
    expect(a.total_cost_usd).toBeNull();
    expect(a.avg_cost_usd).toBeNull();
    expect(perf.totals.total_cost_usd).toBeNull();
    expect(perf.totals.unpriced_runs).toBe(3);
    expect(perf.by_agent).toEqual({ lines: [], unpriced_runs: 3 });
    expect(perf.by_model).toEqual({ lines: [], unpriced_runs: 3 });
  });

  it('AC-4: every duration null -> avg_latency_ms null', () => {
    const perf = agg([run({ durationMs: null }), run({ durationMs: null })]);
    expect(rowOf(perf, 'a').avg_latency_ms).toBeNull();
  });

  it('AC-5: rate excludes pending and reports decided', () => {
    const perf = agg([run({ accepted: 3, dismissed: 1, pending: 5 })]);
    const a = rowOf(perf, 'a');
    expect(a.accept_rate).toBe(0.75);
    expect(a.decided).toBe(4);
    expect(a.pending).toBe(5);
  });

  it('AC-5: only pending -> accept_rate null, decided 0', () => {
    const a = rowOf(agg([run({ pending: 4 })]), 'a');
    expect(a.accept_rate).toBeNull();
    expect(a.decided).toBe(0);
  });

  it('EC-1: a CI-only agent has no rate, is low sample, but runs/cost/duration count', () => {
    const a = rowOf(agg([run({ source: 'ci', costUsd: 0.3, durationMs: 500 })]), 'a');
    expect(a.accept_rate).toBeNull();
    expect(a.low_sample).toBe(true);
    expect(a.runs).toBe(1);
    expect(a.total_cost_usd).toBeCloseTo(0.3, 9);
    expect(a.avg_latency_ms).toBe(500);
  });

  it('AC-5: totals accept_rate is pooled, not a mean of agent rates', () => {
    const perf = agg([
      run({ agentId: 'a', accepted: 1, dismissed: 0 }), // rate 1
      run({ agentId: 'b', accepted: 1, dismissed: 3 }), // rate .25
    ]);
    expect(perf.totals.accepted).toBe(2);
    expect(perf.totals.dismissed).toBe(3);
    expect(perf.totals.decided).toBe(5);
    expect(perf.totals.accept_rate).toBeCloseTo(0.4, 9);
  });

  it('AC-6: low_sample below 5 decisions, not at 5', () => {
    expect(rowOf(agg([run({ accepted: 3, dismissed: 1 })]), 'a').low_sample).toBe(true);
    expect(rowOf(agg([run({ accepted: 3, dismissed: 2 })]), 'a').low_sample).toBe(false);
  });

  it('AC-7: tie on runs -> the agent with the later last run', () => {
    const early = new Date('2026-10-02T00:00:00Z');
    const late = new Date('2026-10-09T00:00:00Z');
    const perf = agg([
      ...[1, 2, 3].map(() => run({ agentId: 'a', ranAt: early })),
      ...[1, 2].map(() => run({ agentId: 'b', ranAt: early })),
      run({ agentId: 'b', ranAt: late }),
    ]);
    expect(perf.most_active).toEqual({ agent_id: 'b', agent_name: 'Beta', runs: 3 });
  });

  it('AC-7: the Deleted row is not eligible; only deleted runs -> null (EC-7)', () => {
    const perf = agg([
      run({ agentId: null }),
      run({ agentId: null }),
      run({ agentId: null }),
      run({ agentId: 'a' }),
    ]);
    expect(perf.most_active?.agent_id).toBe('a');
    expect(agg([run({ agentId: null })]).most_active).toBeNull();
  });

  it('AC-8: totals = sum of rows = sum of breakdowns, on float-awkward costs', () => {
    const perf = agg([
      run({ agentId: 'a', model: 'm1', costUsd: 0.1 }),
      run({ agentId: 'a', model: 'm2', costUsd: 0.2 }),
      run({ agentId: 'b', model: 'm1', costUsd: 0.3 }),
      run({ agentId: null, model: null, costUsd: 0.7 }),
      run({ agentId: 'b', model: 'm1', costUsd: null }),
    ]);
    expect(perf.totals.runs).toBe(sum(perf.rows.map((r) => r.runs)));
    expect(perf.rows.some((r) => r.agent_id === null)).toBe(true);
    const total = perf.totals.total_cost_usd!;
    expect(total).toBeCloseTo(1.3, 9);
    expect(sum(perf.rows.map((r) => r.total_cost_usd ?? 0))).toBeCloseTo(total, 9);
    expect(sum(perf.by_agent.lines.map((l) => l.cost_usd))).toBeCloseTo(total, 9);
    expect(sum(perf.by_model.lines.map((l) => l.cost_usd))).toBeCloseTo(total, 9);
    expect(perf.by_agent.unpriced_runs).toBe(perf.totals.unpriced_runs);
    expect(perf.by_model.unpriced_runs).toBe(perf.totals.unpriced_runs);
    for (const r of perf.rows) {
      expect(sum(r.by_model.lines.map((l) => l.cost_usd))).toBeCloseTo(r.total_cost_usd ?? 0, 9);
      expect(r.by_model.unpriced_runs).toBe(r.unpriced_runs);
    }
    // lines sorted by cost descending
    const costs = perf.by_agent.lines.map((l) => l.cost_usd);
    expect(costs).toEqual([...costs].sort((x, y) => y - x));
  });

  it('EC-6: a null model forms one key:null line', () => {
    const perf = agg([run({ model: null, costUsd: 0.2 }), run({ model: null, costUsd: 0.3 })]);
    const lines = perf.by_model.lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: null, label: null, runs: 2 });
  });

  it('AC-9: an agent without counted runs has a row with null metrics', () => {
    const perf = agg([run({ agentId: 'a' })]);
    const c = rowOf(perf, 'c');
    expect(c.runs).toBe(0);
    expect(c.avg_cost_usd).toBeNull();
    expect(c.total_cost_usd).toBeNull();
    expect(c.avg_latency_ms).toBeNull();
    expect(c.accept_rate).toBeNull();
    expect(c.last_run_at).toBeNull();
    expect(c.by_model.lines).toEqual([]);
  });

  it('D9: a run of an unknown agent goes to the Deleted row, placed last', () => {
    const perf = agg([run({ agentId: 'ghost' }), run({ agentId: null })]);
    const rows: AgentPerformanceRow[] = perf.rows;
    expect(rows.map((r) => r.agent_name)).toEqual(['Alpha', 'Beta', 'Gamma', null]);
    expect(rows[3]!.runs).toBe(2);
  });

  it('orders existing agents by name', () => {
    const perf = agg([], [C, A, B]);
    expect(perf.rows.map((r) => r.agent_name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('EC-14: no agents and no runs', () => {
    const perf = agg([], []);
    expect(perf.totals.runs).toBe(0);
    expect(perf.rows).toEqual([]);
    expect(perf.most_active).toBeNull();
    expect(perf.totals.total_cost_usd).toBeNull();
  });

  it('sums severities and sets last_run_at to the latest run', () => {
    const a = rowOf(
      agg([
        run({ critical: 1, warning: 2, suggestion: 3, ranAt: new Date('2026-10-02T00:00:00Z') }),
        run({ critical: 1, ranAt: new Date('2026-10-08T00:00:00Z') }),
      ]),
      'a',
    );
    expect(a.findings_by_severity).toEqual({ CRITICAL: 2, WARNING: 2, SUGGESTION: 3 });
    expect(a.last_run_at).toBe('2026-10-08T00:00:00.000Z');
    expect(a.trend).toEqual([]);
  });
});
