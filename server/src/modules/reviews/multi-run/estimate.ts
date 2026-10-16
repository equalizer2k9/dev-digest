/** Pure per-agent cost/time estimate from its latest finished runs (AC-6). */
import { ESTIMATE_WINDOW } from './constants.js';

function mean(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  return known.reduce((a, b) => a + b, 0) / known.length;
}

/** `rows` arrive newest first; only the first ESTIMATE_WINDOW are used. */
export function estimateAgent(rows: { durationMs: number | null; costUsd: number | null }[]): {
  duration_ms: number | null;
  cost_usd: number | null;
  runs: number;
} {
  const used = rows.slice(0, ESTIMATE_WINDOW);
  return {
    duration_ms: mean(used.map((r) => r.durationMs)),
    cost_usd: mean(used.map((r) => r.costUsd)),
    runs: used.length,
  };
}
