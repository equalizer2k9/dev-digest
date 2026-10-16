import type { CSSProperties } from "react";
import type { EvalCaseStatus } from "@devdigest/shared";

/** Co-located styles for EvalSingleRunResult. */
export const s = {
  box: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  line: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 12.5 } satisfies CSSProperties,
} as const;

/** Badge colors per single-run status — CSS vars only. */
export const STATUS_COLORS: Record<EvalCaseStatus, { color: string; bg: string }> = {
  passed: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  error: { color: "var(--warn)", bg: "var(--warn-bg)" },
};
