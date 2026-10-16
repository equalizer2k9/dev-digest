import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MultiRunRequest,
  MultiRunLaunchResponse,
  MultiRunDetail,
  CellValue,
} from '@devdigest/shared';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (n: number) => Array.from({ length: n }, (_, i) => u(i + 1));

describe('multi-agent contract', () => {
  it('MultiRunRequest accepts 2 and 5 distinct uuids', () => {
    expect(MultiRunRequest.safeParse({ agentIds: ids(2) }).success).toBe(true);
    expect(MultiRunRequest.safeParse({ agentIds: ids(5) }).success).toBe(true);
  });

  it('MultiRunRequest rejects 1 id, 6 ids, a duplicate and a non-uuid', () => {
    expect(MultiRunRequest.safeParse({ agentIds: ids(1) }).success).toBe(false);
    expect(MultiRunRequest.safeParse({ agentIds: ids(6) }).success).toBe(false);
    expect(MultiRunRequest.safeParse({ agentIds: [u(1), u(1)] }).success).toBe(false);
    expect(MultiRunRequest.safeParse({ agentIds: [u(1), 'nope'] }).success).toBe(false);
  });

  it('MultiRunLaunchResponse requires multi_run_id and keeps pr_id/runs/reviews', () => {
    const base = {
      pr_id: 'p',
      runs: [{ run_id: 'r', agent_id: 'a', agent_name: 'A' }],
      reviews: [],
    };
    expect(MultiRunLaunchResponse.safeParse(base).success).toBe(false);
    const ok = MultiRunLaunchResponse.parse({ ...base, multi_run_id: 'm' });
    expect(ok).toMatchObject({ pr_id: 'p', multi_run_id: 'm', reviews: [] });
    expect(ok.runs).toHaveLength(1);
  });

  it('MultiRunDetail accepts a null wall_clock_ms, a null cost_usd and a null agent_name', () => {
    const detail = {
      id: 'm',
      pr: { id: 'p', number: 1, title: 't', repo_id: 'r' },
      status: 'running',
      started_at: new Date().toISOString(),
      wall_clock_ms: null,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null,
      agents: [
        {
          run_id: 'r1',
          agent_id: null,
          agent_name: null,
          status: null,
          error: null,
          duration_ms: null,
          tokens_in: null,
          tokens_out: null,
          cost_usd: null,
          findings_count: null,
          score: null,
        },
      ],
      groups: [],
    };
    expect(MultiRunDetail.safeParse(detail).success).toBe(true);
  });

  it('CellValue accepts the three severities and did_not_flag/failed/pending only', () => {
    for (const v of ['CRITICAL', 'WARNING', 'SUGGESTION', 'did_not_flag', 'failed', 'pending']) {
      expect(CellValue.safeParse(v).success).toBe(true);
    }
    for (const v of ['done', 'critical', '', 1]) {
      expect(CellValue.safeParse(v).success).toBe(false);
    }
  });

  it('both multi-agent.ts copies are byte-identical', () => {
    const root = resolve(__dirname, '../../../../..');
    const a = readFileSync(resolve(root, 'server/src/vendor/shared/contracts/multi-agent.ts'));
    const b = readFileSync(resolve(root, 'client/src/vendor/shared/contracts/multi-agent.ts'));
    expect(a.equals(b)).toBe(true);
  });
});
