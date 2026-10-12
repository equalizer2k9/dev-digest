import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../../../adapters/git/diff-parser.js';
import { buildFileOutline } from './file-outline.js';
import {
  MAX_HUNK_HEADER_CHARS,
  MAX_OUTLINE_CHARS,
  MAX_OUTLINE_FILES,
  MAX_OUTLINE_HUNKS_PER_FILE,
} from './constants.js';

const diffOf = (raw: string) => parseUnifiedDiff(raw);

describe('buildFileOutline (S-AC-6 input, caps)', () => {
  const raw = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,4 @@ function alpha()',
    ' context line SECRET_CONTEXT',
    '+added body line SECRET_ADDED',
    '-removed body line SECRET_REMOVED',
    '@@ -20,2 +21,2 @@ function beta()',
    '+second hunk body',
  ].join('\n');

  it('lists path (+a/-d) and the raw @@ header lines', () => {
    const out = buildFileOutline(diffOf(raw));
    expect(out).toContain('src/a.ts (+2/-1)');
    expect(out).toContain('@@ -1,3 +1,4 @@ function alpha()');
    expect(out).toContain('@@ -20,2 +21,2 @@ function beta()');
  });

  it('no hunk body line (+, -, context) enters the outline', () => {
    const out = buildFileOutline(diffOf(raw));
    for (const leak of ['SECRET_CONTEXT', 'SECRET_ADDED', 'SECRET_REMOVED', 'second hunk body']) {
      expect(out).not.toContain(leak);
    }
  });

  it('cuts an over-long header, caps hunks per file, files, and total size', () => {
    const long = `@@ -1 +1 @@ ${'x'.repeat(500)}`;
    const hunks = Array.from({ length: MAX_OUTLINE_HUNKS_PER_FILE + 4 }, () => `${long}\n+l`).join('\n');
    const many = Array.from(
      { length: MAX_OUTLINE_FILES + 5 },
      (_, i) => `diff --git a/f${i}.ts b/f${i}.ts\n--- a/f${i}.ts\n+++ b/f${i}.ts\n${hunks}`,
    ).join('\n');
    const out = buildFileOutline(diffOf(many));
    expect(out.length).toBeLessThanOrEqual(MAX_OUTLINE_CHARS);
    for (const line of out.split('\n').filter((l) => l.trim().startsWith('@@'))) {
      expect(line.trim().length).toBeLessThanOrEqual(MAX_HUNK_HEADER_CHARS);
    }
    const first = buildFileOutline(diffOf(many.split('diff --git a/f1.ts')[0]!));
    expect(first.split('\n').filter((l) => l.trim().startsWith('@@'))).toHaveLength(MAX_OUTLINE_HUNKS_PER_FILE);
  });
});
