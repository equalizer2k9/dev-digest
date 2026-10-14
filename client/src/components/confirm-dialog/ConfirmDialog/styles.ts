import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDialog. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: {
    padding: 24,
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
