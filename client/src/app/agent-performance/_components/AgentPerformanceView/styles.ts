import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 1100, margin: "0 auto", padding: 24 } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16,
  } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  cards: { display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" } satisfies CSSProperties,
  section: { marginBottom: 28 } satisfies CSSProperties,
  line: { display: "block" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
  emptyTitle: { fontSize: 16, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
} as const;
