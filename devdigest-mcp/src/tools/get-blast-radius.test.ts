import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTool } from '../errors.js';
import { BASE_ROUTES, mockApi, text } from '../mock-api.js';
import { getBlastRadius } from './get-blast-radius.js';

afterEach(() => vi.unstubAllGlobals());

const blast = {
  changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
  downstream: [{
    symbol: 'rateLimit',
    callers: [{ name: 'handler', file: 'b.ts', line: 10 }],
    endpoints_affected: ['GET /api/items'],
    crons_affected: ['nightly'],
  }],
  summary: '1 symbol · 1 caller · 1 endpoint · 1 cron',
  degraded: true,
  reason: 'index_partial',
};

describe('get_blast_radius', () => {
  it('after resolving the PR makes exactly one call, to /pulls/:id/blast', async () => {
    const { calls } = mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/blast': blast });
    await getBlastRadius({ pr_number: 12 });
    expect(calls).toEqual(['GET /repos', 'GET /repos/r1/pulls', 'GET /pulls/p-uuid/blast']);
  });

  it('keeps degraded and reason and flattens callers to "file:line name"', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/blast': blast });
    expect(await getBlastRadius({ pr_number: 12 })).toEqual({
      summary: '1 symbol · 1 caller · 1 endpoint · 1 cron',
      degraded: true,
      reason: 'index_partial',
      symbols: [{ symbol: 'rateLimit', callers: ['b.ts:10 handler'], endpoints: ['GET /api/items'], crons: ['nightly'] }],
    });
  });

  it('unknown PR → hint, and the blast route is never called', async () => {
    const { calls } = mockApi({ ...BASE_ROUTES });
    const r = await runTool(() => getBlastRadius({ pr_number: 99 }));
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/PR #99 not found/);
    expect(calls.some((c) => c.endsWith('/blast'))).toBe(false);
  });
});
