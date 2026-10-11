import { describe, expect, it } from 'vitest';
import { AgentList, ReviewList } from './schemas.js';
import { formatAgents, formatConventions, formatReview } from './format.js';
import { AGENTS } from './mock-api.js';

describe('format whitelists', () => {
  it('formatAgents never emits system_prompt', () => {
    const out = JSON.stringify(formatAgents(AgentList.parse(AGENTS)));
    expect(out).not.toMatch(/system_prompt|SECRET PROMPT/);
    expect(Object.keys(formatAgents(AgentList.parse(AGENTS))[0]!)).toEqual(
      ['id', 'name', 'description', 'enabled', 'provider', 'model'],
    );
  });

  it('formatReview keeps only severity/title/file/line per finding', () => {
    const [review] = ReviewList.parse([{
      id: 'rid', agent_id: 'a1', agent_name: 'Sec', run_id: 'r', verdict: 'comment', summary: 's', score: 80,
      created_at: '2026-01-01', cost_usd: 1, model: 'm',
      findings: [{ id: 'f', severity: 'WARNING', title: 't', file: 'a.ts', start_line: 3, end_line: 4, rationale: 'long', suggestion: 'fix' }],
    }]);
    const out = formatReview(review!);
    expect(out.findings[0]).toEqual({ severity: 'WARNING', title: 't', file: 'a.ts', line: 3 });
    expect(out.counts).toEqual({ WARNING: 1 });
    expect(JSON.stringify(out)).not.toMatch(/rationale|suggestion|cost_usd|rid/);
  });

  it('formatConventions drops non-accepted and prints file:line', () => {
    const base = { category: 'c', evidence_path: 'a.ts', evidence_start_line: 5 };
    expect(formatConventions([
      { ...base, rule: 'r1', status: 'accepted' },
      { ...base, rule: 'r2', status: 'pending' },
      { ...base, rule: 'r3', status: 'rejected' },
    ])).toEqual([{ rule: 'r1', category: 'c', evidence: 'a.ts:5' }]);
  });
});
