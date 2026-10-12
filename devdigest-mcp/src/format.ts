import { MAX_LIST, MAX_NAME, MAX_PATH, MAX_TEXT, MAX_TITLE } from './constants.js';
import { clip } from './errors.js';
import type { AgentRow, BlastResponse, ConventionCandidate, FindingRow, ReviewRow } from './schemas.js';

/** Shown when the API has no agent behind a review (deleted agent). */
export const UNKNOWN_AGENT = 'unknown';

// Field whitelists: anything not named here (system_prompt, provider, rationale…) never leaves.

export const formatAgents = (agents: AgentRow[]) =>
  agents.slice(0, MAX_LIST).map((a) => ({
    id: a.id,
    name: clip(a.name, MAX_NAME),
    description: clip(a.description ?? '', MAX_TEXT),
    model: clip(a.model, MAX_NAME),
    enabled: a.enabled,
  }));

export const formatFinding = (f: FindingRow) => ({
  severity: f.severity,
  title: clip(f.title, MAX_TITLE),
  file: f.file == null ? null : clip(f.file, MAX_PATH),
  line: f.start_line ?? null,
});

export function countBySeverity(findings: FindingRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

export const formatReview = (r: ReviewRow) => ({
  review_id: r.id,
  agent: clip(r.agent_name ?? UNKNOWN_AGENT, MAX_NAME),
  verdict: r.verdict == null ? null : clip(r.verdict, MAX_NAME),
  score: r.score ?? null,
  summary: clip(r.summary ?? '', MAX_TEXT),
  counts: countBySeverity(r.findings),
  // Every finding of the run; `findings` below holds at most MAX_LIST of them.
  total_findings: r.findings.length,
  findings: r.findings.slice(0, MAX_LIST).map(formatFinding),
});

export const formatRunResult = (runId: string, r: ReviewRow) => ({
  run_id: runId,
  status: 'done',
  verdict: r.verdict == null ? null : clip(r.verdict, MAX_NAME),
  score: r.score ?? null,
  counts: countBySeverity(r.findings),
  findings: r.findings.slice(0, MAX_LIST).map(formatFinding),
});

export const formatConventions = (candidates: ConventionCandidate[]) =>
  candidates
    .filter((c) => c.status === 'accepted')
    .slice(0, MAX_LIST)
    .map((c) => ({
      rule: clip(c.rule, MAX_TEXT),
      category: clip(c.category, MAX_NAME),
      evidence: `${clip(c.evidence_path, MAX_PATH)}:${c.evidence_start_line}`,
    }));

export const formatBlast = (b: BlastResponse) => ({
  summary: clip(b.summary, MAX_TEXT),
  degraded: b.degraded,
  reason: b.reason === null ? null : clip(b.reason, MAX_TEXT),
  symbols: b.downstream.slice(0, MAX_LIST).map((d) => ({
    symbol: clip(d.symbol, MAX_NAME),
    callers: d.callers
      .slice(0, MAX_LIST)
      .map((c) => `${clip(c.file, MAX_PATH)}:${c.line} ${clip(c.name, MAX_NAME)}`),
    endpoints: d.endpoints_affected.slice(0, MAX_LIST).map((e) => clip(e, MAX_NAME)),
    crons: d.crons_affected.slice(0, MAX_LIST).map((e) => clip(e, MAX_NAME)),
  })),
});
