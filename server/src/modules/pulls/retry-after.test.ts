import { describe, expect, it } from 'vitest';
import { parseRetryAfter } from './retry-after.js';

describe('parseRetryAfter', () => {
  it('returns null when the header is missing', () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('parses a delay in seconds', () => {
    expect(parseRetryAfter('120')).toBe(120);
  });

  it('ignores surrounding whitespace', () => {
    expect(parseRetryAfter(' 45 ')).toBe(45);
  });

  it('parses an HTTP-date as seconds from now', () => {
    const now = Date.parse('2026-10-21T07:27:00Z');
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', now)).toBe(60);
  });

  it('returns null for a value that is neither seconds nor a date', () => {
    expect(parseRetryAfter('soon')).toBeNull();
  });
});
