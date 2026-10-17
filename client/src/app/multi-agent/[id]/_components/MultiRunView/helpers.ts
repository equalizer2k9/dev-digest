/** Pure helpers for MultiRunView. */

import type { MultiRunStatus } from "@devdigest/shared";

export const STATUS_COLORS: Record<MultiRunStatus, { color: string; bg: string }> = {
  running: { color: "var(--info)", bg: "var(--bg-hover)" },
  done: { color: "var(--success)", bg: "var(--bg-hover)" },
  failed: { color: "var(--danger)", bg: "var(--bg-hover)" },
};

/** Total tokens as `in / out`. */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${tokensIn} / ${tokensOut}`;
}

export const VIEWS = ["columns", "tabs"] as const;
export type View = (typeof VIEWS)[number];

/** View from `?view=`; anything but `tabs` is the default `columns`. */
export function parseView(raw: string | null): View {
  return raw === "tabs" ? "tabs" : "columns";
}

/** Query string for a view, other params kept; `columns` drops `view` (it is the default). */
export function withView(search: URLSearchParams | null, view: View): string {
  const next = new URLSearchParams(search?.toString() ?? "");
  if (view === "tabs") next.set("view", "tabs");
  else next.delete("view");
  const q = next.toString();
  return q ? `?${q}` : "";
}
