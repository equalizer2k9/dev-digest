import type { AgentRow, BlastResponse, ConventionCandidate, FindingRow, ReviewRow } from './schemas.js';

// Field whitelists: anything not named here (system_prompt, rationale, ids…) never leaves.

export const formatAgents = (agents: AgentRow[]) =>
  agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description ?? '',
    enabled: a.enabled,
    provider: a.provider,
    model: a.model,
  }));

export const formatFinding = (f: FindingRow) => ({
  severity: f.severity,
  title: f.title,
  file: f.file ?? null,
  line: f.start_line ?? null,
});

export function countBySeverity(findings: FindingRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

export const formatReview = (r: ReviewRow) => ({
  agent: r.agent_name,
  verdict: r.verdict ?? null,
  score: r.score ?? null,
  summary: r.summary ?? '',
  counts: countBySeverity(r.findings),
  findings: r.findings.map(formatFinding),
});

export const formatRunResult = (runId: string, r: ReviewRow) => ({
  run_id: runId,
  status: 'done',
  verdict: r.verdict ?? null,
  score: r.score ?? null,
  counts: countBySeverity(r.findings),
  findings: r.findings.map(formatFinding),
});

export const formatConventions = (candidates: ConventionCandidate[]) =>
  candidates
    .filter((c) => c.status === 'accepted')
    .map((c) => ({
      rule: c.rule,
      category: c.category,
      evidence: `${c.evidence_path}:${c.evidence_start_line}`,
    }));

export const formatBlast = (b: BlastResponse) => ({
  summary: b.summary,
  degraded: b.degraded,
  reason: b.reason,
  symbols: b.downstream.map((d) => ({
    symbol: d.symbol,
    callers: d.callers.map((c) => `${c.file}:${c.line} ${c.name}`),
    endpoints: d.endpoints_affected,
    crons: d.crons_affected,
  })),
});
