import type { AgentPerformanceRow } from "@devdigest/shared";

export type SortDir = "desc" | "asc";

/** The Deleted agent has a null name; it sorts after named rows on a tie. */
const nameOf = (r: AgentPerformanceRow) => r.agent_name ?? "￿";
const byName = (a: AgentPerformanceRow, b: AgentPerformanceRow) => nameOf(a).localeCompare(nameOf(b));
const byRunsDesc = (a: AgentPerformanceRow, b: AgentPerformanceRow) => b.runs - a.runs;

/**
 * Accept-column order (A-6): rows with runs and enough decisions first, by accept rate in `dir`
 * (ties: runs descending, then name); then low-sample rows by runs descending; then rows
 * without runs by name. The direction only reverses the first group.
 */
export function sortRows(rows: AgentPerformanceRow[], dir: SortDir): AgentPerformanceRow[] {
  const sign = dir === "desc" ? -1 : 1;
  const ranked = rows.filter((r) => r.runs > 0 && !r.low_sample);
  const low = rows.filter((r) => r.runs > 0 && r.low_sample);
  const empty = rows.filter((r) => r.runs === 0);
  ranked.sort((a, b) => sign * ((a.accept_rate ?? 0) - (b.accept_rate ?? 0)) || byRunsDesc(a, b) || byName(a, b));
  low.sort((a, b) => byRunsDesc(a, b) || byName(a, b));
  empty.sort(byName);
  return [...ranked, ...low, ...empty];
}
