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
