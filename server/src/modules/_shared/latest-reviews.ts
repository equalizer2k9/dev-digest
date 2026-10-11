/**
 * Which reviews count for a PR: each AGENT's latest. A PR reviewed by several
 * agents shows the union of their current findings. Reviews without an agent
 * share one key per PR. Pure; sorts by `createdAt` itself, so the caller's
 * order does not matter. Filtering by `kind` stays with the caller.
 * Used by the PR list (findings_counts) and Smart Diff (finding_lines).
 */
export function latestReviewPerAgent<
  T extends { prId: string; agentId: string | null; createdAt: Date },
>(reviews: readonly T[]): T[] {
  const newestFirst = [...reviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const seen = new Set<string>();
  const latest: T[] = [];
  for (const rv of newestFirst) {
    const key = `${rv.prId}|${rv.agentId ?? 'none'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(rv);
  }
  return latest;
}
