import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './retry-delay.js';

describe('retryDelayMs', () => {
  it('returns the base delay on the first attempt', () => {
    expect(retryDelayMs('2s', 0)).toBe(2000);
  });

  it('doubles the delay on every attempt', () => {
    expect(retryDelayMs('500ms', 3)).toBe(4000);
  });
});
