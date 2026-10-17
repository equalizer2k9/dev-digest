import { describe, it, expect } from 'vitest';
import { DAY_MS } from './constants.js';
import { isCountedRun, resolvePeriod, type PerfRunRow } from './helpers.js';

const NOW = new Date('2026-10-17T12:00:00Z');
const WS = 'w1';

describe('resolvePeriod (AC-3)', () => {
  it('defaults to the last 30 days', () => {
    const p = resolvePeriod({ period: '30d' }, NOW);
    expect(p.preset).toBe('30d');
    expect(p.from.getTime()).toBe(NOW.getTime() - 30 * DAY_MS);
    expect(p.to.getTime()).toBe(NOW.getTime());
  });

  it('1d is the last 24 hours', () => {
    const p = resolvePeriod({ period: '1d' }, NOW);
    expect(p.from.getTime()).toBe(NOW.getTime() - DAY_MS);
    expect(p.to.getTime()).toBe(NOW.getTime());
  });

  it('custom runs from 00:00Z of from to 00:00Z after to', () => {
    const p = resolvePeriod({ period: 'custom', from: '2026-10-01', to: '2026-10-10' }, NOW);
    expect(p.preset).toBe('custom');
    expect(p.from.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-10-11T00:00:00.000Z');
  });

  it('custom with from = to is exactly one day', () => {
    const p = resolvePeriod({ period: 'custom', from: '2026-10-01', to: '2026-10-01' }, NOW);
    expect(p.to.getTime() - p.from.getTime()).toBe(DAY_MS);
  });
});

const period = {
  preset: 'custom' as const,
  from: new Date('2026-10-01T00:00:00Z'),
  to: new Date('2026-10-11T00:00:00Z'),
};
const run = (over: Partial<PerfRunRow> = {}): PerfRunRow => ({
  id: 'r',
  workspaceId: WS,
  agentId: 'a',
  status: 'done',
  source: 'local',
  ranAt: new Date('2026-10-05T00:00:00Z'),
  model: 'm',
  durationMs: 1,
  costUsd: 1,
  accepted: 0,
  dismissed: 0,
  pending: 0,
  critical: 0,
  warning: 0,
  suggestion: 0,
  ...over,
});

describe('isCountedRun (AC-2, EC-11)', () => {
  it('counts a run at from, not at to, not 1 ms before from', () => {
    expect(isCountedRun(run({ ranAt: period.from }), WS, period)).toBe(true);
    expect(isCountedRun(run({ ranAt: period.to }), WS, period)).toBe(false);
    expect(isCountedRun(run({ ranAt: new Date(period.from.getTime() - 1) }), WS, period)).toBe(false);
  });

  it('counts done and failed only', () => {
    expect(isCountedRun(run({ status: 'done' }), WS, period)).toBe(true);
    expect(isCountedRun(run({ status: 'failed' }), WS, period)).toBe(true);
    expect(isCountedRun(run({ status: 'running' }), WS, period)).toBe(false);
    expect(isCountedRun(run({ status: 'cancelled' }), WS, period)).toBe(false);
    expect(isCountedRun(run({ status: null }), WS, period)).toBe(false);
  });

  it('rejects another workspace', () => {
    expect(isCountedRun(run({ workspaceId: 'w2' }), WS, period)).toBe(false);
  });

  it('counts local and ci sources', () => {
    expect(isCountedRun(run({ source: 'local' }), WS, period)).toBe(true);
    expect(isCountedRun(run({ source: 'ci' }), WS, period)).toBe(true);
  });
});
