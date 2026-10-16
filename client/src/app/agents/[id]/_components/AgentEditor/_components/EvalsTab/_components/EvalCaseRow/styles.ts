import type { CSSProperties } from "react";

/** Co-located styles for the Evals tab's case row. */
export const s = {
  row: {
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 6,
  } satisfies CSSProperties,
  main: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  name: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  location: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  below: { marginTop: 8 } satisfies CSSProperties,
  form: { display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  nameField: { flex: 1, minWidth: 180 } satisfies CSSProperties,
  lineField: { width: 90 } satisfies CSSProperties,
  fieldLabel: { fontSize: 12, color: "var(--text-muted)", marginBottom: 4 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
} as const;

/** Badge colors per case status — CSS vars only. */
export const CASE_STATUS_COLORS = {
  passed: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  error: { color: "var(--warn)", bg: "var(--warn-bg)" },
  never_run: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
} as const;
