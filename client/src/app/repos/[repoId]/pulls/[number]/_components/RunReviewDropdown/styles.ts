import type { CSSProperties } from "react";

/** Co-located styles for RunReviewDropdown. */
export const s = {
  root: { display: "inline-flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  latestLink: { fontSize: 12, color: "var(--accent)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
