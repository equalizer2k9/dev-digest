import type { CSSProperties } from "react";

export const s = {
  wrap: { marginTop: 8 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  parts: { display: "flex", gap: 32, flexWrap: "wrap" } satisfies CSSProperties,
  part: { flex: 1, minWidth: 280 } satisfies CSSProperties,
  partTitle: { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  body: { display: "flex", alignItems: "center", gap: 20 } satisfies CSSProperties,
  legend: { display: "flex", flexDirection: "column", gap: 8, flex: 1 } satisfies CSSProperties,
  legendRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  swatch: { width: 9, height: 9, borderRadius: 2 } satisfies CSSProperties,
  label: { flex: 1, color: "var(--text-secondary)" } satisfies CSSProperties,
  amount: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  share: { color: "var(--text-muted)", minWidth: 36, textAlign: "right" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
