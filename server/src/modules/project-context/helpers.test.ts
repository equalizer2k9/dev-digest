import { describe, it, expect } from 'vitest';
import { documentTag, effectiveDocuments, withinBudget } from './helpers.js';
import { MAX_DOCUMENT_CHARS, MAX_DOCUMENT_BYTES } from './constants.js';
import { MAX_SPEC_FILE_CHARS, MAX_SPEC_FILE_BYTES } from '../reviews/intent/constants.js';

describe('documentTag', () => {
  it.each([
    ['docs/a.md', 'docs'],
    ['pkg/specs/x/y.md', 'specs'],
    ['docs/specs/a.md', 'docs'],
    ['insights/2026.md', 'insights'],
  ])('%s -> %s', (path, tag) => {
    expect(documentTag(path)).toBe(tag);
  });

  it.each([
    'specs.md',
    'docs/a.txt',
    'docs/a.MD',
    'src/a.md',
    'node_modules/x/docs/a.md',
    '.git/docs/a.md',
    'docs/node_modules/a.md',
  ])('%s is not a document', (path) => {
    expect(documentTag(path)).toBeNull();
  });

  it.each([
    '/docs/a.md',
    'docs/../a.md',
    './docs/a.md',
    'docs//a.md',
    'docs/a\n.md',
    'docs/a\0.md',
    'docs/a\u007f.md',
    '',
  ])('%j is not a document (AC-14)', (path) => {
    expect(documentTag(path)).toBeNull();
  });
});

describe('effectiveDocuments', () => {
  const skill = (id: string, paths: string[], enabled = true) => ({ id, name: `n-${id}`, enabled, paths });

  it('own first, then skills in order; a repeat appears once at its first position', () => {
    const out = effectiveDocuments(
      ['docs/a.md', 'docs/b.md'],
      [skill('s1', ['docs/b.md', 'docs/c.md']), skill('s2', ['docs/d.md', 'docs/c.md'])],
    );
    expect(out).toEqual([
      { path: 'docs/a.md', skill: null },
      { path: 'docs/b.md', skill: null },
      { path: 'docs/c.md', skill: { id: 's1', name: 'n-s1' } },
      { path: 'docs/d.md', skill: { id: 's2', name: 'n-s2' } },
    ]);
  });

  it('a disabled skill adds nothing', () => {
    expect(effectiveDocuments([], [skill('s1', ['docs/x.md'], false)])).toEqual([]);
  });
});

describe('withinBudget', () => {
  it('exactly at the budget fits; one over does not', () => {
    expect(withinBudget(7_990, 10, 8_000)).toBe(true);
    expect(withinBudget(7_990, 11, 8_000)).toBe(false);
  });
});

describe('caps (D-11)', () => {
  it('equal the Intent Layer caps', () => {
    expect(MAX_DOCUMENT_CHARS).toBe(MAX_SPEC_FILE_CHARS);
    expect(MAX_DOCUMENT_BYTES).toBe(MAX_SPEC_FILE_BYTES);
  });
});
