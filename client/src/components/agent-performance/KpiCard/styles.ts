import type { CSSProperties } from "react";

export const s = {
  card: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  value: { fontSize: 26, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  badge: { marginTop: 2 } satisfies CSSProperties,
} as const;
