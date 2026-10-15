import type { CSSProperties } from "react";

/** Co-located styles for SerializesAs. */
export const s = {
  wrap: {
    marginTop: 16,
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600, marginBottom: 8 } satisfies CSSProperties,
  empty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  group: { marginTop: 8 } satisfies CSSProperties,
  list: { listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, fontSize: 12 } satisfies CSSProperties,
  path: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  tokens: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  mark: { color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
} as const;
