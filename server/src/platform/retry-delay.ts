import ms from 'ms';

/**
 * Milliseconds to wait before the next retry: a human-readable base delay
 * ("500ms", "2s", "1m") doubled on every attempt.
 */
export function retryDelayMs(base: string, attempt: number): number {
  const baseMs = ms(base as ms.StringValue);
  return baseMs * 2 ** attempt;
}
