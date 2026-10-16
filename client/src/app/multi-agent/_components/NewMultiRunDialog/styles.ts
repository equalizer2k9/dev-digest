import type { CSSProperties } from "react";

/** Co-located styles for NewMultiRunDialog. */
export const s = {
  fields: { display: "flex", flexDirection: "column", gap: 12, padding: "20px 20px 0" } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
