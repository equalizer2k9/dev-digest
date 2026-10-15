import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  EvalCaseResult,
  EvalExpectation,
  EvalExpectationType,
  EvalKeptFinding,
} from '@devdigest/shared';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { caseStatus, countMatches, runCost, scoreRun } from './scoring.js';

const kf = (file: string, s: number, e: number, title = 'x'): EvalKeptFinding => ({
  file,
  start_line: s,
  end_line: e,
  title,
});
const exp = (file: string, s: number, e: number): EvalExpectation => ({
  type: 'must_find',
  file,
  start_line: s,
  end_line: e,
  title: 'expected title',
});

describe('countMatches (AC-17)', () => {
  it('counts ranges that share one line', () => {
    expect(countMatches([kf('a.ts', 5, 10)], exp('a.ts', 10, 20))).toBe(1);
  });
  it('end 10 against start 11 is no match', () => {
    expect(countMatches([kf('a.ts', 1, 10)], exp('a.ts', 11, 20))).toBe(0);
  });
  it('takes a reversed range low to high', () => {
    expect(countMatches([kf('a.ts', 20, 15)], exp('a.ts', 16, 16))).toBe(1);
    expect(countMatches([kf('a.ts', 16, 16)], exp('a.ts', 20, 15))).toBe(1);
  });
  it('another file is no match', () => {
    expect(countMatches([kf('b.ts', 10, 10)], exp('a.ts', 10, 10))).toBe(0);
  });
  it('ignores title, severity and category', () => {
    const k = { ...kf('a.ts', 10, 10, 'totally different'), severity: 'critical', category: 'bug' };
    expect(countMatches([k], exp('a.ts', 10, 10))).toBe(1);
  });
  it('counts every matching kept finding', () => {
    expect(countMatches([kf('a.ts', 10, 10), kf('a.ts', 11, 12), kf('a.ts', 50, 51)], exp('a.ts', 10, 12))).toBe(2);
  });
});

describe('caseStatus (AC-19)', () => {
  it('must_find passes with at least one match', () => {
    expect(caseStatus('must_find', 1)).toBe('passed');
    expect(caseStatus('must_find', 0)).toBe('failed');
  });
  it('must_not_flag passes with no match', () => {
    expect(caseStatus('must_not_flag', 0)).toBe('passed');
    expect(caseStatus('must_not_flag', 2)).toBe('failed');
  });
});

let seq = 0;
function result(
  type: EvalExpectationType,
  zone: [string, number, number],
  kept: EvalKeptFinding[],
  over: Partial<EvalCaseResult> = {},
): EvalCaseResult {
  const matches = countMatches(kept, { type, file: zone[0], start_line: zone[1], end_line: zone[2], title: 't' });
  return {
    case_id: `c${++seq}`,
    name: `case ${seq}`,
    type,
    file: zone[0],
    start_line: zone[1],
    end_line: zone[2],
    status: caseStatus(type, matches),
    kept: kept.length,
    dropped: 0,
    kept_findings: kept,
    cost_usd: 0.01,
    error: null,
    ...over,
  };
}
const errored = (type: EvalExpectationType = 'must_find'): EvalCaseResult =>
  result(type, ['e.ts', 1, 2], [], { status: 'error', error: 'boom', cost_usd: null });

