import type { CSSProperties } from "react";

/** Co-located styles for the CI Runs page. */
export const s = {
  wrap: { maxWidth: 1080, margin: "0 auto", padding: 24 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 } satisfies CSSProperties,
  title: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "8px 12px",
    marginBottom: 12,
  } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
  emptyTitle: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
} as const;
