import type { BlastDegradedReason } from "@devdigest/shared";

/** Degraded reason → message key under the `blast` namespace. Total over the contract enum. */
export const REASON_KEYS: Record<BlastDegradedReason, string> = {
  flag_off: "degraded.reason.flag_off",
  index_failed: "degraded.reason.index_failed",
  index_partial: "degraded.reason.index_partial",
  repo_too_large: "degraded.reason.repo_too_large",
  no_data: "degraded.reason.no_data",
};

/** `degraded: true` without a reason cannot come from the server; show the no-data text. */
export const FALLBACK_REASON: BlastDegradedReason = "no_data";
