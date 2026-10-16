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
  dashboardLink: { display: "flex", justifyContent: "flex-end", marginBottom: 8 } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent-text)", textDecoration: "none" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
} as const;
