import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../../../platform/container.js';
import type { AgentRow, FindingRow } from '../../../db/rows.js';
import { NotFoundError, ValidationError } from '../../../platform/errors.js';
import type { ReviewRepository } from '../repository.js';
import type { ReviewService } from '../service.js';
import { MultiRunService } from './multi-run-service.js';

const WS = 'ws-1';
const PR = 'pr-1';
const T0 = new Date('2026-01-01T00:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

const agent = (id: string, name = `Agent ${id}`) =>
  ({ id, name, provider: 'openai', model: 'gpt-4.1' }) as unknown as AgentRow;

function finding(id: string, over: Partial<FindingRow> = {}): FindingRow {
  return {
    id,
    reviewId: 'rev',
    file: 'a.ts',
    startLine: 10,
    endLine: 12,
    severity: 'WARNING',
    category: 'bug',
    title: 'leak token',
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
    ...over,
  } as FindingRow;
}

function runRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    agentId: `ag-${id}`,
    ranAt: T0,
    status: 'done',
    error: null,
    durationMs: 2000,
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.1,
    findingsCount: 1,
    score: 80,
    multiAgentRunId: 'm1',
    ...over,
  };
}

function build(over: {
  enabled?: AgentRow[];
  pull?: unknown;
  head?: unknown;
  runs?: { run: ReturnType<typeof runRow>; agentName: string | null }[];
  reviews?: { runId: string; createdAt: Date; findings: FindingRow[] }[];
  list?: unknown[];
  finished?: Record<string, { durationMs: number | null; costUsd: number | null }[]>;
} = {}) {
  const repo = {
    getPull: vi.fn(async () => ('pull' in over ? over.pull : { id: PR, repoId: 'repo-1' })),
    getRepo: vi.fn(async () => ({ id: 'repo-1' })),
    createMultiRun: vi.fn(async () => ({ id: 'm1', ranAt: T0 })),
    getMultiRun: vi.fn(async () =>
      'head' in over
        ? over.head
        : { id: 'm1', ranAt: T0, pr: { id: PR, number: 7, title: 'T', repoId: 'repo-1' } },
    ),
    agentRunsForMultiRun: vi.fn(async () => over.runs ?? []),
    reviewsWithFindingsForRuns: vi.fn(async () => over.reviews ?? []),
    listMultiRuns: vi.fn(async () => over.list ?? []),
    finishedLocalRuns: vi.fn(async (_ws: string, agentId: string) => over.finished?.[agentId] ?? []),
  };
  const runReview = vi.fn(async (_ws: string, _pr: string, targets: AgentRow[]) => ({
    runs: targets.map((a) => ({ run_id: `run-${a.id}`, agent_id: a.id, agent_name: a.name })),
    reviews: [],
  }));
  const container = {
    agentsRepo: { listEnabled: vi.fn(async () => over.enabled ?? []) },
  } as unknown as Container;
  const service = new MultiRunService(
    container,
    { repo: repo as unknown as ReviewRepository, reviews: { runReview } as unknown as ReviewService },
  );
  return { service, repo, runReview, container };
}

const enabled = [agent('a'), agent('b'), agent('c')];

