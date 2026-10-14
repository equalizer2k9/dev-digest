import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Exactly two tabs ship with Skills Lab — Evals, Stats and CI are later work. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
];

/** Tab keys the `?tab` query param is validated against. */
export const TAB_KEYS: readonly string[] = TABS.map((t) => t.key);

/** Tab used when `?tab` is missing or unknown. */
export const DEFAULT_TAB = "config";
