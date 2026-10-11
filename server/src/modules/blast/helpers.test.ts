import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';
import { buildSummary, toBlastRadius } from './helpers.js';

const sym = (name: string, file = 'src/lib.ts') => ({ name, file, kind: 'function' });
const caller = (
  viaSymbol: string,
  file: string,
  over: Partial<BlastCallerRow> = {},
): BlastCallerRow => ({ file, symbol: `in_${file}`, viaSymbol, line: 10, rank: 1, ...over });

function result(over: Partial<BlastResult>): BlastResult {
  return { changedSymbols: [], callers: [], impactedEndpoints: [], ...over };
}

describe('toBlastRadius', () => {
  it('groups interleaved callers by viaSymbol and takes facts only from the group files', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('A'), sym('B')],
        callers: [
          caller('A', 'src/a1.ts', { rank: 5 }),
          caller('B', 'src/b1.ts', { rank: 4 }),
          caller('A', 'src/a2.ts', { rank: 3 }),
        ],
        factsByFile: {
          'src/a1.ts': { endpoints: ['GET /a'], crons: [] },
          'src/a2.ts': { endpoints: ['GET /a', 'POST /a2'], crons: ['nightly'] },
          'src/b1.ts': { endpoints: ['GET /b'], crons: [] },
          'src/unrelated.ts': { endpoints: ['GET /nope'], crons: ['nope'] },
        },
      }),
    );
    expect(r.downstream.map((d) => d.symbol)).toEqual(['A', 'B']);
    const [a, b] = r.downstream;
    expect(a!.callers.map((c) => c.file)).toEqual(['src/a1.ts', 'src/a2.ts']);
    expect(a!.endpoints_affected).toEqual(['GET /a', 'POST /a2']);
    expect(a!.crons_affected).toEqual(['nightly']);
    expect(b!.endpoints_affected).toEqual(['GET /b']);
    expect(b!.crons_affected).toEqual([]);
    expect(BlastRadius.parse(r)).toEqual(r);
  });

  it('maps callers to { name, file, line } and keeps changed_symbols order', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('Z'), sym('A')],
        callers: [caller('Z', 'src/z.ts', { symbol: 'handler', line: 42 })],
      }),
    );
    expect(r.changed_symbols.map((s) => s.name)).toEqual(['Z', 'A']);
    expect(r.downstream[0]!.callers).toEqual([{ name: 'handler', file: 'src/z.ts', line: 42 }]);
  });

  it('a file with facts but no caller in the group contributes nothing', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('A'), sym('B')],
        callers: [caller('A', 'src/a.ts'), caller('B', 'src/b.ts')],
        factsByFile: {
          'src/a.ts': { endpoints: [], crons: [] },
          'src/b.ts': { endpoints: ['GET /b'], crons: ['c'] },
        },
      }),
    );
    expect(r.downstream.find((d) => d.symbol === 'A')!.endpoints_affected).toEqual([]);
    expect(r.downstream.find((d) => d.symbol === 'A')!.crons_affected).toEqual([]);
  });

  it('removes duplicate endpoints when several callers share a file or a route', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('A')],
        callers: [
          caller('A', 'src/x.ts', { line: 1 }),
          caller('A', 'src/x.ts', { line: 2, symbol: 'other' }),
          caller('A', 'src/y.ts'),
        ],
        factsByFile: {
          'src/x.ts': { endpoints: ['GET /r'], crons: ['c'] },
          'src/y.ts': { endpoints: ['GET /r'], crons: ['c'] },
        },
      }),
    );
    expect(r.downstream[0]!.endpoints_affected).toEqual(['GET /r']);
    expect(r.downstream[0]!.crons_affected).toEqual(['c']);
  });

  it('keeps crons out of endpoints_affected', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('A')],
        callers: [caller('A', 'src/x.ts')],
        factsByFile: { 'src/x.ts': { endpoints: ['GET /r'], crons: ['0 * * * *'] } },
      }),
    );
    expect(r.downstream[0]!.endpoints_affected).toEqual(['GET /r']);
    expect(r.downstream[0]!.crons_affected).toEqual(['0 * * * *']);
  });

  it('factsByFile undefined → empty endpoint and cron arrays', () => {
    const r = toBlastRadius(
      result({ changedSymbols: [sym('A')], callers: [caller('A', 'src/x.ts')], impactedEndpoints: ['GET /flat'] }),
    );
    expect(r.downstream[0]!.endpoints_affected).toEqual([]);
    expect(r.downstream[0]!.crons_affected).toEqual([]);
  });

  it('drops a caller that sits in a file declaring its own viaSymbol', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('A', 'src/lib.ts')],
        callers: [caller('A', 'src/lib.ts'), caller('A', 'src/other.ts')],
      }),
    );
    expect(r.downstream[0]!.callers.map((c) => c.file)).toEqual(['src/other.ts']);
  });

  it('drops the whole group when its only callers are in the declaring file', () => {
    const r = toBlastRadius(
      result({ changedSymbols: [sym('A', 'src/lib.ts')], callers: [caller('A', 'src/lib.ts')] }),
    );
    expect(r.downstream).toEqual([]);
    expect(r.changed_symbols).toHaveLength(1);
  });

  it('orders groups by top caller rank desc then symbol asc; callers by rank, file, line', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('B'), sym('A'), sym('C')],
        callers: [
          caller('B', 'src/b.ts', { rank: 2 }),
          caller('A', 'src/a.ts', { rank: 2 }),
          caller('C', 'src/c2.ts', { rank: 9, line: 5 }),
          caller('C', 'src/c1.ts', { rank: 1, line: 3 }),
          caller('C', 'src/c1.ts', { rank: 1, line: 1, symbol: 'early' }),
          caller('C', 'src/c0.ts', { rank: 1, line: 8 }),
        ],
      }),
    );
    expect(r.downstream.map((d) => d.symbol)).toEqual(['C', 'A', 'B']);
    expect(r.downstream[0]!.callers.map((c) => [c.file, c.line])).toEqual([
      ['src/c2.ts', 5],
      ['src/c0.ts', 8],
      ['src/c1.ts', 1],
      ['src/c1.ts', 3],
    ]);
  });

  it('a symbol with no callers has no group but stays in changed_symbols', () => {
    const r = toBlastRadius(
      result({ changedSymbols: [sym('A'), sym('Lonely')], callers: [caller('A', 'src/a.ts')] }),
    );
    expect(r.downstream.map((d) => d.symbol)).toEqual(['A']);
    expect(r.changed_symbols.map((s) => s.name)).toEqual(['A', 'Lonely']);
  });

  it('builds the summary from unique endpoints/crons across entries', () => {
    const r = toBlastRadius(
      result({
        changedSymbols: [sym('A'), sym('B')],
        callers: [caller('A', 'src/x.ts'), caller('B', 'src/x.ts', { symbol: 'k' })],
        factsByFile: { 'src/x.ts': { endpoints: ['GET /r'], crons: ['c'] } },
      }),
    );
    expect(r.summary).toBe('2 symbols · 2 callers · 1 endpoint · 1 cron');
    expect(BlastRadius.parse(r)).toEqual(r);
  });

  it('empty result parses and summarises zero', () => {
    const r = toBlastRadius(result({}));
    expect(r).toEqual({
      changed_symbols: [],
      downstream: [],
      summary: '0 symbols · 0 callers · 0 endpoints · 0 crons',
    });
  });
});

describe('buildSummary', () => {
  it('zero', () => {
    expect(buildSummary({ symbols: 0, callers: 0, endpoints: 0, crons: 0 })).toBe(
      '0 symbols · 0 callers · 0 endpoints · 0 crons',
    );
  });
  it('singular', () => {
    expect(buildSummary({ symbols: 1, callers: 1, endpoints: 1, crons: 1 })).toBe(
      '1 symbol · 1 caller · 1 endpoint · 1 cron',
    );
  });
  it('plural', () => {
    expect(buildSummary({ symbols: 2, callers: 14, endpoints: 3, crons: 2 })).toBe(
      '2 symbols · 14 callers · 3 endpoints · 2 crons',
    );
  });
});
