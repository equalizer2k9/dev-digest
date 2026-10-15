import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's Evals tab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  section: { marginTop: 24 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  statusLine: (failed: boolean): CSSProperties => ({
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 7,
    marginBottom: 12,
    border: `1px solid ${failed ? "var(--crit)" : "var(--border)"}`,
    background: failed ? "var(--crit-bg)" : "var(--bg-elevated)",
    color: failed ? "var(--crit)" : "var(--text-secondary)",
  }),
  inlineError: { fontSize: 13, color: "var(--crit)", marginBottom: 12 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 6,
  } satisfies CSSProperties,
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
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
} as const;

/** Badge colors per case status — CSS vars only. */
export const CASE_STATUS_COLORS = {
  passed: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  error: { color: "var(--warn)", bg: "var(--warn-bg)" },
  never_run: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
} as const;
