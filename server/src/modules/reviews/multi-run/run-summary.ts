/** Pure status / totals / wall-clock of a multi run (AC-7, AC-12). */
import type { MultiRunStatus } from '@devdigest/shared';

/** Rows are created as 'running'; null / 'queued' count as in progress too. */
export function isInProgress(status: string | null): boolean {
  return status === null || status === 'queued' || status === 'running';
}

export function multiRunStatus(statuses: (string | null)[]): MultiRunStatus {
  if (statuses.some(isInProgress)) return 'running';
  if (statuses.length > 0 && statuses.every((s) => s === 'failed' || s === 'cancelled')) return 'failed';
  return 'done';
}

export function usageTotals(
  runs: { tokensIn: number | null; tokensOut: number | null; costUsd: number | null }[],
): { tokens_in: number; tokens_out: number; cost_usd: number | null } {
  let tokensIn = 0;
  let tokensOut = 0;
  let cost = 0;
  let anyCost = false;
  for (const r of runs) {
    tokensIn += r.tokensIn ?? 0;
    tokensOut += r.tokensOut ?? 0;
    if (r.costUsd !== null) {
      cost += r.costUsd;
      anyCost = true;
    }
  }
  return { tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: anyCost ? cost : null };
}

/** null while any run is in progress; else the latest finish minus the start. */
export function wallClockMs(
  startedAt: Date,
  runs: { status: string | null; finishedAt: Date | null }[],
): number | null {
  if (runs.some((r) => isInProgress(r.status))) return null;
  let latest = startedAt.getTime();
  for (const r of runs) {
    if (r.finishedAt) latest = Math.max(latest, r.finishedAt.getTime());
  }
  return latest - startedAt.getTime();
}
