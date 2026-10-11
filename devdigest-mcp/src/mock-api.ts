import { vi } from 'vitest';

type Reply = unknown | ((body: unknown) => unknown);
export interface MockRoute { status?: number; json?: Reply }

/** Stubs global fetch with a route table keyed by "METHOD /path". Returns the call log. */
export function mockApi(routes: Record<string, MockRoute | Reply>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    calls.push(key);
    const route = routes[key];
    if (route === undefined) {
      return new Response(JSON.stringify({ error: { code: 'not_found', message: `no mock for ${key}` } }), { status: 404 });
    }
    const r = (typeof route === 'object' && route !== null && ('json' in route || 'status' in route)
      ? route
      : { json: route }) as MockRoute;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const json = typeof r.json === 'function' ? (r.json as (b: unknown) => unknown)(body) : r.json;
    return new Response(JSON.stringify(json), { status: r.status ?? 200 });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export const REPO = { id: 'r1', full_name: 'acme/app', extra: 'x' };
export const PULL = { id: 'p-uuid', number: 12, title: 't' };
export const AGENTS = [
  { id: 'a1', name: 'Security Reviewer', description: 'sec', enabled: true, provider: 'openrouter', model: 'm', system_prompt: 'SECRET PROMPT' },
  { id: 'a2', name: 'General Reviewer', description: 'gen', enabled: true, provider: 'openrouter', model: 'm', system_prompt: 'SECRET PROMPT' },
];
export const BASE_ROUTES = {
  'GET /repos': [REPO],
  'GET /repos/r1/pulls': [PULL],
  'GET /agents': AGENTS,
};
export const text = (r: { content: { text: string }[] }) => r.content[0]!.text;
