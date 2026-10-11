import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTool } from '../errors.js';
import { BASE_ROUTES, mockApi, text } from '../mock-api.js';
import { getConventions } from './get-conventions.js';

afterEach(() => vi.unstubAllGlobals());

const cand = (rule: string, status: string) => ({
  id: rule, rule, category: 'typing', status, evidence_path: 'src/a.ts', evidence_start_line: 4, evidence_snippet: 'code', confidence: 1,
});

describe('get_conventions', () => {
  it('drops pending and rejected, returns rule/category/evidence only', async () => {
    const { calls } = mockApi({
      ...BASE_ROUTES,
      'GET /repos/r1/conventions': { candidates: [cand('keep', 'accepted'), cand('p', 'pending'), cand('r', 'rejected')] },
    });
    expect(await getConventions({})).toEqual([{ rule: 'keep', category: 'typing', evidence: 'src/a.ts:4' }]);
    expect(calls.some((c) => c.includes('/skills'))).toBe(false);
  });

  it('nothing accepted → hint, and /skills is never called', async () => {
    const { calls } = mockApi({ ...BASE_ROUTES, 'GET /repos/r1/conventions': { candidates: [cand('p', 'pending')] } });
    const r = await runTool(() => getConventions({ repo: 'acme/app' }));
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('No accepted conventions for acme/app. Open its Conventions page in DevDigest, run a scan and accept rules.');
    expect(calls.some((c) => c.includes('/skills'))).toBe(false);
  });
});
