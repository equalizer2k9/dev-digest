import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTool } from '../errors.js';
import { BASE_ROUTES, mockApi, text } from '../mock-api.js';
import { getFindings } from './get-findings.js';

afterEach(() => vi.unstubAllGlobals());

const rev = (agent_id: string, agent_name: string, created_at: string, title: string) => ({
  id: `rid-${agent_id}-${created_at}`, agent_id, agent_name, created_at, run_id: created_at, verdict: 'comment', summary: 's', score: 90,
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
    expect(JSON.parse(text(await runTool(() => getFindings({ pr_number: 12 }))))).toMatchObject({ error: 'No review for PR #12 yet.', hint: 'Call run_agent_on_pr first.' });
  });

  const many = (n: number) => Array.from({ length: n }, (_, i) => ({
    severity: i % 2 ? 'WARNING' : 'INFO', title: `t${i}`, file: 'a.ts', start_line: i + 1,
  }));

  it('AC-B: review_id is the API review id and total_findings equals the findings count (3)', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [{ ...rev('a1', 'Security Reviewer', '2026-01-01', 'x'), id: 'R-77', findings: many(3) }] });
    const [r] = await getFindings({ pr_number: 12 });
    expect(r!.review_id).toBe('R-77');
    expect(r!.total_findings).toBe(3);
    expect(r!.findings).toHaveLength(3);
  });

  it('AC-B: 60 findings → total_findings 60, list cut to 50, counts sum to 60', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [{ ...rev('a1', 'Security Reviewer', '2026-01-01', 'x'), findings: many(60) }] });
    const [r] = await getFindings({ pr_number: 12 });
    expect(r!.total_findings).toBe(60);
    expect(r!.findings).toHaveLength(50);
    expect(Object.values(r!.counts).reduce((a, b) => a + b, 0)).toBe(60);
  });

  it('AC-B: 0 findings → total_findings 0', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [{ ...rev('a1', 'Security Reviewer', '2026-01-01', 'x'), findings: [] }] });
    const [r] = await getFindings({ pr_number: 12 });
    expect(r!.total_findings).toBe(0);
    expect(r!.findings).toEqual([]);
  });

  it('AC-B: two agents each carry the review_id of their newest review', async () => {
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [
      { ...rev('a1', 'Security Reviewer', '2026-01-01', 'old'), id: 'sec-old' },
      { ...rev('a1', 'Security Reviewer', '2026-02-01', 'new'), id: 'sec-new' },
      { ...rev('a2', 'General Reviewer', '2026-01-05', 'gen'), id: 'gen-1' },
    ] });
    const out = await getFindings({ pr_number: 12 });
    expect(out.map((r) => [r.agent, r.review_id])).toEqual([['Security Reviewer', 'sec-new'], ['General Reviewer', 'gen-1']]);
  });

  it('AC-B: a review row without id fails schema parsing (bad_response)', async () => {
    const { id: _id, ...noId } = rev('a1', 'Security Reviewer', '2026-01-01', 'x');
    mockApi({ ...BASE_ROUTES, 'GET /pulls/p-uuid/reviews': [noId] });
    expect(JSON.parse(text(await runTool(() => getFindings({ pr_number: 12 }))))).toMatchObject({ error: 'DevDigest API returned an error.', code: 'bad_response' });
  });
});
