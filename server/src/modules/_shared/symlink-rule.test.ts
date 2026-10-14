import { describe, expect, it } from 'vitest';
import { resolvedTargetRule, sameKindAs } from './symlink-rule.js';

describe('resolvedTargetRule', () => {
  const rule = resolvedTargetRule((p) => p.endsWith('.md'));

  it('accepts a target that satisfies the caller rule', () => {
    expect(rule('docs/a.md')).toBe(true);
  });

  it('rejects a .git or node_modules segment even when the caller rule would pass', () => {
    expect(rule('.git/notes.md')).toBe(false);
    expect(rule('docs/node_modules/x.md')).toBe(false);
  });

  it('rejects a target the caller rule refuses', () => {
    expect(rule('docs/a.txt')).toBe(false);
  });
});

describe('sameKindAs', () => {
  it('requires the same extension, or the same basename for extensionless files', () => {
    expect(sameKindAs('src/a.ts')('lib/b.ts')).toBe(true);
    expect(sameKindAs('src/a.ts')('.env')).toBe(false);
    expect(sameKindAs('.eslintrc')('cfg/.eslintrc')).toBe(true);
    expect(sameKindAs('.eslintrc')('.env')).toBe(false);
  });
});
