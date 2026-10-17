import type { DonutSegment } from "@devdigest/ui";
import type { PerfCostBreakdown } from "@devdigest/shared";
import { formatUsd } from "@/lib/agent-performance";

export interface LegendLine {
  label: string;
  /** null on the unpriced line: it has no amount. */
  amount: string | null;
  /** whole percent of the priced total; null on the unpriced line. */
  share: number | null;
  color: string | null;
}

type T = (key: string, values?: Record<string, string | number>) => string;

/** `key: null` is the unknown model (models) or the Deleted agent (agents). */
const lineLabel = (label: string | null, unknown: string) => label ?? unknown;

/** Priced lines only — the unpriced line is never a slice. */
export function donutSegments(b: PerfCostBreakdown, colors: readonly string[], unknown: string): DonutSegment[] {
  return b.lines.map((l, i) => ({
    label: lineLabel(l.label, unknown),
    value: l.cost_usd,
    color: colors[i % colors.length]!,
  }));
}

/** Whole-percent shares that add up to exactly 100 (largest remainder). */
function shares(values: number[], total: number): number[] {
  if (!(total > 0)) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
    .forEach(({ i }) => {
      if (left-- > 0) out[i]!++;
    });
  return out;
}

/** The legend: every priced line with amount and share, then the unpriced line (no amount). */
export function legendLines(
  b: PerfCostBreakdown,
  total: number | null,
  t: T,
  unknownKey: "breakdown.unknownModel" | "table.deletedAgent",
  colors: readonly string[] = [],
): LegendLine[] {
  const pricedTotal = total ?? b.lines.reduce((a, l) => a + l.cost_usd, 0);
  const pct = shares(
    b.lines.map((l) => l.cost_usd),
    pricedTotal,
  );
  const out: LegendLine[] = b.lines.map((l, i) => ({
    label: lineLabel(l.label, t(unknownKey)),
    amount: formatUsd(l.cost_usd),
    share: pct[i]!,
    color: colors.length ? colors[i % colors.length]! : null,
  }));
  if (b.unpriced_runs > 0) {
    out.push({ label: t("breakdown.unpriced", { runs: b.unpriced_runs }), amount: null, share: null, color: null });
  }
  return out;
}
