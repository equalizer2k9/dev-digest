import type { EvalRunRecord } from '@devdigest/shared';
import type { EvalRunDbRow } from './repository.js';

/** A located zone of one PR; two cases of opposite type must not share a line of it. */
export interface EvalZone {
  pr_id: string;
  file: string;
  start_line: number;
  end_line: number;
}

/**
 * The frozen input of a case: one file's patch behind the same header
 * `diffFromPrFiles` builds, so `parseUnifiedDiff` reads it back unchanged.
 */
export function frozenDiff(path: string, patch: string): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n');
}

/** Same PR, same file and ranges sharing at least one line (touching counts). */
export function zonesIntersect(a: EvalZone, b: EvalZone): boolean {
  if (a.pr_id !== b.pr_id || a.file !== b.file) return false;
  const aLo = Math.min(a.start_line, a.end_line);
  const aHi = Math.max(a.start_line, a.end_line);
  const bLo = Math.min(b.start_line, b.end_line);
  const bHi = Math.max(b.start_line, b.end_line);
  return aLo <= bHi && bLo <= aHi;
}

/** An `eval_runs` row (plus its agent's name) as the API shows it. */
export function toRunRecord(row: EvalRunDbRow, agentName: string): EvalRunRecord {
  return {
    id: row.id,
    agent_id: row.agentId ?? '',
    agent_name: agentName,
    agent_version: row.agentVersion ?? 0,
    provider: row.provider ?? '',
    model: row.model ?? '',
    skills: row.skills ?? [],
    status: row.status,
    has_errors: row.hasErrors,
    error: row.error,
    started_at: row.ranAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    passed: row.passed ?? 0,
    total: row.total ?? 0,
    cost_usd: row.costUsd,
  };
}
