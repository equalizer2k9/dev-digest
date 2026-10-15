/**
 * Delay before re-running a failed background job. Exponential in the number
 * of consecutive failures and capped at `capMs`; half of it is fixed and half
 * random, so jobs that failed together do not all retry at the same moment.
 */
export function jobRetryDelayMs(failures: number, baseMs = 1_000, capMs = 5 * 60_000): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, failures - 1));
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}
