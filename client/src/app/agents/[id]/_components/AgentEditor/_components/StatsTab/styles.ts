import type { CSSProperties } from "react";

export const s = {
  wrap: { padding: 24, maxWidth: 900 } satisfies CSSProperties,
  head: { display: "flex", justifyContent: "flex-end", marginBottom: 16 } satisfies CSSProperties,
  cards: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  line: { display: "block" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
  emptyTitle: { fontSize: 16, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  /** The cost badge wraps inside a narrow KPI card instead of being clipped. */
  costBadge: { whiteSpace: "normal", maxWidth: "100%" } satisfies CSSProperties,
} as const;
