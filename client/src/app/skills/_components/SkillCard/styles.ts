import type { CSSProperties } from "react";
import { DISABLED_OPACITY } from "./constants";

/** Co-located styles for SkillCard. */
export const s = {
  card: (enabled: boolean): CSSProperties => ({
    padding: 14,
    borderRadius: 8,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    opacity: enabled ? 1 : DISABLED_OPACITY,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  iconBox: (color: string): CSSProperties => ({
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "var(--bg-hover)",
    color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
  name: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  /** Wraps the toggle + trash so their clicks never reach the card. */
  actions: { display: "flex", alignItems: "center", gap: 4 } satisfies CSSProperties,
  description: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  agentCount: { fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" } satisfies CSSProperties,
} as const;
