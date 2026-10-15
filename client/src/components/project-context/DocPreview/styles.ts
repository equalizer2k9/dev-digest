import type { CSSProperties } from "react";

/** Co-located styles for DocPreview. */
export const s = {
  wrap: {
    minWidth: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  path: {
    fontSize: 12,
    color: "var(--text-muted)",
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  body: { padding: "14px 16px", fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", padding: "24px 16px" } satisfies CSSProperties,
  center: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
