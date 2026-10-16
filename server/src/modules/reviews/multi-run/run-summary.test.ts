import { describe, it, expect } from 'vitest';
import { isInProgress, multiRunStatus, usageTotals, wallClockMs } from './run-summary.js';

const t0 = new Date('2026-01-01T00:00:00Z');
const at = (s: number) => new Date(t0.getTime() + s * 1000);

describe('multiRunStatus', () => {
  it('running while any run is queued/running/null', () => {
    for (const s of ['queued', 'running', null]) {
      expect(multiRunStatus(['done', s])).toBe('running');
    }
    expect(isInProgress('done')).toBe(false);
    expect(isInProgress(null)).toBe(true);
  });

  it('failed when every run is failed or cancelled (EC-4)', () => {
    expect(multiRunStatus(['failed', 'cancelled', 'failed'])).toBe('failed');
  });

  it('done otherwise (mixed done + failed)', () => {
    expect(multiRunStatus(['done', 'failed'])).toBe('done');
    expect(multiRunStatus(['done', 'done'])).toBe('done');
  });
});

describe('usageTotals', () => {
  it('totals add known tokens and costs; unknown cost adds nothing; all unknown → null', () => {
    expect(
      usageTotals([
        { tokensIn: 10, tokensOut: 5, costUsd: 0.5 },
        { tokensIn: null, tokensOut: 1, costUsd: null },
        { tokensIn: 2, tokensOut: null, costUsd: 0.25 },
      ]),
    ).toEqual({ tokens_in: 12, tokens_out: 6, cost_usd: 0.75 });
    expect(usageTotals([{ tokensIn: null, tokensOut: null, costUsd: null }])).toEqual({
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null,
    });
  });
});

describe('wallClockMs', () => {
  it('wall-clock is null while in progress', () => {
    expect(
      wallClockMs(t0, [
        { status: 'done', finishedAt: at(5) },
        { status: 'running', finishedAt: null },
      ]),
    ).toBeNull();
  });

  it('wall-clock = latest finish − start', () => {
    expect(
      wallClockMs(t0, [
        { status: 'done', finishedAt: at(5) },
        { status: 'failed', finishedAt: at(9) },
      ]),
    ).toBe(9000);
  });
});
