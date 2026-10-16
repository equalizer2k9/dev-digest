import type { Severity } from '@devdigest/shared';

/** Minimum Jaccard title similarity for two findings to share a group. */
export const SIMILARITY_THRESHOLD = 0.3;
export const MULTI_RUN_MIN_AGENTS = 2;
export const MULTI_RUN_MAX_AGENTS = 5;
/** How many of an agent's latest finished runs feed its cost/time estimate. */
export const ESTIMATE_WINDOW = 10;
export const MULTI_RUN_LIST_LIMIT = 20;

/** Higher = more severe; picks a group's representative. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};
