import type { CSSProperties } from "react";
import { COLUMN_MIN_WIDTH } from "./constants";

/** Co-located styles for AgentColumns. */
export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${COLUMN_MIN_WIDTH}px, 1fr))`,
    gap: 12,
  } satisfies CSSProperties,
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 14,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
  } satisfies CSSProperties,
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  stat: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--danger)", wordBreak: "break-word" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, marginTop: 4 } satisfies CSSProperties,
} as const;
