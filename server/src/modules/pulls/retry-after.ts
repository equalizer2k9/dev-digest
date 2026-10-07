/**
 * Parses an HTTP `Retry-After` header (RFC 9110 §10.2.3) into a delay in
 * seconds. The header is either a non-negative integer of seconds or an
 * HTTP-date; anything else — or a missing header — yields `null`.
 */
export function parseRetryAfter(header: string | null, now: number = Date.now()): number | null {
  if (header === null) return null;
  const value = header.trim();
  if (value === '') return null;

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;

  const seconds = Math.ceil((date - now) / 1000);
  return seconds > 0 ? seconds : 0;
}
