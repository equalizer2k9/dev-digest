import { describe, it, expect } from 'vitest';
import type { GroupMember, Severity } from '@devdigest/shared';
import { SIMILARITY_THRESHOLD } from './constants.js';
import { groupFindings, rangesOverlap, titleSimilarity, titleWords } from './grouping.js';

let seq = 0;
function member(
  runId: string,
  over: Partial<GroupMember> & { title: string; id?: string },
): GroupMember {
  seq += 1;
  return {
    id: `f${seq}`,
    severity: 'WARNING' as Severity,
    category: 'bug',
    file: 'a.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'rev',
    accepted_at: null,
    dismissed_at: null,
    ...over,
    run_id: runId,
  } as GroupMember;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

describe('titleWords / titleSimilarity', () => {
  it('titleWords lower-cases, splits on non letter/digit, drops empties', () => {
    expect([...titleWords('SSRF: fetch(url)!')].sort()).toEqual(['fetch', 'ssrf', 'url']);
    expect(titleWords('  --  ').size).toBe(0);
    expect([...titleWords('Привіт, світ')].sort()).toEqual(['привіт', 'світ']);
  });

  it('titleSimilarity is the Jaccard index and 0 for two empty titles', () => {
    expect(titleSimilarity('a b', 'a b')).toBe(1);
    expect(titleSimilarity('a b c', 'b c d')).toBeCloseTo(2 / 4);
    expect(titleSimilarity('a', 'b')).toBe(0);
    expect(titleSimilarity('!!', '??')).toBe(0);
  });

  it('SIMILARITY_THRESHOLD is 0.3', () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.3);
  });
});

describe('rangesOverlap', () => {
  it('touching ranges 10–12 and 12–14 overlap; 10–12 and 13–14 do not', () => {
    expect(rangesOverlap({ start_line: 10, end_line: 12 }, { start_line: 12, end_line: 14 })).toBe(true);
    expect(rangesOverlap({ start_line: 10, end_line: 12 }, { start_line: 13, end_line: 14 })).toBe(false);
  });

  it('a finding without end_line covers only start_line (EC-9)', () => {
    const none = { start_line: 5, end_line: null };
    expect(rangesOverlap(none, { start_line: 5, end_line: 9 })).toBe(true);
    expect(rangesOverlap(none, { start_line: 6, end_line: 9 })).toBe(false);
    expect(rangesOverlap(none, { start_line: 5, end_line: undefined })).toBe(true);
  });
});

describe('groupFindings', () => {
  it('same file, overlapping lines, similar titles from two agents → one group', () => {
    const a = member('r1', { title: 'SQL injection in query builder' });
    const b = member('r2', { title: 'SQL injection in query' });
    const groups = groupFindings([
      { runId: 'r1', findings: [a] },
      { runId: 'r2', findings: [b] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.id)).toEqual([a.id, b.id]);
  });

  it('same file, overlapping lines 153–188, titles "unfinished review" vs "SSRF in fetch" → two groups (EC-7)', () => {
    const a = member('r1', { title: 'unfinished review', start_line: 153, end_line: 188 });
    const b = member('r2', { title: 'SSRF in fetch', start_line: 153, end_line: 188 });
    expect(
      groupFindings([
        { runId: 'r1', findings: [a] },
        { runId: 'r2', findings: [b] },
      ]),
    ).toHaveLength(2);
  });

  it('different files never group whatever the title (A-4)', () => {
    const a = member('r1', { title: 'same title', file: 'a.ts' });
    const b = member('r2', { title: 'same title', file: 'b.ts' });
    expect(
      groupFindings([
        { runId: 'r1', findings: [a] },
        { runId: 'r2', findings: [b] },
      ]),
    ).toHaveLength(2);
  });

  it('two matching findings of the same agent never share a group (EC-8)', () => {
    const a = member('r1', { title: 'null deref here' });
    const b = member('r1', { title: 'null deref here' });
    expect(groupFindings([{ runId: 'r1', findings: [a, b] }])).toHaveLength(2);
  });

  it('single-link: C joins the group via its match with B even though C does not match A', () => {
    // A~B share "alpha beta"; B~C share "gamma delta"; A and C share nothing.
    const a = member('r1', { title: 'alpha beta x1 x2' });
    const b = member('r2', { title: 'alpha beta gamma delta' });
    const c = member('r3', { title: 'gamma delta y1 y2' });
    expect(titleSimilarity(a.title, c.title)).toBe(0);
    expect(titleSimilarity(a.title, b.title)).toBeGreaterThanOrEqual(0.3);
    expect(titleSimilarity(b.title, c.title)).toBeGreaterThanOrEqual(0.3);
    const groups = groupFindings([
      { runId: 'r1', findings: [a] },
      { runId: 'r2', findings: [b] },
      { runId: 'r3', findings: [c] },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members).toHaveLength(3);
  });

  it('a finding joins the first eligible group in input order', () => {
    const a1 = member('r1', { title: 'leak token' });
    const a2 = member('r1', { title: 'leak token' });
    const b = member('r2', { title: 'leak token' });
    const groups = groupFindings([
      { runId: 'r1', findings: [a1, a2] },
      { runId: 'r2', findings: [b] },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.members.map((m) => m.id)).toEqual([a1.id, b.id]);
    expect(groups[1]!.members.map((m) => m.id)).toEqual([a2.id]);
  });

  it('representative is the highest severity; a tie keeps the first in input order', () => {
    const a = member('r1', { title: 'leak token', severity: 'SUGGESTION' });
    const b = member('r2', { title: 'leak token', severity: 'CRITICAL' });
    const c = member('r3', { title: 'leak token', severity: 'CRITICAL' });
    const [g] = groupFindings([
      { runId: 'r1', findings: [a] },
      { runId: 'r2', findings: [b] },
      { runId: 'r3', findings: [c] },
    ]);
    expect(g!.representative.id).toBe(b.id);
  });

  it('input arrays are not mutated', () => {
    const input = deepFreeze([
      { runId: 'r1', findings: [member('r1', { title: 'leak token' })] },
      { runId: 'r2', findings: [member('r2', { title: 'leak token' })] },
    ]);
    expect(() => groupFindings(input)).not.toThrow();
  });

  it('deterministic: the same input twice gives deep-equal output', () => {
    const input = [
      { runId: 'r1', findings: [member('r1', { title: 'leak token' }), member('r1', { title: 'other' })] },
      { runId: 'r2', findings: [member('r2', { title: 'leak token' })] },
    ];
    expect(groupFindings(input)).toEqual(groupFindings(input));
  });
});
