/**
 * SPEC-06 contracts: PerfPeriodQuery rules, nullable metrics, row type for the
 * Deleted agent, and byte parity of the two `observability.ts` copies.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AgentPerformanceRow, AgentStats, PerfPeriodQuery } from '@devdigest/shared';

const emptyBreakdown = { lines: [], unpriced_runs: 0 };
const period = { preset: '30d', from: '2026-09-17T12:00:00.000Z', to: '2026-10-17T12:00:00.000Z' };

const metrics = {
  runs: 0,
  priced_runs: 0,
  unpriced_runs: 0,
  findings_total: 0,
  accepted: 0,
  dismissed: 0,
  pending: 0,
  decided: 0,
  accept_rate: null,
  dismiss_rate: null,
  low_sample: true,
  avg_findings_per_run: null,
  total_cost_usd: null,
  avg_cost_usd: null,
  avg_latency_ms: null,
  last_run_at: null,
  findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  trend: [],
  by_model: emptyBreakdown,
};

describe('PerfPeriodQuery', () => {
  it('accepts {}, a preset, and a one-day custom range', () => {
    expect(PerfPeriodQuery.safeParse({}).success).toBe(true);
    expect(PerfPeriodQuery.parse({}).period).toBe('30d');
    expect(PerfPeriodQuery.safeParse({ period: '1d' }).success).toBe(true);
    expect(
      PerfPeriodQuery.safeParse({ period: 'custom', from: '2026-10-01', to: '2026-10-01' }).success,
    ).toBe(true);
  });

  it.each([
    ['custom without to', { period: 'custom', from: '2026-10-01' }],
    ['custom without from', { period: 'custom', to: '2026-10-01' }],
    ['from > to', { period: 'custom', from: '2026-10-05', to: '2026-10-01' }],
    ['impossible date', { period: 'custom', from: '2026-02-30', to: '2026-03-01' }],
    ['wrong format', { period: 'custom', from: '10/01/2026', to: '2026-10-02' }],
    ['preset with from', { period: '30d', from: '2026-10-01' }],
    ['absent period with dates', { from: '2026-10-01', to: '2026-10-02' }],
    ['unknown preset', { period: '7d' }],
  ])('rejects %s', (_n, q) => {
    expect(PerfPeriodQuery.safeParse(q).success).toBe(false);
  });
});

describe('AgentStats / AgentPerformanceRow', () => {
  it('AgentStats parses with every nullable metric null', () => {
    const r = AgentStats.safeParse({ agent_id: 'a', agent_name: 'A', period, ...metrics });
    expect(r.success).toBe(true);
  });

  it('AgentPerformanceRow accepts agent_id: null (Deleted agent)', () => {
    const r = AgentPerformanceRow.safeParse({ agent_id: null, agent_name: null, ...metrics });
    expect(r.success).toBe(true);
  });
});

describe('parity', () => {
  it('contracts/observability.ts is byte-identical in both copies', () => {
    const root = path.resolve(__dirname, '../..');
    const rel = 'src/vendor/shared/contracts/observability.ts';
    const server = readFileSync(path.join(root, 'server', rel));
    const client = readFileSync(path.join(root, 'client', rel));
    expect(client.equals(server)).toBe(true);
  });
});
