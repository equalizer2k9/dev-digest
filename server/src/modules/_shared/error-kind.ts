/**
 * A short, safe label for an error: its string `code` if it has one, else its class
 * name. Never the message — a raw message can carry a path, a secret or a
 * provider's own text (NFR-4 of SPEC-02 / SPEC-03).
 */
export function errorKind(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code !== '') return code;
  const name = (err as Error | null)?.name;
  return typeof name === 'string' && name !== '' ? name : 'Error';
}

/** HTTP status carried by an SDK error or its cause, if any. */
export function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown; cause?: unknown } | null;
  for (const v of [e?.status, e?.statusCode]) if (typeof v === 'number') return v;
  return e?.cause && e.cause !== err ? errorStatus(e.cause) : undefined;
}
