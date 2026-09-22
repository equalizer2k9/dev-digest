import type { CSSProperties } from "react";
import { CONTENT_MAX_WIDTH } from "./constants";

/** Co-located styles for ConventionsView. */
export const s = {
  page: {
    padding: "20px 28px 40px",
    maxWidth: CONTENT_MAX_WIDTH,
    margin: "0 auto",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  notes: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  scanButtons: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  inlineError: {
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--warn)",
    background: "var(--bg-surface)",
    color: "var(--warn)",
    fontSize: 13,
    marginBottom: 16,
  } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