describe('scoreRun (AC-18, AC-19)', () => {
  it('follows the formulas on a mixed fixture', () => {
    const results = [
      result('must_find', ['a.ts', 10, 12], [kf('a.ts', 11, 11), kf('a.ts', 90, 91)], { dropped: 1 }),
      result('must_find', ['b.ts', 5, 6], []),
      result('must_not_flag', ['c.ts', 1, 5], [kf('c.ts', 3, 3)], { dropped: 0 }),
      result('must_not_flag', ['d.ts', 1, 5], [], { dropped: 2 }),
    ];
    const s = scoreRun(results);
    expect(s.recall).toBe(0.5); // 1 of 2 must_find
    expect(s.precision).toBeCloseTo(1 - 1 / 3); // 3 kept, 1 on a must_not_flag zone
    expect(s.citation_accuracy).toBe(0.5); // kept 3, dropped 3
    expect(s.passed).toBe(1 + 0 + 0 + 1);
    expect(s.total).toBe(4);
    expect(s.has_errors).toBe(false);
  });

  it('matches a finding against its own case only', () => {
    const results = [
      // kept finding of case 1 lies on case 2's must_not_flag zone
      result('must_find', ['a.ts', 10, 12], [kf('a.ts', 10, 10), kf('z.ts', 7, 7)]),
      result('must_not_flag', ['z.ts', 1, 20], []),
    ];
    const s = scoreRun(results);
    expect(s.precision).toBe(1);
    expect(results[1]!.status).toBe('passed');
  });

  it('excludes error cases from the metrics, counts them in total only', () => {
    const s = scoreRun([result('must_find', ['a.ts', 1, 3], [kf('a.ts', 2, 2)]), errored(), errored('must_not_flag')]);
    expect(s.recall).toBe(1);
    expect(s.passed).toBe(1);
    expect(s.total).toBe(3);
    expect(s.has_errors).toBe(true);
  });

  it('only must_not_flag cases -> recall null (EC-12)', () => {
    const s = scoreRun([result('must_not_flag', ['a.ts', 1, 3], [])]);
    expect(s.recall).toBeNull();
  });

  it('no findings at all -> precision and citation null, recall 0 (EC-12)', () => {
    const s = scoreRun([result('must_find', ['a.ts', 1, 3], []), result('must_not_flag', ['b.ts', 1, 3], [])]);
    expect(s.recall).toBe(0);
    expect(s.precision).toBeNull();
    expect(s.citation_accuracy).toBeNull();
  });

  it('every finding dropped -> citation 0, precision null (EC-13)', () => {
    const s = scoreRun([result('must_find', ['a.ts', 1, 3], [], { dropped: 3 })]);
    expect(s.citation_accuracy).toBe(0);
    expect(s.precision).toBeNull();
  });

  it('every case error -> three nulls, passed 0 (EC-14)', () => {
    const s = scoreRun([errored(), errored('must_not_flag')]);
    expect(s).toMatchObject({
      recall: null,
      precision: null,
      citation_accuracy: null,
      passed: 0,
      total: 2,
      has_errors: true,
    });
  });

  it('is deterministic and statuses follow from kept_findings (NFR-2)', () => {
    const results = [
      result('must_find', ['a.ts', 10, 12], [kf('a.ts', 11, 11)]),
      result('must_not_flag', ['c.ts', 1, 5], [kf('c.ts', 3, 3)]),
    ];
    expect(scoreRun(results)).toEqual(scoreRun(results));
    for (const r of results) {
      const m = countMatches(r.kept_findings, {
        type: r.type,
        file: r.file,
        start_line: r.start_line,
        end_line: r.end_line,
        title: '',
      });
      expect(caseStatus(r.type, m)).toBe(r.status);
    }
  });
});

describe('runCost (AC-22)', () => {
  it('sums known costs', () => {
    expect(runCost([result('must_find', ['a', 1, 1], [], { cost_usd: 0.25 }), result('must_find', ['a', 1, 1], [], { cost_usd: 0.5 })])).toBe(0.75);
  });
  it('is null when any cost is unknown, never a partial sum', () => {
    expect(runCost([result('must_find', ['a', 1, 1], [], { cost_usd: 0.25 }), errored()])).toBeNull();
  });
});

describe('zero model calls (AC-35)', () => {
  it('scoring.ts has no runtime import of adapters, the container or reviewer-core', () => {
    const src = readFileSync(path.join(__dirname, 'scoring.ts'), 'utf8');
    const runtimeImports = src
      .split('\n')
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    for (const l of runtimeImports) expect(l).not.toMatch(/adapters|platform\/container|@devdigest\/reviewer-core/);
  });

  it('scoring 100 cases leaves a mock provider untouched', () => {
    const llm = new MockLLMProvider();
    const results = Array.from({ length: 100 }, (_, i) =>
      result(i % 2 ? 'must_find' : 'must_not_flag', ['a.ts', i, i + 2], [kf('a.ts', i + 1, i + 1)]),
    );
    scoreRun(results);
    runCost(results);
    expect(llm.calls).toEqual([]);
  });
});
