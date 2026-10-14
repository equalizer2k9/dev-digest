import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/** Severity order, most severe first — the one source for every place that
   sorts or ranks findings (PR list chips, hover preview, diff viewer). */
export const FINDINGS_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/**
 * Findings from each agent's latest review, sorted by severity — the same rule
 * the API applies to the list's `findings_counts`, so the hover preview always
 * matches the chips.
 */
export function latestFindingsPerAgent(reviews: ReviewRecord[]): FindingRecord[] {
  const newestFirst = [...reviews]
    .filter((rv) => rv.kind === "review")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seenAgents = new Set<string>();
  const findings: FindingRecord[] = [];
  for (const rv of newestFirst) {
    const agentKey = rv.agent_id ?? "none";
    if (seenAgents.has(agentKey)) continue;
    seenAgents.add(agentKey);
    findings.push(...rv.findings);
  }
  const rank = (sev: string) => {
    const i = FINDINGS_SEVERITIES.indexOf(sev as (typeof FINDINGS_SEVERITIES)[number]);
    return i === -1 ? FINDINGS_SEVERITIES.length : i;
  };
  return findings.sort((a, b) => rank(a.severity) - rank(b.severity));
}
