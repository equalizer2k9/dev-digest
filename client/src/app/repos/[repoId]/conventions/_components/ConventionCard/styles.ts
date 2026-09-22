import type { CSSProperties } from "react";
import { ACTION_COLUMN_WIDTH, CONFIDENCE_BAR_WIDTH } from "./constants";

/** Co-located styles for ConventionCard. */
export const s = {
  /**
   * The three non-left sides are set individually rather than through `border`:
   * a `border` shorthand next to the dynamic `borderLeft` makes React warn about
   * a conflicting property on every re-render (see client/INSIGHTS.md).
   */
  card: (accepted: boolean) =>
    ({
      borderTop: "1px solid var(--border)",
      borderRight: "1px solid var(--border)",
      borderBottom: "1px solid var(--border)",
      borderLeft: `3px solid ${accepted ? "var(--ok)" : "var(--border)"}`,
      borderRadius: 9,
      background: "var(--bg-elevated)",
      padding: 16,
      marginBottom: 12,
      transition: "border-color .12s",
    }) satisfies CSSProperties,
  row: { display: "flex", gap: 14 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  ruleRow: { display: "flex", alignItems: "flex-start", gap: 10 } satisfies CSSProperties,
  rule: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    fontStyle: "italic",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  evidence: {
    marginTop: 10,
    borderRadius: 7,
    border: "1px solid var(--border)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "5px 10px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 11.5,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    background: "var(--code-bg)",
    overflow: "auto",
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  } satisfies CSSProperties,
  confidenceLabel: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  confidenceBar: { width: CONFIDENCE_BAR_WIDTH } satisfies CSSProperties,
  confidenceValue: { fontSize: 11, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
    flexShrink: 0,
    width: ACTION_COLUMN_WIDTH,
  } satisfies CSSProperties,
  editFields: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  editLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    display: "block",
    marginBottom: 4,
  } satisfies CSSProperties,
} as const;
