import type { CSSProperties } from "react";

/** Co-located styles for MultiRunListView. */
export const s = {
  wrap: { maxWidth: 1080, margin: "0 auto", padding: 24 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", color: "var(--text-primary)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  link: { color: "var(--accent)" } satisfies CSSProperties,
} as const;
