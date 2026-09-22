import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal. */
export const s = {
  body: { padding: "18px 22px 8px" } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 13px",
    borderRadius: 8,
    background: "var(--accent-bg)",
    border: "1px solid var(--border)",
    marginBottom: 18,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  bannerStrong: { color: "var(--text-primary)" } satisfies CSSProperties,
  bannerMono: { color: "var(--accent-text)" } satisfies CSSProperties,
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  col: { flex: 1 } satisfies CSSProperties,
  toggleWrap: { display: "flex", alignItems: "center", height: 36 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  footerNote: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginRight: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  loading: { padding: "28px 22px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: {
    marginBottom: 16,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
  toastLink: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
