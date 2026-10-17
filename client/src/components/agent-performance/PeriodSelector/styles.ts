import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  custom: { display: "flex", alignItems: "flex-end", gap: 8 } satisfies CSSProperties,
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  input: {
    padding: "5px 8px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
