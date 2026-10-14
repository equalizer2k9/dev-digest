import type { CSSProperties } from "react";

/** Co-located styles for DiffTab. */
export const s = {
  switchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  rest: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
