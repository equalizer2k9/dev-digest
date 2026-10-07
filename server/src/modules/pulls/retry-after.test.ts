import { describe, expect, it } from 'vitest';
import { parseRetryAfter } from './retry-after.js';

describe('parseRetryAfter', () => {
  it('parses a number of seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });
});
