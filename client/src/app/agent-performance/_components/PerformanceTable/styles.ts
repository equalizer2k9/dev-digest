import type { CSSProperties } from "react";

export const s = {
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
  sortBtn: {
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" } satisfies CSSProperties,
  row: { cursor: "pointer" } satisfies CSSProperties,
  rowStatic: { cursor: "default" } satisfies CSSProperties,
  name: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  sub: { display: "block", fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  acceptCell: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 } satisfies CSSProperties,
  panel: {
    padding: "8px 10px 12px 28px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  panelTitle: { fontSize: 11, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  line: { display: "flex", gap: 16, fontSize: 13, padding: "2px 0" } satisfies CSSProperties,
  lineLabel: { flex: 1, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
