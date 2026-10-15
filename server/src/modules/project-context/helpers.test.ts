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

  it('AC-40: orders by tag — specs, then docs, then insights', () => {
    const out = effectiveDocuments(['insights/i.md', 'docs/d.md', 'specs/s.md'], []);
    expect(out.map((d) => d.path)).toEqual(['specs/s.md', 'docs/d.md', 'insights/i.md']);
  });

  it('AC-40: keeps the attachment order within a tag (own, then skills)', () => {
    const out = effectiveDocuments(
      ['docs/z.md', 'insights/b.md', 'docs/a.md'],
      [skill('s1', ['specs/y.md', 'docs/m.md', 'insights/a.md']), skill('s2', ['specs/x.md'])],
    );
    expect(out.map((d) => d.path)).toEqual([
      'specs/y.md',
      'specs/x.md',
      'docs/z.md',
      'docs/a.md',
      'docs/m.md',
      'insights/b.md',
      'insights/a.md',
    ]);
  });

  it('AC-40: a repeat across tags-sorted lists still appears once, with the skill of its first position', () => {
    const out = effectiveDocuments(['insights/i.md'], [skill('s1', ['insights/i.md', 'specs/s.md'])]);
    expect(out).toEqual([
      { path: 'specs/s.md', skill: { id: 's1', name: 'n-s1' } },
      { path: 'insights/i.md', skill: null },
    ]);
  });

  it('EC-24: moving a document above one of another tag does not change the prompt order', () => {
    const before = effectiveDocuments(['specs/s.md', 'docs/d.md', 'insights/i.md'], []);
    const moved = effectiveDocuments(['insights/i.md', 'specs/s.md', 'docs/d.md'], []);
    const movedAgain = effectiveDocuments(['docs/d.md', 'insights/i.md', 'specs/s.md'], []);
    expect(moved).toEqual(before);
    expect(movedAgain).toEqual(before);
  });

  it('EC-24: a move within a tag does change the prompt order', () => {
    const out = effectiveDocuments(['docs/b.md', 'docs/a.md'], []);
    expect(out.map((d) => d.path)).toEqual(['docs/b.md', 'docs/a.md']);
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
