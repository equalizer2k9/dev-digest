import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTool } from '../errors.js';
import { BASE_ROUTES, mockApi, text } from '../mock-api.js';
import { getFindings } from './get-findings.js';

afterEach(() => vi.unstubAllGlobals());

const rev = (agent_id: string, agent_name: string, created_at: string, title: string) => ({
  agent_id, agent_name, created_at, run_id: created_at, verdict: 'comment', summary: 's', score: 90,
  findings: [{ severity: 'INFO', title, file: 'a.ts', start_line: 1 }],
});

describe('get_findings', () => {
  it('returns the newest review per agent', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [
      rev('a1', 'Security Reviewer', '2026-01-01', 'old'),
      rev('a1', 'Security Reviewer', '2026-02-01', 'new'),
      rev('a2', 'General Reviewer', '2026-01-05', 'gen'),
    ] });
    const out = await getFindings({ pr_number: 12 });
    expect(out.map((r) => r.findings[0]!.title)).toEqual(['new', 'gen']);
  });

  it('filters by agent', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [rev('a1', 'Security Reviewer', '2026-01-01', 'x'), rev('a2', 'General Reviewer', '2026-01-05', 'gen')] });
    const out = await getFindings({ pr_number: 12, agent: 'General Reviewer' });
    expect(out).toHaveLength(1);
    expect(out[0]!.agent).toBe('General Reviewer');
  });

  it('a review with null agent_id / agent_name is kept and shown as "unknown"', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [
      rev('a1', 'Security Reviewer', '2026-01-01', 'sec'),
      { ...rev('a1', 'x', '2026-01-02', 'orphan-old'), agent_id: null, agent_name: null },
      { ...rev('a1', 'x', '2026-01-03', 'orphan-new'), agent_id: null, agent_name: null },
    ] });
    const out = await getFindings({ pr_number: 12 });
    expect(out.map((r) => [r.agent, r.findings[0]!.title])).toEqual([['Security Reviewer', 'sec'], ['unknown', 'orphan-new']]);
  });

  it('agent_id set but agent_name null → "unknown" name; agent filter skips id-less rows', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [
      { ...rev('a2', 'x', '2026-01-02', 'noname'), agent_name: null },
      { ...rev('a1', 'x', '2026-01-03', 'orphan'), agent_id: null, agent_name: null },
    ] });
    const out = await getFindings({ pr_number: 12, agent: 'General Reviewer' });
    expect(out.map((r) => [r.agent, r.findings[0]!.title])).toEqual([['unknown', 'noname']]);
  });

  it('no review → hint', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [] });
    expect(text(await runTool(() => getFindings({ pr_number: 12 })))).toBe('No review for PR #12 yet. Call run_agent_on_pr first.');
  });
});