describe('MultiRunService.launch', () => {
  it('creates one multi run and calls runReview once with the targets in request order and its multiAgentRunId (AC-1)', async () => {
    const { service, repo, runReview } = build({ enabled });
    await service.launch(WS, PR, ['c', 'a', 'b'], undefined);
    expect(repo.createMultiRun).toHaveBeenCalledTimes(1);
    expect(runReview).toHaveBeenCalledTimes(1);
    const [ws, pr, targets, , opts] = runReview.mock.calls[0] as unknown as [string, string, AgentRow[], unknown, unknown];
    expect([ws, pr]).toEqual([WS, PR]);
    expect(targets.map((a) => a.id)).toEqual(['c', 'a', 'b']);
    expect(opts).toEqual({ multiAgentRunId: 'm1' });
  });

  it('returns multi_run_id together with the created runs (AC-1)', async () => {
    const { service } = build({ enabled });
    const res = await service.launch(WS, PR, ['a', 'b'], undefined);
    expect(res.multi_run_id).toBe('m1');
    expect(res.pr_id).toBe(PR);
    expect(res.reviews).toEqual([]);
    expect(res.runs.map((r) => r.agent_id)).toEqual(['a', 'b']);
  });

  it('an id that is disabled, unknown or of another workspace → ValidationError and nothing is created (AC-2, A-11)', async () => {
    const { service, repo, runReview } = build({ enabled });
    await expect(service.launch(WS, PR, ['a', 'zzz'], undefined)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createMultiRun).not.toHaveBeenCalled();
    expect(runReview).not.toHaveBeenCalled();
  });

  it('the error message is the same whichever id is wrong (A-11)', async () => {
    const { service } = build({ enabled });
    const m1 = await service.resolveTargets(WS, ['a', 'x']).catch((e: Error) => e.message);
    const m2 = await service.resolveTargets(WS, ['y', 'b']).catch((e: Error) => e.message);
    expect(m1).toBe('Invalid agent list');
    expect(m2).toBe(m1);
  });

  it('a missing pull → NotFoundError and nothing is created', async () => {
    const { service, repo, runReview } = build({ enabled, pull: undefined });
    await expect(service.launch(WS, PR, ['a', 'b'], undefined)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.createMultiRun).not.toHaveBeenCalled();
    expect(runReview).not.toHaveBeenCalled();
  });
});

