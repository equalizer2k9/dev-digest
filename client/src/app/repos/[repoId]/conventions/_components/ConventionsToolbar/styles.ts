import type { CSSProperties } from "react";

/** Co-located styles for ConventionsToolbar. */
export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  right: { marginLeft: "auto" } satisfies CSSProperties,
} as const;
