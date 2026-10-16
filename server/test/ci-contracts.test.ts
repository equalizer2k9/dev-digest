import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CiBundleInput,
  CiInstallInput,
  CiRunRow,
  CiRefreshResult,
} from '@devdigest/shared';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('CiBundleInput', () => {
  const ok = { repo_id: UUID, triggers: ['opened'], post_as: 'none' };
  it('accepts a valid input', () => {
    expect(CiBundleInput.safeParse(ok).success).toBe(true);
  });
  it('rejects empty triggers', () => {
    expect(CiBundleInput.safeParse({ ...ok, triggers: [] }).success).toBe(false);
  });
  it('rejects an unknown trigger', () => {
    expect(CiBundleInput.safeParse({ ...ok, triggers: ['closed'] }).success).toBe(false);
  });
  it('rejects duplicate triggers', () => {
    expect(CiBundleInput.safeParse({ ...ok, triggers: ['opened', 'opened'] }).success).toBe(false);
  });
  it('rejects a non-uuid repo_id', () => {
    expect(CiBundleInput.safeParse({ ...ok, repo_id: 'nope' }).success).toBe(false);
  });
});

describe('CiInstallInput', () => {
  const base = { repo_id: UUID, triggers: ['opened', 'synchronize'], post_as: 'pr_comment' };
  it('accepts a missing workflow', () => {
    expect(CiInstallInput.safeParse(base).success).toBe(true);
  });
  it('rejects an empty workflow', () => {
    expect(CiInstallInput.safeParse({ ...base, workflow: '' }).success).toBe(false);
  });
  it('accepts a non-empty workflow', () => {
    expect(CiInstallInput.safeParse({ ...base, workflow: 'name: x' }).success).toBe(true);
  });
});

describe('CiRunRow', () => {
  it('accepts null agent, repo and duration_s', () => {
    const row = {
      id: UUID,
      repo: null,
      pr_number: 3,
      agent_id: null,
      agent: null,
      status: 'success',
      findings_count: 2,
      cost_usd: 0.01,
      duration_s: null,
      ran_at: '2026-10-16T10:00:00.000Z',
      github_url: 'https://github.com/o/r/actions/runs/1',
    };
    expect(CiRunRow.safeParse(row).success).toBe(true);
  });
});

describe('CiRefreshResult', () => {
  it('requires error (nullable)', () => {
    const base = { runs: [], ingested: 0, skipped: 0 };
    expect(CiRefreshResult.safeParse(base).success).toBe(false);
    expect(CiRefreshResult.safeParse({ ...base, error: null }).success).toBe(true);
    expect(CiRefreshResult.safeParse({ ...base, error: 'boom' }).success).toBe(true);
  });
});

describe('server and client shared copies', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const read = (pkg: string, f: string) =>
    readFileSync(path.join(ROOT, pkg, 'src/vendor/shared', f), 'utf8');
  for (const f of ['contracts/ci.ts', 'adapters.ts', 'index.ts']) {
    it(`${f} is byte-identical`, () => {
      expect(read('client', f)).toBe(read('server', f));
    });
  }
});