describe('MultiRunService.get', () => {
  it('a multi run getMultiRun does not return → NotFoundError (EC-13)', async () => {
    const { service } = build({ head: undefined });
    await expect(service.get(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  const twoDone = {
    runs: [
      { run: runRow('r1', { ranAt: T0, durationMs: 4000 }), agentName: 'Alpha' },
      { run: runRow('r2', { ranAt: at(1), durationMs: 2000, costUsd: null, tokensIn: null }), agentName: 'Beta' },
    ],
    reviews: [
      { runId: 'r1', createdAt: at(5), findings: [finding('f1')] },
      { runId: 'r2', createdAt: at(8), findings: [finding('f2', { severity: 'CRITICAL' })] },
    ],
  };

  it('returns pr, status, started_at, wall_clock_ms, totals and one agent entry per run in launch order (AC-7)', async () => {
    const { service } = build(twoDone);
    const d = await service.get(WS, 'm1');
    expect(d.pr).toEqual({ id: PR, number: 7, title: 'T', repo_id: 'repo-1' });
    expect(d.status).toBe('done');
    expect(d.started_at).toBe(T0.toISOString());
    expect(d.wall_clock_ms).toBe(8000);
    expect(d.tokens_in).toBe(100);
    expect(d.tokens_out).toBe(100);
    expect(d.cost_usd).toBeCloseTo(0.1);
    expect(d.agents.map((a) => a.run_id)).toEqual(['r1', 'r2']);
    expect(d.agents[0]).toMatchObject({
      agent_name: 'Alpha',
      duration_ms: 4000,
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.1,
      findings_count: 1,
      score: 80,
    });
  });

  it('groups only findings of done runs and returns cells per run (AC-7, AC-9, AC-10)', async () => {
    const { service } = build({
      runs: [
        { run: runRow('r1'), agentName: 'A' },
        { run: runRow('r2'), agentName: 'B' },
        { run: runRow('r3', { status: 'failed' }), agentName: 'C' },
      ],
      reviews: [
        { runId: 'r1', createdAt: at(1), findings: [finding('f1')] },
        { runId: 'r2', createdAt: at(2), findings: [finding('f2', { severity: 'CRITICAL' })] },
        { runId: 'r3', createdAt: at(3), findings: [finding('f3')] },
      ],
    });
    const d = await service.get(WS, 'm1');
    expect(d.groups).toHaveLength(1);
    const g = d.groups[0]!;
    expect(g.members.map((m) => m.run_id)).toEqual(['r1', 'r2']);
    expect(g.representative.id).toBe('f2');
    expect(g.id).toBe('f2');
    expect(g.cells).toEqual([
      { run_id: 'r1', value: 'WARNING' },
      { run_id: 'r2', value: 'CRITICAL' },
      { run_id: 'r3', value: 'failed' },
    ]);
    expect(g.conflict).toBe(true);
  });

  it('every run failed → status failed, groups [] (EC-4)', async () => {
    const { service } = build({
      runs: [
        { run: runRow('r1', { status: 'failed', error: 'boom' }), agentName: 'A' },
        { run: runRow('r2', { status: 'cancelled' }), agentName: 'B' },
      ],
      reviews: [{ runId: 'r1', createdAt: at(1), findings: [finding('f1')] }],
    });
    const d = await service.get(WS, 'm1');
    expect(d.status).toBe('failed');
    expect(d.groups).toEqual([]);
    expect(d.agents[0]!.error).toBe('boom');
  });

  it('a run still running → status running and wall_clock_ms null', async () => {
    const { service } = build({
      runs: [
        { run: runRow('r1'), agentName: 'A' },
        { run: runRow('r2', { status: 'running', durationMs: null }), agentName: 'B' },
      ],
    });
    const d = await service.get(WS, 'm1');
    expect(d.status).toBe('running');
    expect(d.wall_clock_ms).toBeNull();
  });

  it('a deleted agent → agent_name null, its findings still grouped (EC-3)', async () => {
    const { service } = build({
      runs: [
        { run: runRow('r1', { agentId: null }), agentName: null },
        { run: runRow('r2'), agentName: 'B' },
      ],
      reviews: [
        { runId: 'r1', createdAt: at(1), findings: [finding('f1')] },
        { runId: 'r2', createdAt: at(2), findings: [finding('f2')] },
      ],
    });
    const d = await service.get(WS, 'm1');
    expect(d.agents[0]).toMatchObject({ agent_id: null, agent_name: null });
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.members).toHaveLength(2);
  });
});

describe('MultiRunService.list / estimates', () => {
  it('list passes limit 20, keeps the repository order, each with pr, agents, status, wall-clock, cost, started_at (AC-12)', async () => {
    const pr = { id: PR, number: 7, title: 'T', repoId: 'repo-1' };
    const { service, repo } = build({
      list: [
        {
          id: 'm2',
          ranAt: at(100),
          pr,
          runs: [{ run: runRow('r1', { ranAt: at(100) }), agentName: 'A', reviewCreatedAt: at(103) }],
        },
        {
          id: 'm1',
          ranAt: T0,
          pr,
          runs: [{ run: runRow('r2', { status: 'running' }), agentName: 'B', reviewCreatedAt: null }],
        },
      ],
    });
    const out = await service.list(WS, PR);
    expect(repo.listMultiRuns).toHaveBeenCalledWith(WS, { prId: PR, limit: 20 });
    expect(out.map((i) => i.id)).toEqual(['m2', 'm1']);
    expect(out[0]).toEqual({
      id: 'm2',
      pr: { id: PR, number: 7, title: 'T', repo_id: 'repo-1' },
      agents: [{ agent_id: 'ag-r1', agent_name: 'A' }],
      status: 'done',
      wall_clock_ms: 3000,
      cost_usd: 0.1,
      started_at: at(100).toISOString(),
    });
    expect(out[1]).toMatchObject({ status: 'running', wall_clock_ms: null });
  });

  it('estimates returns one entry per enabled agent from its last 10 finished local runs (AC-6)', async () => {
    const { service, repo } = build({
      enabled: [agent('a'), agent('b')],
      finished: { a: [{ durationMs: 1000, costUsd: 0.1 }, { durationMs: 3000, costUsd: 0.3 }] },
    });
    const out = await service.estimates(WS);
    expect(repo.finishedLocalRuns).toHaveBeenCalledWith(WS, 'a', 10);
    expect(out.agents).toEqual([
      { agent_id: 'a', agent_name: 'Agent a', duration_ms: 2000, cost_usd: 0.2, runs: 2 },
      { agent_id: 'b', agent_name: 'Agent b', duration_ms: null, cost_usd: null, runs: 0 },
    ]);
  });
});
