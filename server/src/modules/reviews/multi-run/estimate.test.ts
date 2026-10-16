import { describe, it, expect } from 'vitest';
import { estimateAgent } from './estimate.js';

describe('estimateAgent', () => {
  it('mean duration and mean cost of the given finished runs', () => {
    expect(
      estimateAgent([
        { durationMs: 1000, costUsd: 0.1 },
        { durationMs: 3000, costUsd: 0.3 },
      ]),
    ).toEqual({ duration_ms: 2000, cost_usd: 0.2, runs: 2 });
  });

  it('uses only the 10 newest rows when given 12', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => ({ durationMs: 100, costUsd: 1 })),
      { durationMs: 99999, costUsd: 99 },
      { durationMs: 99999, costUsd: 99 },
    ];
    expect(estimateAgent(rows)).toEqual({ duration_ms: 100, cost_usd: 1, runs: 10 });
  });

  it('mean cost ignores rows with unknown cost (A-6)', () => {
    const e = estimateAgent([
      { durationMs: 10, costUsd: 0.2 },
      { durationMs: 10, costUsd: null },
    ]);
    expect(e.cost_usd).toBeCloseTo(0.2);
    expect(e.runs).toBe(2);
  });

  it('no rows → both null ("—", EC-15)', () => {
    expect(estimateAgent([])).toEqual({ duration_ms: null, cost_usd: null, runs: 0 });
  });

  it('every cost unknown → cost null, duration still a mean (EC-15)', () => {
    expect(
      estimateAgent([
        { durationMs: 10, costUsd: null },
        { durationMs: 30, costUsd: null },
      ]),
    ).toEqual({ duration_ms: 20, cost_usd: null, runs: 2 });
  });
});
