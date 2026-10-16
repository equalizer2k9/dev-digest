/**
 * USD cost for display, one rule for every place outside the design system's RunCostBadge:
 * 4 decimals below a tenth of a cent (a review run often costs $0.0005, which 3 decimals
 * print as "$0.000"), 3 below $1, 2 above. An unknown cost is the dash, never "$0.00".
 */
export function formatCost(usd: number | null | undefined, dash = "—"): string {
  if (usd == null) return dash;
  if (usd > 0 && usd < 0.001) return `$${usd.toFixed(4)}`;
  return usd < 1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}
