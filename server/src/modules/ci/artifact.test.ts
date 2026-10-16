import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { WorkflowRunInfo } from '@devdigest/shared';
import { ARTIFACT_FILE, ARTIFACT_MAX_BYTES } from './constants.js';
import {
  checkArtifact,
  ciStatusFor,
  newestFirst,
  readResultArtifact,
  repoFromRunUrl,
  toCiRunRow,
  type CiRunDbRow,
} from './artifact.js';

const result = {
  findings_count: 3,
  critical: 1,
  warning: 1,
  suggestion: 1,
  cost_usd: 0.02,
  duration_ms: 4500,
  agent: 'Reviewer',
  version: '1',
  pr_number: 7,
};
const zipOf = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const run = (over: Partial<WorkflowRunInfo> = {}): WorkflowRunInfo => ({
  id: 1,
  html_url: 'https://github.com/acme/api/actions/runs/1',
  conclusion: 'success',
  pr_number: 7,
  head_repo: 'acme/api',
  completed_at: '2026-10-01T00:00:00Z',
  ...over,
});

describe('readResultArtifact (AC-9, AC-10)', () => {
  it('reads a valid artifact', () => {
    const out = readResultArtifact(zipOf({ [ARTIFACT_FILE]: JSON.stringify(result) }));
    expect(out).toMatchObject({ ok: true, data: { findings_count: 3, agent: 'Reviewer' } });
  });
  it('random bytes -> bad_archive', () => {
    expect(readResultArtifact(new Uint8Array([1, 2, 3, 4, 5]))).toEqual({ ok: false, reason: 'bad_archive' });
  });
  it('zip without the entry -> bad_archive', () => {
    expect(readResultArtifact(zipOf({ 'other.json': '{}' }))).toEqual({ ok: false, reason: 'bad_archive' });
  });
  it('non-JSON or missing agent -> invalid_result', () => {
    expect(readResultArtifact(zipOf({ [ARTIFACT_FILE]: 'nope' }))).toEqual({ ok: false, reason: 'invalid_result' });
    const { agent: _a, ...noAgent } = result;
    expect(readResultArtifact(zipOf({ [ARTIFACT_FILE]: JSON.stringify(noAgent) }))).toEqual({
      ok: false,
      reason: 'invalid_result',
    });
  });
  it('oversized entry -> bad_archive', () => {
    const big = JSON.stringify({ ...result, agent: 'x'.repeat(ARTIFACT_MAX_BYTES + 10) });
    expect(readResultArtifact(zipOf({ [ARTIFACT_FILE]: big }))).toEqual({ ok: false, reason: 'bad_archive' });
  });
});

describe('checkArtifact', () => {
  const data = result as never;
  it('passes when PR and agent match', () => {
    expect(checkArtifact(data, run(), 'Reviewer')).toBeNull();
  });
  it('run without a PR', () => {
    expect(checkArtifact(data, run({ pr_number: null }), 'Reviewer')).toBe('no_pull_request');
  });
  it('pr mismatch, incl. null artifact pr', () => {
    expect(checkArtifact(data, run({ pr_number: 8 }), 'Reviewer')).toBe('pr_mismatch');
    expect(checkArtifact({ ...result, pr_number: null } as never, run(), 'Reviewer')).toBe('pr_mismatch');
  });
  it('agent mismatch', () => {
    expect(checkArtifact(data, run(), 'Someone else')).toBe('agent_mismatch');
  });
});

describe('ciStatusFor (A-12)', () => {
  it.each([
    ['success', 0, 'no_findings'],
    ['success', 2, 'succeeded'],
    ['failure', 0, 'failed'],
    ['failure', 2, 'failed'],
    ['cancelled', 0, 'failed'],
    [null, 0, 'failed'],
  ])('%s + %s -> %s', (c, n, s) => {
    expect(ciStatusFor(c, n)).toBe(s);
  });
});

describe('repoFromRunUrl', () => {
  it('parses owner/name', () => {
    expect(repoFromRunUrl('https://github.com/acme/api/actions/runs/12')).toBe('acme/api');
  });
  it('null for anything else', () => {
    expect(repoFromRunUrl('https://example.com/x')).toBeNull();
    expect(repoFromRunUrl(null)).toBeNull();
  });
});

describe('toCiRunRow / newestFirst (AC-12)', () => {
  const db = (over: Partial<CiRunDbRow> = {}): CiRunDbRow => ({
    id: 'r1',
    installationRepo: 'acme/api',
    prNumber: 7,
    agentId: 'a1',
    agentName: 'Reviewer',
    status: 'succeeded',
    findingsCount: 3,
    costUsd: 0.02,
    durationMs: 4500,
    ranAt: new Date('2026-10-01T00:00:00Z'),
    githubUrl: 'https://github.com/acme/api/actions/runs/1',
    ...over,
  });
  it('maps and converts ms to s', () => {
    expect(toCiRunRow(db())).toEqual({
      id: 'r1',
      repo: 'acme/api',
      pr_number: 7,
      agent_id: 'a1',
      agent: 'Reviewer',
      status: 'succeeded',
      findings_count: 3,
      cost_usd: 0.02,
      duration_s: 4.5,
      ran_at: '2026-10-01T00:00:00.000Z',
      github_url: 'https://github.com/acme/api/actions/runs/1',
    });
  });
  it('null installation repo falls back to the URL; null agent stays null; null duration', () => {
    const row = toCiRunRow(db({ installationRepo: null, agentId: null, agentName: null, durationMs: null, ranAt: null }));
    expect(row).toMatchObject({ repo: 'acme/api', agent: null, agent_id: null, duration_s: null, ran_at: null });
  });
  it('newestFirst sorts descending, nulls last, stable', () => {
    const rows = [
      toCiRunRow(db({ id: 'old', ranAt: new Date('2026-01-01') })),
      toCiRunRow(db({ id: 'none1', ranAt: null })),
      toCiRunRow(db({ id: 'new', ranAt: new Date('2026-09-01') })),
      toCiRunRow(db({ id: 'none2', ranAt: null })),
    ];
    expect(newestFirst(rows).map((r) => r.id)).toEqual(['new', 'old', 'none1', 'none2']);
  });
});
