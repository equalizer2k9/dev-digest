import type { EvalRunStatus } from "@devdigest/shared";

/** Badge colors per run status — CSS vars only. */
export const STATUS_COLORS: Record<EvalRunStatus, { color: string; bg: string }> = {
  running: { color: "var(--info)", bg: "var(--info-bg)" },
  completed: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
};
