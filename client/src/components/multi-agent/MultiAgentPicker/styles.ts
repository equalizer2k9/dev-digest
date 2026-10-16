import type { CSSProperties } from "react";

/** Co-located styles for MultiAgentPicker. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 12, padding: 20 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  rowLabel: { display: "flex", justifyContent: "space-between", gap: 16, width: "100%" } satisfies CSSProperties,
  name: { color: "var(--text-primary)" } satisfies CSSProperties,
  estimate: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  total: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
  actions: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
