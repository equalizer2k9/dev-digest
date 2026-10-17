/** Pure helpers for AgentTabs. */

import type { FindingGroup, GroupMember } from "@devdigest/shared";

/** One agent run's findings, in group order. */
export function runFindings(groups: FindingGroup[], runId: string): GroupMember[] {
  return groups.flatMap((g) => g.members.filter((m) => m.run_id === runId));
}

/** Ids of findings that sit in a conflict group. */
export function conflictFindingIds(groups: FindingGroup[]): Set<string> {
  return new Set(groups.filter((g) => g.conflict).flatMap((g) => g.members.map((m) => m.id)));
}
