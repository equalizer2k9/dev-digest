import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { RepoBasics } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';

/**
 * Blast radius — the facade computes `degraded` / `reason` itself and applies
 * MAX_CALLERS_PER_SYMBOL per `viaSymbol`. No Postgres: the service's repository
 * is replaced with in-memory stubs, same approach as repo-intel-facade-degraded.
 */

const BASICS: RepoBasics = { id: 'r1', owner: 'a', name: 'b', clonePath: '/nonexistent-clone' };

function state(status: IndexState['status']): IndexState {
  return {
    repoId: 'r1',
    status,
    filesIndexed: 1,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'abc',
    indexerVersion: 1,
    updatedAt: new Date(0),
  } as IndexState;
}

interface Stub {
  flag: boolean;
  basics?: RepoBasics | null;
  index?: IndexState | null;
  callers?: { fromPath: string; toSymbol: string; line: number; rank: number }[];
  facts?: { filePath: string; endpoints: string[]; crons: string[] }[];
}

function build(o: Stub) {
  const requestedFactFiles: string[][] = [];
  const container = {
    config: { repoIntelEnabled: o.flag },
    db: {} as never,
    codeIndex: { symbols: async () => [], references: async () => [] } as never,
  } as never;
  const svc = new RepoIntelService(container);
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => (o.basics === undefined ? BASICS : o.basics),
    tryGetIndexState: async () => o.index ?? null,
    getSymbolRows: async (_r: string, paths: string[]) =>
      paths.includes('src/lib.ts')
        ? ['A', 'B'].map((name) => ({
            path: 'src/lib.ts', name, kind: 'function', line: 1, endLine: 2, exported: true, signature: null,
          }))
        : [],
    getResolvedCallers: async () => o.callers ?? [],
    getFileFacts: async (_r: string, files: string[]) => {
      requestedFactFiles.push(files);
      return (o.facts ?? []).filter((f) => files.includes(f.filePath));
    },
  };
  return { svc, requestedFactFiles };
}

const caller = (n: number, via: string, rank = 1) => ({
  fromPath: `src/c-${via}-${n}.ts`, toSymbol: via, line: 5, rank,
});

describe('getBlastRadius — degraded reason (computed by the facade)', () => {
  it('flag off → fallback result, degraded, flag_off', async () => {
    const { svc } = build({ flag: false, index: state('full') });
    const r = await svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('flag_off');
  });

  it('index partial → persistent result, degraded, index_partial, callers still returned', async () => {
    const { svc } = build({ flag: true, index: state('partial'), callers: [caller(1, 'A')] });
    const r = await svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('index_partial');
    expect(r.callers).toHaveLength(1);
    expect(r.changedSymbols.map((s) => s.name)).toEqual(['A', 'B']);
  });

  it('index partial with no declared symbols → still index_partial', async () => {
    const { svc } = build({ flag: true, index: state('partial') });
    const r = await svc.getBlastRadius('r1', ['src/other.ts']);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe('index_partial');
  });

  it('index full → not degraded, no reason', async () => {
    const { svc } = build({ flag: true, index: state('full'), callers: [caller(1, 'A')] });
    const r = await svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(r.degraded).toBe(false);
    expect(r.reason).toBeUndefined();
  });

  it('no index state and no clone → no_data', async () => {
    const { svc } = build({ flag: true, index: null, basics: { ...BASICS, clonePath: null } });
    const r = await svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(r).toMatchObject({ degraded: true, reason: 'no_data', callers: [] });
  });

  it('no repo → no_data', async () => {
    const { svc } = build({ flag: true, index: null, basics: null });
    expect((await svc.getBlastRadius('r1', ['src/lib.ts'])).reason).toBe('no_data');
  });

  it('no changed files → no_data', async () => {
    const { svc } = build({ flag: true, index: state('full') });
    const r = await svc.getBlastRadius('r1', []);
    expect(r).toMatchObject({ degraded: true, reason: 'no_data' });
  });
});

describe('getBlastRadius — MAX_CALLERS_PER_SYMBOL applies per viaSymbol', () => {
  it('keeps exactly the cap for a big symbol and all callers of a small one', async () => {
    const big = Array.from({ length: MAX_CALLERS_PER_SYMBOL + 5 }, (_, i) => caller(i, 'A', 100 - i));
    const small = [caller(1, 'B', 0), caller(2, 'B', 0)];
    const { svc, requestedFactFiles } = build({
      flag: true,
      index: state('full'),
      callers: [...big, ...small],
      facts: [
        { filePath: big[0]!.fromPath, endpoints: ['GET /a'], crons: [] },
        // beyond the cap for A: must not contribute facts
        { filePath: big[MAX_CALLERS_PER_SYMBOL + 2]!.fromPath, endpoints: ['GET /dropped'], crons: [] },
        { filePath: small[0]!.fromPath, endpoints: ['GET /b'], crons: ['0 * * * *'] },
      ],
    });
    const r = await svc.getBlastRadius('r1', ['src/lib.ts']);
    expect(r.callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(r.callers.filter((c) => c.viaSymbol === 'B')).toHaveLength(2);
    // the kept A callers are the highest-ranked ones
    expect(r.callers.filter((c) => c.viaSymbol === 'A').every((c) => c.rank > 100 - MAX_CALLERS_PER_SYMBOL)).toBe(true);
    // facts are built from kept callers' files only
    expect(requestedFactFiles[0]).not.toContain(big[MAX_CALLERS_PER_SYMBOL + 2]!.fromPath);
    expect(r.impactedEndpoints.sort()).toEqual(['GET /a', 'GET /b']);
    expect(Object.keys(r.factsByFile ?? {})).not.toContain(big[MAX_CALLERS_PER_SYMBOL + 2]!.fromPath);
  });
});
