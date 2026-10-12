import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, apiGet, apiOrigin, apiPost, seg } from './api-client.js';
import { mockApi } from './mock-api.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('api-client', () => {
  it('decodes the { error: { code, message } } envelope into ApiError', async () => {
    mockApi({ 'GET /x': { status: 404, json: { error: { code: 'not_found', message: 'Pull request not found' } } } });
    await expect(apiGet('/x', z.unknown())).rejects.toMatchObject({
      name: 'ApiError', code: 'not_found', message: 'Pull request not found', status: 404,
    });
  });

  it('maps a network failure to network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const err = await apiGet('/x', z.unknown()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'network_error', status: 0 });
  });

  it('falls back to http_<status> on a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502 })));
    await expect(apiGet('/x', z.unknown())).rejects.toMatchObject({ code: 'http_502', status: 502 });
  });

  it('rejects a body that does not match the schema', async () => {
    mockApi({ 'GET /x': { wrong: true } });
    await expect(apiGet('/x', z.array(z.string()))).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('sends POST bodies as JSON and uses DEVDIGEST_API_URL', async () => {
    vi.stubEnv('DEVDIGEST_API_URL', 'http://api.test:9/');
    const { fn } = mockApi({ 'POST /y': { ok: 1 } });
    await apiPost('/y', z.object({ ok: z.number() }), { a: 1 });
    const [url, init] = fn.mock.calls[0]!;
    expect(String(url)).toBe('http://api.test:9/y');
    expect(init?.body).toBe('{"a":1}');
    vi.unstubAllEnvs();
  });

  it('aborts a hanging request after timeoutMs → network_error', async () => {
    vi.stubGlobal('fetch', vi.fn((_u: unknown, init?: RequestInit) => new Promise((_, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
    })));
    const t0 = Date.now();
    const err = await apiGet('/x', z.unknown(), { timeoutMs: 30 }).catch((e) => e);
    expect(err).toMatchObject({ name: 'ApiError', code: 'network_error', status: 0 });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('a body that stalls past the timeout is network_error, not bad_response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => {
      const body = new ReadableStream({
        start(c) { init!.signal!.addEventListener('abort', () => c.error(init!.signal!.reason)); },
      });
      return new Response(body, { status: 200 });
    }));
    await expect(apiGet('/x', z.unknown(), { timeoutMs: 30 })).rejects.toMatchObject({ code: 'network_error' });
  });

  it('URL-encodes path segments', () => {
    expect(seg('a/b c?')).toBe('a%2Fb%20c%3F');
  });

  describe('AC-C: apiOrigin', () => {
    it('defaults to http://localhost:3001 when the env is unset', () => {
      vi.stubEnv('DEVDIGEST_API_URL', '');
      expect(apiOrigin()).toBe('http://localhost:3001');
    });
    it('keeps scheme + host + port, drops credentials, path, query, fragment', () => {
      vi.stubEnv('DEVDIGEST_API_URL', 'http://user:s3cret@api.example.com:8443/base/path?token=abc123#frag');
      expect(apiOrigin()).toBe('http://api.example.com:8443');
    });
    it('supports https', () => {
      vi.stubEnv('DEVDIGEST_API_URL', 'https://api.example.com/');
      expect(apiOrigin()).toBe('https://api.example.com');
    });
    it('echoes nothing of an unparsable value', () => {
      vi.stubEnv('DEVDIGEST_API_URL', 'not a url ?token=abc123');
      expect(apiOrigin()).not.toMatch(/token|abc123|not a url/);
    });
    it('echoes nothing of a non-http scheme', () => {
      vi.stubEnv('DEVDIGEST_API_URL', 'ftp://u:pw@host/x?token=abc123');
      expect(apiOrigin()).not.toMatch(/ftp|pw|token|abc123|host/);
    });
  });
});
