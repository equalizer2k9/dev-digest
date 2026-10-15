import { describe, expect, it } from 'vitest';
import { errorKind, errorStatus } from './error-kind.js';

describe('errorKind', () => {
  it('prefers a string code', () => {
    expect(errorKind(Object.assign(new Error('secret /home/x'), { code: 'ENOENT' }))).toBe('ENOENT');
  });

  it('falls back to the class name, never the message', () => {
    class RateLimitError extends Error {
      override name = 'RateLimitError';
    }
    expect(errorKind(new RateLimitError('sk-live-123 leaked'))).toBe('RateLimitError');
    expect(errorKind(new Error('provider text'))).toBe('Error');
  });

  it('handles non-errors', () => {
    expect(errorKind(null)).toBe('Error');
    expect(errorKind('boom')).toBe('Error');
  });
});

describe('errorStatus', () => {
  it('reads status, statusCode or the cause', () => {
    expect(errorStatus({ status: 429 })).toBe(429);
    expect(errorStatus({ statusCode: 402 })).toBe(402);
    expect(errorStatus(new Error('x', { cause: { status: 404 } }))).toBe(404);
    expect(errorStatus(new Error('x'))).toBeUndefined();
  });
});
