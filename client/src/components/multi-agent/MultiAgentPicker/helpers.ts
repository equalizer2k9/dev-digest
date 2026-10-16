/** Pure helpers for MultiAgentPicker. */

import type { AgentEstimate } from "@devdigest/shared";
import { MAX_AGENTS, MIN_AGENTS } from "./constants";

export const DASH = "—";

/** Total for the ticked agents: summed cost, longest duration (they run together). null = no value. */
export function totalEstimate(
  estimates: AgentEstimate[],
  selected: string[],
): { cost_usd: number | null; duration_ms: number | null } {
  const picked = estimates.filter((e) => selected.includes(e.agent_id));
  const costs = picked.map((e) => e.cost_usd).filter((v): v is number => v != null);
  const times = picked.map((e) => e.duration_ms).filter((v): v is number => v != null);
  return {
    cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    duration_ms: times.length ? Math.max(...times) : null,
  };
}

/** Add or remove `id`, keeping tick order. Adding past `max` is refused (same array back). */
export function toggle(selected: string[], id: string, max = MAX_AGENTS): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= max ? selected : [...selected, id];
}

export function canLaunch(n: number): boolean {
  return n >= MIN_AGENTS && n <= MAX_AGENTS;
}

export function formatDuration(ms: number | null | undefined, dash = DASH): string {
  if (ms == null) return dash;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
