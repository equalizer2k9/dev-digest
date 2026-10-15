import type {
  EvalCaseResult,
  EvalExpectation,
  EvalExpectationType,
  EvalKeptFinding,
  EvalMetric,
} from '@devdigest/shared';

/**
 * Pure scoring of an eval run. No I/O and no model call: statuses and metrics are
 * computed from the kept findings the engine's grounding gate already produced.
 */

const lo = (a: number, b: number) => (a < b ? a : b);
const hi = (a: number, b: number) => (a > b ? a : b);

/** Kept findings on the expectation's file whose range (low..high) shares a line with it. */
export function countMatches(kept: EvalKeptFinding[], exp: EvalExpectation): number {
  const eStart = lo(exp.start_line, exp.end_line);
  const eEnd = hi(exp.start_line, exp.end_line);
  return kept.filter(
    (f) =>
      f.file === exp.file &&
      lo(f.start_line, f.end_line) <= eEnd &&
      hi(f.start_line, f.end_line) >= eStart,
  ).length;
}

export function caseStatus(type: EvalExpectationType, matches: number): 'passed' | 'failed' {
  if (type === 'must_find') return matches >= 1 ? 'passed' : 'failed';
  return matches === 0 ? 'passed' : 'failed';
}

/** `null` when the denominator is 0: "n/a" is never 0 or 1. */
const ratio = (num: number, den: number): EvalMetric => (den === 0 ? null : num / den);

export function scoreRun(results: EvalCaseResult[]): {
  recall: EvalMetric;
  precision: EvalMetric;
  citation_accuracy: EvalMetric;
  passed: number;
  total: number;
  has_errors: boolean;
} {
  const scored = results.filter((r) => r.status !== 'error');

  const mustFind = scored.filter((r) => r.type === 'must_find');
  const found = mustFind.filter((r) => r.status === 'passed').length;

  let keptTotal = 0;
  let keptOnForbidden = 0;
  let keptCount = 0;
  let droppedCount = 0;
  for (const r of scored) {
    keptTotal += r.kept_findings.length;
    if (r.type === 'must_not_flag') {
      keptOnForbidden += countMatches(r.kept_findings, {
        type: r.type,
        file: r.file,
        start_line: r.start_line,
        end_line: r.end_line,
        title: '',
      });
    }
    keptCount += r.kept;
    droppedCount += r.dropped;
  }

  return {
    recall: ratio(found, mustFind.length),
    precision: keptTotal === 0 ? null : 1 - keptOnForbidden / keptTotal,
    citation_accuracy: ratio(keptCount, keptCount + droppedCount),
    passed: scored.filter((r) => r.status === 'passed').length,
    total: results.length,
    has_errors: results.some((r) => r.status === 'error'),
  };
}

/** Sum of the case costs; `null` when any is unknown, never a partial sum. */
export function runCost(results: EvalCaseResult[]): number | null {
  let sum = 0;
  for (const r of results) {
    if (r.cost_usd === null) return null;
    sum += r.cost_usd;
  }
  return sum;
}
