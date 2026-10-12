import { describe, it, expect } from 'vitest';
import { parseReferences } from './parse-references.js';

const repo = { owner: 'acme', name: 'api' };

describe('parseReferences (S-AC-9, S-AC-10)', () => {
  it('S-AC-10: closing keywords link issues; a bare #N does not', () => {
    const r = parseReferences('Closes #12, fixes #13 and resolves #14. Related to #99, see also #100.', repo);
    expect(r.issues).toEqual([12, 13, 14]);
  });

  it('S-AC-9: a same-repo issue URL links an issue; another repo does not', () => {
    const r = parseReferences(
      'https://github.com/acme/api/issues/7 and https://github.com/evil/api/issues/8 and https://github.com/acme/other/issues/9',
      repo,
    );
    expect(r.issues).toEqual([7]);
  });

  it('S-AC-9: files from relative links, backticked paths and same-repo blob URLs; .md only', () => {
    const r = parseReferences(
      [
        'See [plan](docs/plan.md) and `specs/a.md` and `src/index.ts`.',
        'https://github.com/acme/api/blob/main/docs/blob.md',
        'https://github.com/evil/api/blob/main/docs/foreign.md',
      ].join('\n'),
      repo,
    );
    expect(r.files).toEqual(expect.arrayContaining(['docs/plan.md', 'specs/a.md', 'docs/blob.md']));
    expect(r.files).not.toContain('docs/foreign.md');
    expect(r.files).not.toContain('src/index.ts');
  });

  it('S-AC-9: absolute paths, `..`, external URLs and non-.md files are never returned', () => {
    const r = parseReferences(
      '[a](/etc/passwd.md) [b](../secret.md) [c](docs/../../x.md) [d](https://evil.example/x.md) `C:\\x.md` [e](notes.txt) [f](//evil.example/y.md)',
      repo,
    );
    expect(r.files).toEqual([]);
  });

  it('S-AC-9: caps (3 issues, 3 files) hold', () => {
    const r = parseReferences('closes #1 closes #2 closes #3 closes #4 `a.md` `b.md` `c.md` `d.md`', repo);
    expect(r.issues).toHaveLength(3);
    expect(r.files).toHaveLength(3);
  });

  it('null / empty description → nothing', () => {
    expect(parseReferences(null, repo)).toEqual({ issues: [], files: [] });
    expect(parseReferences('', repo)).toEqual({ issues: [], files: [] });
  });
});
