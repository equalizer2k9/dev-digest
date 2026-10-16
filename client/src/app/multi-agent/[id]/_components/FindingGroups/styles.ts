import type { CSSProperties } from "react";

/** Co-located styles for FindingGroups. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "10px 14px",
    background: "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  title: { flex: 1, fontWeight: 600, wordBreak: "break-word" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  members: { display: "flex", flexDirection: "column", gap: 8, padding: "0 14px 14px" } satisfies CSSProperties,
} as const;
