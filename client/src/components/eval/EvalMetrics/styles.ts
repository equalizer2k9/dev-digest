import type { CSSProperties } from "react";

/** Co-located styles for EvalMetrics. */
export const s = {
  wrap: { display: "flex", alignItems: "stretch", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 120,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    letterSpacing: 0.4,
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  value: { fontSize: 22, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  na: { fontSize: 22, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  passed: { alignSelf: "center", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
};
