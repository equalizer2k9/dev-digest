/** Pure per-agent cells and conflict flag for finding groups (AC-10). */
import type { CellValue, FindingGroup, GroupCell, GroupMember } from '@devdigest/shared';
import type { RawGroup } from './grouping.js';
import { isInProgress } from './run-summary.js';

/** Conflict = a finished agent did not flag it, or members differ in severity. */
export function isConflict(cells: GroupCell[], members: GroupMember[]): boolean {
  if (cells.some((c) => c.value === 'did_not_flag')) return true;
  return new Set(members.map((m) => m.severity)).size > 1;
}

/** One cell per agent run, in the order given (launch order). */
export function buildCells(
  groups: RawGroup[],
  runs: { runId: string; status: string | null }[],
): FindingGroup[] {
  return groups.map((g) => {
    const cells: GroupCell[] = runs.map((r) => {
      let value: CellValue;
      if (isInProgress(r.status)) value = 'pending';
      else if (r.status === 'done') {
        value = g.members.find((m) => m.run_id === r.runId)?.severity ?? 'did_not_flag';
      } else value = 'failed';
      return { run_id: r.runId, value };
    });
    return {
      id: g.representative.id,
      representative: g.representative,
      members: g.members,
      cells,
      conflict: isConflict(cells, g.members),
    };
  });
}
