import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  error: {
    marginBottom: 16,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
  fileInput: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  preview: { marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  previewTitle: { fontSize: 14, fontWeight: 700, marginBottom: 14 } satisfies CSSProperties,
  warnings: { marginBottom: 18 } satisfies CSSProperties,
  warningList: {
    margin: "8px 0 0",
    paddingLeft: 20,
    fontSize: 12,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  renderedBody: {
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    maxHeight: 220,
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
