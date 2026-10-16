/** Pure helpers for FindingGroups. */

import type { GroupMember, MultiRunAgent } from "@devdigest/shared";

/** `file:start–end`, or `file:start` for a one-line finding. */
export function locationLabel(m: Pick<GroupMember, "file" | "start_line" | "end_line">): string {
  return m.end_line > m.start_line ? `${m.file}:${m.start_line}–${m.end_line}` : `${m.file}:${m.start_line}`;
}

/** Display names of the agents with a member in the group, in member order (deleted agent → fallback). */
export function groupAgentNames(
  members: GroupMember[],
  agents: MultiRunAgent[],
  fallback: string,
): string[] {
  const byRun = new Map(agents.map((a) => [a.run_id, a.agent_name ?? fallback]));
  return members.map((m) => byRun.get(m.run_id) ?? fallback);
}
