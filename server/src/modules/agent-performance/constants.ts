import type { PerfPeriodPreset } from '@devdigest/shared';

/** Decisions below this count flag a row as low sample (AC-6). */
export const LOW_SAMPLE_THRESHOLD = 5;

/** Run statuses that count toward the dashboard (AC-2). */
export const COUNTED_STATUSES = ['done', 'failed'] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Rolling-window length of the presets that are not `custom`. */
export const PRESET_DAYS: Record<Exclude<PerfPeriodPreset, 'custom'>, number> = { '1d': 1, '30d': 30 };

export const DEFAULT_PRESET: PerfPeriodPreset = '30d';

/** Money is summed as integer nano-USD so grouping order never changes a total (D-5). */
export const COST_SCALE = 1e9;
