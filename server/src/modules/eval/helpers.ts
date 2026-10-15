import type {
  EvalCaseRef,
  EvalCaseResult,
  EvalCompare,
  EvalDiffLine,
  EvalMetric,
  EvalRunRecord,
  EvalRunSkill,
} from '@devdigest/shared';
import { TimeoutError } from '../../platform/resilience.js';
import { errorKind, errorStatus } from '../_shared/error-kind.js';
import { CASE_TIMEOUT, MAX_DIFF_CELLS } from './constants.js';
import type { EvalRunDbRow } from './repository.js';

/** Thrown for a stored case that cannot be evaluated; its message is fixed text. */
export class IncompleteCaseError extends Error {
  override name = 'IncompleteCaseError';
}

/**
 * The reason stored on an `error` case: a fixed phrase plus the error's code or
 * class and HTTP status — never the provider's own text (as the review Live Log).
 */
export function caseErrorReason(err: unknown): string {
  if (err instanceof TimeoutError) return CASE_TIMEOUT;
  if (err instanceof IncompleteCaseError) return err.message;
  const msg = (err as Error | null)?.message ?? '';
  const status = errorStatus(err);
  const kind = `${errorKind(err)}${status !== undefined ? `, HTTP ${status}` : ''}`;
  if (/failed schema validation|structured output failed/i.test(msg)) return `output failed schema validation (${kind})`;
  if (/returned no choices/i.test(msg)) return `provider returned no choices (${kind})`;
  return `model call failed (${kind})`;
}

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

/** A run as the API shows it, with its stored per-case results. */
export interface RunWithResults {
  run: EvalRunRecord;
  results: EvalCaseResult[];
}

/**
 * Line diff of two texts (LCS). Same algorithm and cap as the studio's skill-version
 * diff; above `MAX_DIFF_CELLS` it degrades to remove-all + add-all.
 */
export function diffLines(before: string, after: string): EvalDiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  if (n * m > MAX_DIFF_CELLS) {
    return [
      ...a.map((text): EvalDiffLine => ({ op: 'remove', text })),
      ...b.map((text): EvalDiffLine => ({ op: 'add', text })),
    ];
  }

  // dp[i][j] = length of the LCS of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: EvalDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'context', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ op: 'remove', text: a[i]! });
      i++;
    } else {
      out.push({ op: 'add', text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ op: 'remove', text: a[i++]! });
  while (j < m) out.push({ op: 'add', text: b[j++]! });
  return out;
}

const delta = (earlier: EvalMetric | number | null, later: EvalMetric | number | null): number | null =>
  earlier === null || later === null ? null : later - earlier;

const skillKey = (s: EvalRunSkill) => `${s.name}@${s.version}`;

const caseRef = (r: EvalCaseResult): EvalCaseRef => ({
  case_id: r.case_id,
  name: r.name,
  type: r.type,
  file: r.file,
  start_line: r.start_line,
  end_line: r.end_line,
});

/**
 * Compare two runs of one agent. Ordered by `started_at` whatever the argument order;
 * every delta is later - earlier and null when either side is. `prompts` maps an agent
 * version to its system prompt (null = snapshot missing).
 */
export function compareRuns(
  a: RunWithResults,
  b: RunWithResults,
  prompts: Record<number, string | null | undefined>,
): Omit<EvalCompare, 'agent_id' | 'agent_name'> {
  const [early, late] = a.run.started_at <= b.run.started_at ? [a, b] : [b, a];

  const earlierByCase = new Map(early.results.map((r) => [r.case_id, r]));
  const laterByCase = new Map(late.results.map((r) => [r.case_id, r]));
  const changed: EvalCompare['changed'] = [];
  const added: EvalCaseRef[] = [];
  const removed: EvalCaseRef[] = [];
  for (const r of late.results) {
    const before = earlierByCase.get(r.case_id);
    if (!before) added.push(caseRef(r));
    else if (before.status !== r.status) {
      changed.push({ ...caseRef(r), earlier: before.status, later: r.status });
    }
  }
  for (const r of early.results) if (!laterByCase.has(r.case_id)) removed.push(caseRef(r));

  // Prompt: the same version, or equal texts, is "unchanged"; a missing snapshot is "unavailable".
  const ev = early.run.agent_version;
  const lv = late.run.agent_version;
  let prompt: EvalCompare['prompt'];
  if (ev === lv) {
    prompt = { status: 'unchanged', unavailable_versions: [], lines: [] };
  } else {
    const before = prompts[ev] ?? null;
    const after = prompts[lv] ?? null;
    const missing = [ev, lv].filter((v) => (prompts[v] ?? null) === null);
    if (before === null || after === null) {
      prompt = { status: 'unavailable', unavailable_versions: missing, lines: [] };
    } else if (before === after) {
      prompt = { status: 'unchanged', unavailable_versions: [], lines: [] };
    } else {
      prompt = { status: 'changed', unavailable_versions: [], lines: diffLines(before, after) };
    }
  }

  // Skills: set difference by name + version; the order of the shared ones matters too
  // (`agent_skills.order` shapes the prompt).
  const earlierKeys = new Set(early.run.skills.map(skillKey));
  const laterKeys = new Set(late.run.skills.map(skillKey));
  const sharedEarlier = early.run.skills.filter((s) => laterKeys.has(skillKey(s))).map(skillKey);
  const sharedLater = late.run.skills.filter((s) => earlierKeys.has(skillKey(s))).map(skillKey);

  return {
    earlier: early.run,
    later: late.run,
    delta: {
      recall: delta(early.run.recall, late.run.recall),
      precision: delta(early.run.precision, late.run.precision),
      citation_accuracy: delta(early.run.citation_accuracy, late.run.citation_accuracy),
      cost_usd: delta(early.run.cost_usd, late.run.cost_usd),
    },
    changed,
    added,
    removed,
    prompt,
    skills: {
      only_earlier: early.run.skills.filter((s) => !laterKeys.has(skillKey(s))),
      only_later: late.run.skills.filter((s) => !earlierKeys.has(skillKey(s))),
      reordered: sharedEarlier.join('\n') !== sharedLater.join('\n'),
    },
  };
}
