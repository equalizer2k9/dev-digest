const MINUS = "−";

/** 0..1 ratio → "83%"; null when unknown (the caller renders "n/a"). */
export function formatMetric(v: number | null | undefined): string | null {
  return v == null ? null : `${Math.round(v * 100)}%`;
}

/** Change of a 0..1 metric → "+12 pp" | "−5 pp" | "0 pp"; null when unknown. */
export function formatDeltaPp(d: number | null | undefined): string | null {
  if (d == null) return null;
  const pp = Math.round(d * 100);
  if (pp === 0) return "0 pp";
  return `${pp > 0 ? "+" : MINUS}${Math.abs(pp)} pp`;
}

export function formatPassed(passed: number, total: number): string {
  return `${passed}/${total}`;
}

/** Change of cost in USD → "+$0.012" | "−$0.004" | "$0.000"; null when unknown. */
export function formatCostDelta(d: number | null | undefined): string | null {
  if (d == null) return null;
  const abs = `$${Math.abs(d).toFixed(3)}`;
  if (abs === "$0.000") return abs;
  return `${d > 0 ? "+" : MINUS}${abs}`;
}
