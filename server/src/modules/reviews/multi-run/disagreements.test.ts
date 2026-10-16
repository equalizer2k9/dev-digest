import { describe, it, expect } from 'vitest';
import type { GroupMember, Severity } from '@devdigest/shared';
import type { RawGroup } from './grouping.js';
import { buildCells, isConflict } from './disagreements.js';

function m(runId: string, severity: Severity, id = `${runId}-${severity}`): GroupMember {
  return {
    id,
    severity,
    category: 'bug',
    title: 't',
    file: 'a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'r',
    suggestion: null,
    confidence: 1,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'rev',
    accepted_at: null,
    dismissed_at: null,
    run_id: runId,
  } as GroupMember;
}
const group = (...members: GroupMember[]): RawGroup => ({ representative: members[0]!, members });

describe('buildCells', () => {
  const runs = [
    { runId: 'r1', status: 'done' },
    { runId: 'r2', status: 'done' },
    { runId: 'r3', status: 'failed' },
  ];

  it('one cell per agent run in launch order', () => {
    const [g] = buildCells([group(m('r2', 'WARNING'))], runs);
    expect(g!.cells.map((c) => c.run_id)).toEqual(['r1', 'r2', 'r3']);
    expect(g!.id).toBe('r2-WARNING');
  });

  it('done agent with a member → its severity; done without → did_not_flag', () => {
    const [g] = buildCells([group(m('r2', 'WARNING'))], runs);
    expect(g!.cells[0]!.value).toBe('did_not_flag');
    expect(g!.cells[1]!.value).toBe('WARNING');
  });

  it('failed and cancelled → failed (EC-12); queued/running/null → pending', () => {
    const rs = [
      { runId: 'a', status: 'failed' },
      { runId: 'b', status: 'cancelled' },
      { runId: 'c', status: 'queued' },
      { runId: 'd', status: 'running' },
      { runId: 'e', status: null },
    ];
    const [g] = buildCells([group(m('x', 'WARNING'))], rs);
    expect(g!.cells.map((c) => c.value)).toEqual(['failed', 'failed', 'pending', 'pending', 'pending']);
  });

  it('conflict when a finished agent did not flag it', () => {
    const [g] = buildCells([group(m('r1', 'WARNING'))], runs);
    expect(g!.conflict).toBe(true);
  });

  it('conflict when member severities differ', () => {
    const [g] = buildCells([group(m('r1', 'WARNING'), m('r2', 'CRITICAL'))], runs);
    expect(g!.conflict).toBe(true);
  });

  it('no conflict when all agree on one severity', () => {
    const [g] = buildCells([group(m('r1', 'WARNING'), m('r2', 'WARNING'))], runs);
    expect(g!.conflict).toBe(false);
  });

  it('pending and failed never make a conflict (A-13)', () => {
    const rs = [
      { runId: 'r1', status: 'done' },
      { runId: 'r2', status: 'running' },
      { runId: 'r3', status: 'failed' },
    ];
    const [g] = buildCells([group(m('r1', 'WARNING'))], rs);
    expect(g!.conflict).toBe(false);
  });

  it('one finished agent + failed others → no group is a conflict (EC-6)', () => {
    const rs = [
      { runId: 'r1', status: 'done' },
      { runId: 'r2', status: 'failed' },
    ];
    const out = buildCells([group(m('r1', 'WARNING')), group(m('r1', 'CRITICAL', 'x'))], rs);
    expect(out.every((g) => !g.conflict)).toBe(true);
  });
});

describe('isConflict', () => {
  it('is false for a single severity with no did_not_flag', () => {
    expect(
      isConflict([{ run_id: 'r1', value: 'WARNING' }], [m('r1', 'WARNING')]),
    ).toBe(false);
  });
});
