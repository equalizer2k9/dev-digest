import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { EvalCaseResult, EvalRunRecord } from '@devdigest/shared';
import { MAX_DIFF_CELLS } from './constants.js';
import { compareRuns, diffLines, frozenDiff, zonesIntersect, type RunWithResults } from './helpers.js';

const zone = (over: Partial<Parameters<typeof zonesIntersect>[0]> = {}) => ({
  pr_id: 'pr-1',
  file: 'src/a.ts',
  start_line: 10,
  end_line: 20,
  ...over,
});

describe('frozenDiff', () => {
  const patch = '@@ -1,2 +1,3 @@\n a\n+b\n c\n@@ -20,2 +21,3 @@\n x\n+y\n z';

  it('is the git header plus the patch', () => {
    expect(frozenDiff('src/a.ts', patch)).toBe(
      `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n${patch}`,
    );
  });

  it('parses to one file holding every hunk', () => {
    const diff = parseUnifiedDiff(frozenDiff('src/a.ts', patch));
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0]!.path).toBe('src/a.ts');
    expect(diff.files[0]!.hunks).toHaveLength(2);
  });

  it('keeps a 5000-line patch whole', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `+line ${i}`);
    const big = `@@ -0,0 +1,5000 @@\n${lines.join('\n')}`;
    const out = frozenDiff('big.ts', big);
    expect(out.endsWith(big)).toBe(true);
    const diff = parseUnifiedDiff(out);
    expect(diff.files[0]!.additions).toBe(5000);
  });
});

describe('zonesIntersect', () => {
  it('overlapping ranges on the same PR and file intersect', () => {
    expect(zonesIntersect(zone(), zone({ start_line: 15, end_line: 30 }))).toBe(true);
  });
  it('touching ranges intersect', () => {
    expect(zonesIntersect(zone(), zone({ start_line: 20, end_line: 25 }))).toBe(true);
  });
  it('disjoint ranges do not', () => {
    expect(zonesIntersect(zone(), zone({ start_line: 21, end_line: 25 }))).toBe(false);
  });
  it('another PR does not', () => {
    expect(zonesIntersect(zone(), zone({ pr_id: 'pr-2' }))).toBe(false);
  });
  it('another file does not', () => {
    expect(zonesIntersect(zone(), zone({ file: 'src/b.ts' }))).toBe(false);
  });
});

describe('diffLines', () => {
  it('equal texts are all context', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { op: 'context', text: 'a' },
      { op: 'context', text: 'b' },
    ]);
  });
  it('one changed line is a remove plus an add', () => {
    const lines = diffLines('a\nb\nc', 'a\nX\nc');
    expect(lines.filter((l) => l.op === 'remove')).toEqual([{ op: 'remove', text: 'b' }]);
    expect(lines.filter((l) => l.op === 'add')).toEqual([{ op: 'add', text: 'X' }]);
    expect(lines.filter((l) => l.op === 'context')).toHaveLength(2);
  });
  it('AC-27: above MAX_DIFF_CELLS everything is replaced', () => {
    const side = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 1;
    const before = Array.from({ length: side }, (_, i) => `a${i}`).join('\n');
    const after = Array.from({ length: side }, (_, i) => `b${i}`).join('\n');
    const lines = diffLines(before, after);
    expect(lines).toHaveLength(side * 2);
    expect(lines.slice(0, side).every((l) => l.op === 'remove')).toBe(true);
    expect(lines.slice(side).every((l) => l.op === 'add')).toBe(true);
  });
});

const res = (id: string, status: EvalCaseResult['status'], over: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
  case_id: id,
  name: `case ${id}`,
  type: 'must_find',
  file: 'a.ts',
  start_line: 1,
  end_line: 2,
  status,
  kept: 0,
  dropped: 0,
  kept_findings: [],
  cost_usd: null,
  error: null,
  ...over,
});
const run = (
  id: string,
  startedAt: string,
  results: EvalCaseResult[],
  over: Partial<EvalRunRecord> = {},
): RunWithResults => ({
  run: {
    id,
    agent_id: 'ag',
    agent_name: 'Agent',
    agent_version: 1,
    provider: 'openai',
    model: 'm',
    skills: [],
    status: 'completed',
    has_errors: false,
    error: null,
    started_at: startedAt,
    finished_at: startedAt,
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 1,
    passed: 1,
    total: 2,
    cost_usd: 0.01,
    ...over,
  },
  results,
});
const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';

