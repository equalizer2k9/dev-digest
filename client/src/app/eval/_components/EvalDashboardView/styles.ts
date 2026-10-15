import type { CSSProperties } from "react";

/** Co-located styles for the Eval Dashboard. */
export const s = {
  wrap: { maxWidth: 980, margin: "0 auto", padding: 24 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, marginBottom: 16 } satisfies CSSProperties,
  section: { marginBottom: 28 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, marginBottom: 8 } satisfies CSSProperties,
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
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  row: { cursor: "pointer" } satisfies CSSProperties,
  nameBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontWeight: 600,
    color: "var(--text-primary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
} as const;
