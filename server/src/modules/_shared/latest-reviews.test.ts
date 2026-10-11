import { describe, it, expect } from 'vitest';
import { latestReviewPerAgent } from './latest-reviews.js';

let seq = 0;
const rv = (prId: string, agentId: string | null, minute: number) => ({
  id: `r${seq++}`,
  prId,
  agentId,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
});
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('latestReviewPerAgent', () => {
  it('keeps only the newer of two reviews by one agent', () => {
    const older = rv('p1', 'a1', 1);
    const newer = rv('p1', 'a1', 2);
    expect(latestReviewPerAgent([older, newer])).toEqual([newer]);
  });

  it('keeps one review per agent when two agents reviewed', () => {
    const a = rv('p1', 'a1', 1);
    const b = rv('p1', 'a2', 2);
    expect(ids(latestReviewPerAgent([a, b]))).toEqual(ids([a, b]));
  });

  it('keeps PRs apart', () => {
    const p1 = rv('p1', 'a1', 1);
    const p2 = rv('p2', 'a1', 2);
    expect(ids(latestReviewPerAgent([p1, p2]))).toEqual(ids([p1, p2]));
  });

  it('shares one key per PR for reviews without an agent', () => {
    const older = rv('p1', null, 1);
    const newer = rv('p1', null, 2);
    const other = rv('p2', null, 1);
    expect(ids(latestReviewPerAgent([older, newer, other]))).toEqual(ids([newer, other]));
  });

  it('does not rely on the caller order', () => {
    const oldest = rv('p1', 'a1', 1);
    const middle = rv('p1', 'a1', 2);
    const newest = rv('p1', 'a1', 3);
    expect(latestReviewPerAgent([middle, newest, oldest])).toEqual([newest]);
    expect(latestReviewPerAgent([oldest, newest, middle])).toEqual([newest]);
  });

  it('returns nothing for no reviews', () => {
    expect(latestReviewPerAgent([])).toEqual([]);
  });
});
