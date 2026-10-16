import type { CSSProperties } from "react";
import type { FragmentLine } from "./helpers";

/** Co-located styles for EvalCaseModal. */
export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    padding: "20px 24px",
  } satisfies CSSProperties,
  col: { minWidth: 0 } satisfies CSSProperties,
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 8,
  } satisfies CSSProperties,
  diff: {
    margin: 0,
    maxHeight: 340,
    overflow: "auto",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
    lineHeight: 1.55,
  } satisfies CSSProperties,
  diffEmpty: { fontSize: 12.5, color: "var(--text-muted)", padding: "10px 12px" } satisfies CSSProperties,
  readonlyRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } satisfies CSSProperties,
  readonlyKey: { fontSize: 12, color: "var(--text-muted)", width: 48 } satisfies CSSProperties,
  file: { fontSize: 12.5, color: "var(--text-primary)", wordBreak: "break-all" } satisfies CSSProperties,
  lines: { display: "flex", gap: 12, marginBottom: 14 } satisfies CSSProperties,
  lineField: { flex: 1 } satisfies CSSProperties,
  lineLabel: { fontSize: 12, color: "var(--text-muted)", marginBottom: 4 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  refusal: {
    fontSize: 14,
    color: "var(--crit)",
    padding: "20px 24px",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
} as const;

/** One diff line: +/- backgrounds from the code tokens, hunk headers in the accent, zone marked at the edge. */
export function diffLine(l: FragmentLine): CSSProperties {
  const background =
    l.kind === "add" ? "var(--code-add)" : l.kind === "del" ? "var(--code-del)" : "transparent";
  return {
    display: "block",
    padding: "0 12px",
    whiteSpace: "pre",
    background: l.highlighted ? `linear-gradient(var(--accent-bg), var(--accent-bg)), ${background}` : background,
    color:
      l.kind === "hunk"
        ? "var(--accent-text)"
        : l.kind === "add"
          ? "var(--code-add-text)"
          : l.kind === "del"
            ? "var(--code-del-text)"
            : "var(--text-secondary)",
    boxShadow: l.highlighted ? "inset 3px 0 0 var(--accent)" : undefined,
    fontWeight: l.highlighted ? 600 : 400,
  };
}
