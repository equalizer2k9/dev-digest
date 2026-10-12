import { describe, it, expect } from 'vitest';
import { parseReferences } from './parse-references.js';
import { MAX_REJECTED_REFS, MAX_REJECTED_REF_CHARS } from './constants.js';

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
    expect(parseReferences(null, repo)).toEqual({ issues: [], files: [], rejected: [] });
    expect(parseReferences('', repo)).toEqual({ issues: [], files: [], rejected: [] });
  });
});

describe('parseReferences: rejected references (S-AC-9a)', () => {
  it('S-AC-9: each refused kind is returned in `rejected` with its reason', () => {
    const r = parseReferences(
      '[a](/etc/passwd.md) [b](../secret.md) [c](docs/../../x.md) [d](notes.txt) [e](docs\\win.md)',
      repo,
    );
    expect(r.files).toEqual([]);
    const reasonOf = (ref: string) => r.rejected.find((x) => x.ref === ref)?.reason;
    expect(reasonOf('/etc/passwd.md')).toBe('absolute_path');
    expect(reasonOf('../secret.md')).toBe('path_traversal');
    expect(reasonOf('docs/../../x.md')).toBe('path_traversal');
    expect(reasonOf('notes.txt')).toBe('not_markdown');
    expect(reasonOf('docs\\win.md')).toBe('invalid_path');
  });

  it('S-AC-9: URLs of other hosts and other repos are ignored, not recorded', () => {
    const r = parseReferences(
      '[d](https://evil.example/x.md) [f](//evil.example/y.md) https://github.com/evil/api/blob/main/docs/foreign.md https://github.com/evil/api/issues/8',
      repo,
    );
    expect(r.files).toEqual([]);
    expect(r.issues).toEqual([]);
    expect(r.rejected).toEqual([]);
  });

  it('S-AC-9: a valid reference is not rejected', () => {
    const r = parseReferences('[plan](docs/plan.md)', repo);
    expect(r.files).toEqual(['docs/plan.md']);
    expect(r.rejected).toEqual([]);
  });

  it('S-AC-9: the rejected list is capped at MAX_REJECTED_REFS', () => {
    const many = Array.from({ length: MAX_REJECTED_REFS + 4 }, (_, i) => `[x](../up${i}.md)`).join(' ');
    expect(parseReferences(many, repo).rejected).toHaveLength(MAX_REJECTED_REFS);
  });

  it('S-AC-9: a recorded ref contains no control characters', () => {
    const ctl = parseReferences('`/etc/pa\u0007ss.md`', repo);
    expect(ctl.rejected.length).toBeGreaterThan(0);
    for (const x of ctl.rejected) expect(x.ref).not.toMatch(/[\x00-\x1f\x7f]/);
  });

  it('S-AC-9: a recorded ref is at most MAX_REJECTED_REF_CHARS long', () => {
    const long = '/' + 'a'.repeat(MAX_REJECTED_REF_CHARS * 3) + '.md';
    const r = parseReferences(`[x](${long})`, repo);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]!.reason).toBe('absolute_path');
    expect(r.rejected[0]!.ref.length).toBeLessThanOrEqual(MAX_REJECTED_REF_CHARS);
  });

  it('S-AC-9 (§3): backticked non-.md code paths are not references and are not recorded', () => {
    const r = parseReferences('Changed `server/src/platform/retry-delay.ts` and `package.json`.', repo);
    expect(r.files).toEqual([]);
    expect(r.rejected).toEqual([]);
  });

  it('S-AC-9 (§3): a link or same-repo blob URL to a non-.md file is recorded as not_markdown', () => {
    const r = parseReferences(
      '[x](notes.txt) https://github.com/acme/api/blob/main/src/a.ts',
      repo,
    );
    expect(r.files).toEqual([]);
    expect(r.rejected).toHaveLength(2);
    expect(r.rejected.every((x) => x.reason === 'not_markdown')).toBe(true);
    expect(r.rejected.map((x) => x.ref)).toEqual(expect.arrayContaining(['notes.txt', 'src/a.ts']));
  });

  it('S-AC-9 (§3): a backticked .md path is still a file reference', () => {
    const r = parseReferences('see `docs/plan.md` and `src/a.ts`', repo);
    expect(r.files).toEqual(['docs/plan.md']);
    expect(r.rejected).toEqual([]);
  });
});
