/** Pure helpers for DisagreementsSection. */

import type { CellValue, FindingGroup } from "@devdigest/shared";

/** Derived in render (no effect): all groups, or only the conflicting ones. */
export function visibleGroups(groups: FindingGroup[], onlyConflicts: boolean): FindingGroup[] {
  return onlyConflicts ? groups.filter((g) => g.conflict) : groups;
}

/** The group's cell for one agent run; a missing cell reads as "pending". */
export function cellFor(group: FindingGroup, runId: string): CellValue {
  return group.cells.find((c) => c.run_id === runId)?.value ?? "pending";
}
