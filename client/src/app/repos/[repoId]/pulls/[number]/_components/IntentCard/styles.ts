import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    margin: 0,
  } satisfies CSSProperties,
  label: {
    fontSize: 11.5,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 16,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  muted: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sources: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  sourceRow: {
    display: "flex",
    gap: 8,
    alignItems: "baseline",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  sourceRef: {
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-primary)",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  inlineError: {
    fontSize: 13,
    color: "var(--danger, var(--text-primary))",
  } satisfies CSSProperties,
} as const;
