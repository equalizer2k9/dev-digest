import type { CSSProperties } from "react";

/** Co-located styles for DiffRoleGroup. */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 4px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border)",
    textAlign: "left",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  label: { fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  hint: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  findings: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--warn)",
  } satisfies CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;

/** Header chevron rotates 90deg when the group is open; dimmed when it cannot open. */
export function chevronFor(open: boolean, disabled: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    opacity: disabled ? 0.4 : 1,
  };
}

/** Header cursor: a group with no files is inert. */
export function headerCursorFor(disabled: boolean): CSSProperties {
  return { cursor: disabled ? "default" : "pointer" };
}
