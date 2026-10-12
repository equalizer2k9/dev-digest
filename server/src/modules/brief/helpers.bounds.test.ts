import { describe, expect, it, vi } from 'vitest';
import type { BlastRadius, PrBriefDraft } from '@devdigest/shared';
import { buildBriefInput, buildFacts, groundDraft, hunkRanges, type PrFileFacts } from './helpers.js';

/** Cheap deterministic tokenizer stand-in. */
const cheap = (text: string) => Math.ceil(text.length / 4);
const counting = () => vi.fn(cheap);
const BUDGET = 8000;
const SYSTEM = 'You are a PR briefing assistant.';
const pull = { title: 'Big PR', body: null };

const patch = (start = 1, n = 5) => `@@ -1,1 +${start},${n} @@\n+x`;

const manyFiles = (n: number): PrFileFacts[] =>
  Array.from({ length: n }, (_, i) => ({
    path: `src/module-${String(i).padStart(5, '0')}/file-${i}.ts`,
    additions: (i % 7) + 1,
    deletions: i % 3,
    patch: patch(10 + i, 4),
  }));

const manyCallers = (n: number): BlastRadius => ({
  changed_symbols: [{ name: 'foo', file: 'src/decl.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'foo',
      callers: Array.from({ length: n }, (_, i) => ({
        name: `caller${i}`,
        file: `src/callers/caller-file-${String(i).padStart(5, '0')}.ts`,
        line: i + 1,
      })),
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: `1 symbol · ${n} callers · 0 endpoints · 0 crons`,
});

function callsForFiles(n: number) {
  const count = counting();
  const out = buildBriefInput(buildFacts(pull, manyFiles(n), null), SYSTEM, count, BUDGET);
  return { out, calls: count.mock.calls.length };
}
function callsForCallers(n: number) {
  const count = counting();
  const out = buildBriefInput(buildFacts(pull, [], manyCallers(n)), SYSTEM, count, BUDGET);
  return { out, calls: count.mock.calls.length };
}

describe('NFR-7 / EC-13: bounded tokenizer calls (AC-14)', () => {
  it('AC-14 NFR-7: 3000 changed files end within budget with a bounded number of tokenizer calls', () => {
    const small = callsForFiles(300);
    const big = callsForFiles(3000);
    expect(big.out.tokens).toBeLessThanOrEqual(BUDGET);
    expect(big.calls).toBeLessThan(200);
    // logarithmic growth: 10x more files adds only a handful of calls
    expect(big.calls - small.calls).toBeLessThan(40);
  });

  it('AC-14 NFR-7: 3000 callers in distinct files end within budget with a bounded number of tokenizer calls', () => {
    const small = callsForCallers(300);
    const big = callsForCallers(3000);
    expect(big.out.tokens).toBeLessThanOrEqual(BUDGET);
    expect(big.calls).toBeLessThan(200);
    expect(big.calls - small.calls).toBeLessThan(40);
  });
});

describe('EC-13: huge hunk counts are never expanded', () => {
  it('EC-13: hunkRanges keeps +1,10000000 as its two numbers', () => {
    expect(hunkRanges('@@ -1,1 +1,10000000 @@')).toEqual([{ start: 1, end: 10000000 }]);
  });

  it('EC-13 AC-11: buildFacts answers membership on a 10 000 000-line hunk without listing lines', () => {
    const f = buildFacts(pull, [{ path: 'src/a.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,10000000 @@\n+x' }], null);
    const lines = f.knownLines.get('src/a.ts')!;
    expect(lines.has(1)).toBe(true);
    expect(lines.has(5_000_000)).toBe(true);
    expect(lines.has(10_000_000)).toBe(true);
    expect(lines.has(10_000_001)).toBe(false);
    expect(lines.has(0)).toBe(false);
  });

  it('EC-13: absurd digit counts never yield a range with a non-safe-integer bound', () => {
    for (const h of ['@@ -1,1 +1,99999999999999999999999 @@', '@@ -1,1 +99999999999999999999999,5 @@']) {
      const ranges = hunkRanges(h);
      for (const r of ranges) {
        expect(Number.isSafeInteger(r.start)).toBe(true);
        expect(Number.isSafeInteger(r.end)).toBe(true);
      }
    }
  });
});

describe('AC-11: grounding unchanged', () => {
  const blast: BlastRadius = {
    changed_symbols: [{ name: 'foo', file: 'src/decl.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'foo',
        callers: [{ name: 'c', file: 'src/caller.ts', line: 7 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: 's',
  };
  const multi = '@@ -1,1 +10,5 @@\n+x\n@@ -20,1 +30,3 @@\n+y'; // 10-14 and 30-32
  const facts = buildFacts(pull, [{ path: 'src/a.ts', additions: 2, deletions: 0, patch: multi }], blast);
  const focus = (file: string, line: number) => ({ file, line, reason: `${file}:${line}` });
  const kept = (items: { file: string; line: number }[]) =>
    groundDraft({ summary: 'S', risks: [], review_focus: items.map((i) => focus(i.file, i.line)) } as PrBriefDraft, facts)
      .review_focus.map((x) => `${x.file}:${x.line}`);

  it('AC-11: keeps lines inside ranges including both ends', () => {
    expect(kept([{ file: 'src/a.ts', line: 10 }, { file: 'src/a.ts', line: 12 }, { file: 'src/a.ts', line: 14 }])).toEqual([
      'src/a.ts:10',
      'src/a.ts:12',
      'src/a.ts:14',
    ]);
  });

  it('AC-11: drops start-1, end+1, the gap between ranges, and far lines', () => {
    expect(
      kept([
        { file: 'src/a.ts', line: 9 },
        { file: 'src/a.ts', line: 15 },
        { file: 'src/a.ts', line: 20 },
        { file: 'src/a.ts', line: 29 },
        { file: 'src/a.ts', line: 33 },
        { file: 'src/a.ts', line: 1000 },
      ]),
    ).toEqual([]);
    expect(kept([{ file: 'src/a.ts', line: 30 }, { file: 'src/a.ts', line: 32 }])).toHaveLength(2);
  });

  it('AC-11: keeps the caller line, drops another line of the caller file and files outside the allowed paths', () => {
    expect(kept([{ file: 'src/caller.ts', line: 7 }])).toEqual(['src/caller.ts:7']);
    expect(kept([{ file: 'src/caller.ts', line: 8 }, { file: 'src/other.ts', line: 11 }])).toEqual([]);
  });

  it('AC-11 EC-13: a huge range still drops end+1 and keeps interior lines', () => {
    const f = buildFacts(pull, [{ path: 'src/h.ts', additions: 1, deletions: 0, patch: '@@ -1,1 +1,10000000 @@\n+x' }], null);
    const d = { summary: 'S', risks: [], review_focus: [focus('src/h.ts', 9_999_999), focus('src/h.ts', 10_000_001)] } as PrBriefDraft;
    expect(groundDraft(d, f).review_focus.map((x) => x.line)).toEqual([9_999_999]);
  });
});

describe('ordinary PR is unchanged', () => {
  it('AC-14 EC-13: a PR that fits has the same user text for any budget, with few tokenizer calls', () => {
    const files = manyFiles(5);
    const f = buildFacts({ title: 'Small', body: 'desc' }, files, manyCallers(3));
    const c1 = counting();
    const a = buildBriefInput(f, SYSTEM, c1, 8000);
    const b = buildBriefInput(f, SYSTEM, counting(), 1_000_000);
    expect(a.user).toBe(b.user);
    expect(c1.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe('cut order under the bounded search', () => {
  const doc = (n: number, churn: number): PrFileFacts => ({
    path: `docs/d${n}.md`,
    additions: churn,
    deletions: 0,
    patch: patch(1, 3),
  });
  const keepers: PrFileFacts[] = [
    { path: 'src/core.ts', additions: 1, deletions: 0, patch: patch(1, 3) },
    { path: 'src/core.test.ts', additions: 1, deletions: 0, patch: patch(1, 3) },
  ];
  // churn: d0=1 d1=1 d2=2 d3=3 lock=3 d4=4 d5=5 ; ties by path (docs/d3.md < pnpm-lock.yaml)
  const cuttable: PrFileFacts[] = [
    doc(0, 1),
    doc(1, 1),
    doc(2, 2),
    doc(3, 3),
    { path: 'pnpm-lock.yaml', additions: 3, deletions: 0, patch: patch(1, 3) },
    doc(4, 4),
    doc(5, 5),
  ];
  const all = [...keepers, ...cuttable];
  const survivorsOf = (user: string) =>
    all.map((f) => f.path).filter((p) => user.split('\n').some((l) => l.startsWith(`${p} |`)));
  const fullTokens = (files: PrFileFacts[]) =>
    buildBriefInput(buildFacts(pull, files, null), SYSTEM, cheap, 1_000_000).tokens;

  it('AC-14: exactly the 4 lowest-churn boilerplate/docs rows go, ties by path; tests and core stay; result is maximal', () => {
    const expected = [...keepers, ...cuttable.slice(4)]; // d0-d3 gone: lock, d4, d5 survive
    const budget = fullTokens(expected);
    const out = buildBriefInput(buildFacts(pull, all, null), SYSTEM, cheap, budget);
    expect(out.tokens).toBeLessThanOrEqual(budget);
    expect(survivorsOf(out.user).sort()).toEqual(expected.map((f) => f.path).sort());
    // maximal: keeping one more row (d3) would not fit
    expect(fullTokens([...expected, cuttable[3]!])).toBeGreaterThan(budget);
  });
});
