import type { Settings } from '@devdigest/shared';

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/**
 * Collapse key/value setting rows into a flat `Settings` object. A later row
 * wins over an earlier one with the same key; a `__proto__` key is skipped so
 * a stored row can never replace the object's prototype.
 */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.key === '__proto__') continue;
    out[r.key] = r.value;
  }
  return out as Settings;
}
