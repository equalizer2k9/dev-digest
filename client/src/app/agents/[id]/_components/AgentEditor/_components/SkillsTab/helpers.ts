import type { SkillWithUsage } from "@devdigest/shared";

/** Move the item at `from` to index `to`, returning a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(to, 0, moved);
  return next;
}

/** Drop `dragged` onto the slot `target` currently occupies. */
export function reorderById(ids: string[], dragged: string, target: string): string[] {
  return moveItem(ids, ids.indexOf(dragged), ids.indexOf(target));
}

/** Case-insensitive filter on a skill's NAME only — the spec's search field. */
export function filterByName(skills: SkillWithUsage[], search: string): SkillWithUsage[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => sk.name.toLowerCase().includes(q));
}

/**
 * Split every skill in the workspace into the agent's ordered, enabled rows and
 * the rest. Enabled order is `agent_skills.order` (i.e. the prompt order);
 * everything else follows by name. A linked id with no matching skill row (a
 * skill deleted under us) is dropped rather than rendered as a ghost.
 */
export function splitRows(
  all: SkillWithUsage[],
  order: string[],
): { enabled: SkillWithUsage[]; disabled: SkillWithUsage[] } {
  const byId = new Map(all.map((sk) => [sk.id, sk]));
  const enabled = order
    .map((id) => byId.get(id))
    .filter((sk): sk is SkillWithUsage => sk !== undefined);
  const linked = new Set(enabled.map((sk) => sk.id));
  const disabled = all
    .filter((sk) => !linked.has(sk.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { enabled, disabled };
}
