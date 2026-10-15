import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { frozenDiff, zonesIntersect } from './helpers.js';

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
