import type { z } from 'zod';
import { DEFAULT_API_URL, REQUEST_TIMEOUT_MS } from './constants.js';

/** Any failed API call: HTTP error (status > 0) or no answer at all (`network_error`, status 0). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiUrl(): string {
  const raw = process.env.DEVDIGEST_API_URL?.trim();
  return (raw || DEFAULT_API_URL).replace(/\/+$/, '');
}

/** URL-encode one path segment — ids and names never reach a URL raw. */
export const seg = (value: string): string => encodeURIComponent(value);

async function request<S extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  schema: S,
  body?: unknown,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl()}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApiError('network_error', (err as Error).message, 0);
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = undefined;
  }

  if (!res.ok) {
    const env = (payload as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
    throw new ApiError(
      typeof env?.code === 'string' ? env.code : `http_${res.status}`,
      typeof env?.message === 'string' ? env.message : res.statusText || 'Request failed',
      res.status,
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError('bad_response', `Unexpected response shape from ${path}`, res.status);
  }
  return parsed.data;
}

/** Parses with `schema`, which also drops every field the tools do not use. */
export const apiGet = <S extends z.ZodType>(path: string, schema: S) =>
  request('GET', path, schema);

export const apiPost = <S extends z.ZodType>(path: string, schema: S, body: unknown) =>
  request('POST', path, schema, body);
