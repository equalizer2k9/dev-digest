import type { CSSProperties } from "react";

/** Co-located styles for AttachmentsEditor. */
export const s = {
  split: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 16,
    alignItems: "start",
  } satisfies CSSProperties,
  skeleton: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
