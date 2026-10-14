import type { FindingActionKind } from "@devdigest/shared";
import { FINDINGS_SEVERITIES } from "@/lib/findings";

/** Sort weight per severity (lower = shown first), derived from the shared
 *  order. `INFO` (never emitted by the contract) sorts after all of them. */
export const SEVERITY_ORDER: Record<string, number> = {
  ...Object.fromEntries(FINDINGS_SEVERITIES.map((sev, i) => [sev, i])),
  INFO: FINDINGS_SEVERITIES.length,
};

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};

/** Severities the filter row offers — always all three, whether or not this run
 *  has findings at that level. Driven by the wire contract, not by `SEV`, which
 *  carries a fourth value (`INFO`) the contract never emits. */
export const FILTER_SEVERITIES = FINDINGS_SEVERITIES;
