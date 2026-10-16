import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's CI tab. */
export const s = {
  wrap: { maxWidth: 980, display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 15, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  repo: { fontWeight: 600 } satisfies CSSProperties,
  failOnRow: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  failOnSelect: { width: 240 } satisfies CSSProperties,
} as const;
