import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff } from './build-smart-diff.js';

const ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];
const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });
const finding = (file: string, startLine: number) => ({ file, startLine });

describe('buildSmartDiff', () => {
  it('returns five empty groups in display order for no input', () => {
    const r = buildSmartDiff([], []);
    expect(r.groups.map((g) => g.role)).toEqual(ORDER);
    expect(r.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(r.split_suggestion).toEqual({ too_big: false, total_lines: 0, proposed_splits: [] });
  });

  it('puts one file per role in its group, in display order', () => {
    const r = buildSmartDiff(
      [
        file('pnpm-lock.yaml'),
        file('README.md'),
        file('src/index.ts'),
        file('src/a.test.ts'),
        file('src/a.ts'),
      ],
      [],
    );
    expect(r.groups.map((g) => [g.role, g.files.map((f) => f.path)])).toEqual([
      ['core', ['src/a.ts']],
      ['tests', ['src/a.test.ts']],
      ['wiring', ['src/index.ts']],
      ['docs', ['README.md']],
      ['boilerplate', ['pnpm-lock.yaml']],
    ]);
  });

  it('sorts files by path inside a group', () => {
    const r = buildSmartDiff([file('src/b.ts'), file('src/a.ts'), file('lib/z.ts')], []);
    expect(r.groups[0]!.files.map((f) => f.path)).toEqual(['lib/z.ts', 'src/a.ts', 'src/b.ts']);
  });

  it('carries additions and deletions, omits pseudocode_summary', () => {
    const r = buildSmartDiff([file('src/a.ts', 5, 2)], []);
    expect(r.groups[0]!.files[0]).toEqual({
      path: 'src/a.ts',
      additions: 5,
      deletions: 2,
      finding_lines: [],
    });
  });

  it('lists finding_lines ascending and de-duplicated', () => {
    const r = buildSmartDiff(
      [file('src/a.ts')],
      [finding('src/a.ts', 52), finding('src/a.ts', 9), finding('src/a.ts', 52), finding('src/a.ts', 28)],
    );
    expect(r.groups[0]!.files[0]!.finding_lines).toEqual([9, 28, 52]);
  });

  it('ignores a finding on a file outside the PR', () => {
    const r = buildSmartDiff([file('src/a.ts')], [finding('src/elsewhere.ts', 3)]);
    expect(r.groups.flatMap((g) => g.files.flatMap((f) => f.finding_lines))).toEqual([]);
  });

  it('counts findings regardless of dismissal (the caller passes what counts)', () => {
    const dismissed = { file: 'src/a.ts', startLine: 4, dismissedAt: new Date() };
    const r = buildSmartDiff([file('src/a.ts')], [dismissed]);
    expect(r.groups[0]!.files[0]!.finding_lines).toEqual([4]);
  });

  it('sums additions + deletions into total_lines; never too_big, no splits', () => {
    const r = buildSmartDiff([file('a.ts', 10, 5), file('b.md', 3, 2)], []);
    expect(r.split_suggestion).toEqual({ too_big: false, total_lines: 20, proposed_splits: [] });
  });

  it('passes SmartDiff.parse', () => {
    const r = buildSmartDiff([file('src/a.ts', 2, 1), file('x.lock')], [finding('src/a.ts', 7)]);
    expect(() => SmartDiff.parse(r)).not.toThrow();
  });
});
