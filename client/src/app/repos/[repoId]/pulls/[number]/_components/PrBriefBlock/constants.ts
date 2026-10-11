import type { RiskSeverity } from "@devdigest/shared";

/** Severity → message key under `brief` and CSS-var colors. */
export const SEVERITY_KEYS: Record<RiskSeverity, "severity.high" | "severity.medium" | "severity.low"> = {
  high: "severity.high",
  medium: "severity.medium",
  low: "severity.low",
};

export const SEVERITY_COLORS: Record<RiskSeverity, { color: string; bg: string }> = {
  high: { color: "var(--crit)", bg: "var(--crit-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--info)", bg: "var(--info-bg)" },
};
