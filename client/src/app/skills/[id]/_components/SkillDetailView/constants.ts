import type { IconName } from "@devdigest/ui";

/** Constants for the skill detail page. */

/** Tab descriptor; `labelKey` resolves under the `skills` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Exactly three tabs — Evals and Stats are out of scope for this feature. */
export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "tabs.preview", icon: "Eye" },
  { key: "versioning", labelKey: "tabs.versioning", icon: "History" },
];

export const TAB_KEYS: readonly string[] = TABS.map((t) => t.key);

/** Default tab when `?tab` is missing or unknown. */
export const DEFAULT_TAB = "config";

/**
 * Cap on the LCS table used by the browser-side version diff (rows × columns).
 * Past it the diff degrades to "everything removed, everything added" instead
 * of allocating a multi-million-cell matrix on the main thread.
 */
export const MAX_DIFF_CELLS = 4_000_000;
