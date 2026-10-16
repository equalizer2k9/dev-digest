import type { CSSProperties } from "react";

/** Co-located styles for DisagreementsSection. */
export const s = {
  toolbar: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13 } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", color: "var(--text-primary)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  finding: { wordBreak: "break-word" } satisfies CSSProperties,
  conflict: { marginLeft: 8 } satisfies CSSProperties,
  note: { color: "var(--text-muted)", fontSize: 13, padding: "12px 0" } satisfies CSSProperties,
} as const;
