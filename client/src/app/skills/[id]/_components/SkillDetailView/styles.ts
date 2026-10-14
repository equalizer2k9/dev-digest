import type { CSSProperties } from "react";

/** Co-located styles for the skill detail page and its three tabs. */
export const s = {
  // ---- shell ----
  wrap: { display: "flex", flexDirection: "column", minHeight: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "20px 32px 0",
    maxWidth: 1100,
    margin: "0 auto",
    width: "100%",
  } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  back: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-secondary)",
    background: "none",
    border: "none",
    cursor: "pointer",
  } satisfies CSSProperties,
  tabsBar: { maxWidth: 1100, margin: "14px auto 0", width: "100%", padding: "0 32px" } satisfies CSSProperties,
  body: { maxWidth: 1100, margin: "0 auto", width: "100%", padding: "24px 32px 44px" } satisfies CSSProperties,

  // ---- Config tab ----
  form: { maxWidth: 760 } satisfies CSSProperties,
  formHeader: { display: "flex", alignItems: "center", marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  danger: {
    marginTop: 32,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  dangerTitle: { fontSize: 14, fontWeight: 700, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "6px 0 12px",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  // ---- Preview tab ----
  preview: {
    maxWidth: 820,
    padding: "18px 20px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 14,
  } satisfies CSSProperties,
  previewEmpty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  // ---- Versioning tab ----
  versionsIntro: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 16,
    maxWidth: 680,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  versionRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
    maxWidth: 820,
  } satisfies CSSProperties,
  versionLabel: { fontSize: 13, fontWeight: 600, width: 60 } satisfies CSSProperties,
  versionDate: { fontSize: 12, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  versionActions: { display: "flex", gap: 8 } satisfies CSSProperties,

  // ---- Diff modal ----
  diffBody: { padding: 0 } satisfies CSSProperties,
  diffLegend: {
    padding: "12px 20px",
    fontSize: 12,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  diffPre: {
    margin: 0,
    padding: "12px 0",
    fontSize: 12,
    lineHeight: 1.6,
    background: "var(--code-bg)",
    maxHeight: 440,
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (op: "add" | "remove" | "context"): CSSProperties => ({
    display: "block",
    padding: "0 20px",
    whiteSpace: "pre-wrap",
    color:
      op === "add" ? "var(--ok)" : op === "remove" ? "var(--crit)" : "var(--text-muted)",
    background:
      op === "add" ? "var(--ok-bg)" : op === "remove" ? "var(--crit-bg)" : "transparent",
  }),
  diffNote: { padding: 20, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  diffFooter: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