describe('compareRuns', () => {
  const prompts = { 1: 'one\ntwo', 2: 'one\nthree' };

  it('AC-25: ordered by started_at whatever the argument order; delta = later - earlier', () => {
    const early = run('r1', T1, [], { recall: 0.25, cost_usd: 0.01, agent_version: 1 });
    const late = run('r2', T2, [], { recall: 0.75, cost_usd: 0.04, agent_version: 2 });
    for (const [a, b] of [[early, late], [late, early]] as const) {
      const out = compareRuns(a, b, prompts);
      expect(out.earlier.id).toBe('r1');
      expect(out.later.id).toBe('r2');
      expect(out.delta.recall).toBeCloseTo(0.5);
      expect(out.delta.cost_usd).toBeCloseTo(0.03);
      expect(out.delta.precision).toBeCloseTo(0);
    }
  });

  it('AC-25/AC-22: a null metric or cost on either side gives a null delta', () => {
    const a = run('r1', T1, [], { precision: null, cost_usd: null });
    const b = run('r2', T2, [], { recall: null });
    const out = compareRuns(a, b, prompts);
    expect(out.delta.precision).toBeNull();
    expect(out.delta.recall).toBeNull();
    expect(out.delta.cost_usd).toBeNull();
    expect(out.delta.citation_accuracy).toBe(0);
  });

  it('AC-26: changed, added and removed are computed by case_id', () => {
    const a = run('r1', T1, [res('x', 'passed'), res('y', 'passed'), res('gone', 'failed')]);
    const b = run('r2', T2, [res('x', 'passed'), res('y', 'failed'), res('new', 'error')]);
    const out = compareRuns(a, b, prompts);
    expect(out.changed).toEqual([
      { case_id: 'y', name: 'case y', type: 'must_find', file: 'a.ts', start_line: 1, end_line: 2, earlier: 'passed', later: 'failed' },
    ]);
    expect(out.added.map((c) => c.case_id)).toEqual(['new']);
    expect(out.removed.map((c) => c.case_id)).toEqual(['gone']);
  });

  it('EC-21: the same agent version is unchanged', () => {
    const out = compareRuns(run('r1', T1, []), run('r2', T2, []), prompts);
    expect(out.prompt).toEqual({ status: 'unchanged', unavailable_versions: [], lines: [] });
  });

  it('EC-22: a missing snapshot is unavailable and lists that version', () => {
    const a = run('r1', T1, [], { agent_version: 1 });
    const b = run('r2', T2, [], { agent_version: 2 });
    const out = compareRuns(a, b, { 1: null, 2: 'x' });
    expect(out.prompt).toEqual({ status: 'unavailable', unavailable_versions: [1], lines: [] });
  });

  it('AC-27: different prompts are changed with lines', () => {
    const a = run('r1', T1, [], { agent_version: 1 });
    const b = run('r2', T2, [], { agent_version: 2 });
    const out = compareRuns(a, b, prompts);
    expect(out.prompt.status).toBe('changed');
    expect(out.prompt.lines.map((l) => l.op)).toEqual(['context', 'remove', 'add']);
  });

  it('AC-28: skills differ by name and version', () => {
    const a = run('r1', T1, [], { skills: [{ name: 'A', version: 1 }, { name: 'B', version: 1 }] });
    const b = run('r2', T2, [], { skills: [{ name: 'A', version: 2 }, { name: 'B', version: 1 }] });
    const out = compareRuns(a, b, prompts);
    expect(out.skills).toEqual({
      only_earlier: [{ name: 'A', version: 1 }],
      only_later: [{ name: 'A', version: 2 }],
      reordered: false,
    });
  });

  it('EC-11: the same skills in another order are reordered', () => {
    const a = run('r1', T1, [], { skills: [{ name: 'A', version: 1 }, { name: 'B', version: 1 }] });
    const b = run('r2', T2, [], { skills: [{ name: 'B', version: 1 }, { name: 'A', version: 1 }] });
    const out = compareRuns(a, b, prompts);
    expect(out.skills).toEqual({ only_earlier: [], only_later: [], reordered: true });
  });
});
