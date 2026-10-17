import type { CSSProperties } from "react";

/** Co-located styles for MultiRunView. */
export const s = {
  wrap: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  head: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0, wordBreak: "break-word" } satisfies CSSProperties,
  agents: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  stats: { display: "flex", flexWrap: "wrap", gap: 24, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  statValue: { color: "var(--text-primary)", fontWeight: 600, marginLeft: 6 } satisfies CSSProperties,
  notice: {
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 13,
    color: "var(--text-primary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  switch: {
    marginLeft: "auto",
    display: "flex",
    gap: 2,
    padding: 2,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 7,
  } satisfies CSSProperties,
  switchBtn: (on: boolean): CSSProperties => ({
    padding: "4px 12px",
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: on ? "var(--bg-elevated)" : "transparent",
    color: on ? "var(--text-primary)" : "var(--text-muted)",
  }),
  note: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 600, margin: "0 0 10px" } satisfies CSSProperties,
} as const;
