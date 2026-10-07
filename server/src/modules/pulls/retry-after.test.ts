import { describe, expect, it } from 'vitest';
import { parseRetryAfter } from './retry-after.js';

describe('parseRetryAfter', () => {
  it('parses a short delay in seconds', () => {
    expect(parseRetryAfter('30')).toBe(30);
  });

  it('parses a typical delay in seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('parses an hour-long delay', () => {
    expect(parseRetryAfter('3600')).toBe(3600);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseRetryAfter(' 45 ')).toBe(45);
  });

  it('parses a large number of seconds', () => {
    expect(parseRetryAfter('86400')).toBe(86400);
  });
});
