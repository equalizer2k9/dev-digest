import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/**
 * Unit coverage of the eval service with a MOCKED repository and executor. The
 * DB-backed behaviour lives in eval.it.test.ts / eval-runs.it.test.ts.
 */

const repo = vi.hoisted(() => ({
  listCases: vi.fn(),
  listRuns: vi.fn(),
  runsByIds: vi.fn(),
  dashboardRows: vi.fn(),
  recentRuns: vi.fn(),
  deleteCase: vi.fn(),
  insertRunning: vi.fn(),
  reapInterrupted: vi.fn(),
  getCase: vi.fn(),
  updateCaseExclusive: vi.fn(),
}));
const executor = vi.hoisted(() => ({ execute: vi.fn(), runSingle: vi.fn() }));

vi.mock('./repository.js', () => ({ EvalRepository: vi.fn(() => repo) }));
vi.mock('./run-executor.js', () => ({ EvalRunExecutor: vi.fn(() => executor) }));

const WS = 'ws-1';
const AGENT = {
  id: 'agent-1',
  name: 'Agent One',
  provider: 'openai',
  model: 'stub-model',
  version: 4,
  enabled: true,
};
const linked = (name: string, version: number, enabled = true, source = 'manual') => ({
  order: 0,
  skill: { id: `id-${name}`, name, version, body: `${name} body`, enabled, source },
});

function setup() {
  const agentsRepo = { getById: vi.fn(), linkedSkills: vi.fn(), getVersion: vi.fn() };
  const llm = vi.fn();
  const container = { agentsRepo, llm, db: {} } as unknown as Container;
  agentsRepo.getById.mockResolvedValue(AGENT);
  agentsRepo.linkedSkills.mockResolvedValue([]);
  repo.listCases.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
  repo.insertRunning.mockImplementation(async (v: Record<string, unknown>) => ({
    id: 'run-1',
    ranAt: new Date('2026-01-01T00:00:00Z'),
    finishedAt: null,
    status: 'running',
    hasErrors: false,
    error: null,
    recall: null,
    precision: null,
    citationAccuracy: null,
    passed: null,
    total: null,
    costUsd: null,
    ...v,
  }));
  executor.execute.mockResolvedValue(undefined);
  return { agentsRepo, llm, service: new EvalService(container) };
}

describe('EvalService.startRun', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    vi.clearAllMocks();
    s = setup();
  });

  it('AC-8: an empty set is a 422 eval_set_empty and nothing is inserted', async () => {
    repo.listCases.mockResolvedValue([]);
    const err = (await s.service.startRun(WS, AGENT.id).catch((e) => e)) as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('eval_set_empty');
    expect(err.statusCode).toBe(422);
    expect(repo.insertRunning).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('AC-13: a run already in progress is a 409 and the executor is not started', async () => {
    repo.insertRunning.mockResolvedValue(null);
    const err = (await s.service.startRun(WS, AGENT.id).catch((e) => e)) as AppError;
    expect(err.code).toBe('eval_run_in_progress');
    expect(err.statusCode).toBe(409);
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('AC-16: a disabled agent starts', async () => {
    s.agentsRepo.getById.mockResolvedValue({ ...AGENT, enabled: false });
    const out = await s.service.startRun(WS, AGENT.id);
    expect(out.status).toBe('running');
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('AC-9: answers running before any model call, with the configuration recorded', async () => {
    s.agentsRepo.linkedSkills.mockResolvedValue([
      linked('Skill A', 2),
      linked('Skill Off', 1, false),
      linked('Skill B', 7, true, 'imported_url'),
    ]);
    const out = await s.service.startRun(WS, AGENT.id);
    expect(out).toMatchObject({
      id: 'run-1',
      agent_id: 'agent-1',
      agent_name: 'Agent One',
      agent_version: 4,
      provider: 'openai',
      model: 'stub-model',
      status: 'running',
      skills: [
        { name: 'Skill A', version: 2 },
        { name: 'Skill B', version: 7 },
      ],
      recall: null,
      finished_at: null,
      passed: 0,
      // The running run already carries its case count, so the status line can say "Running 2 cases…".
      total: 2,
    });
    expect(s.llm).not.toHaveBeenCalled();
    const [run, agent, cases, skills] = executor.execute.mock.calls[0]!;
    expect(run.id).toBe('run-1');
    expect(agent).toBe(AGENT);
    expect(cases).toHaveLength(2);
    expect(skills.map((k: { name: string; trusted: boolean }) => [k.name, k.trusted])).toEqual([
      ['Skill A', true],
      ['Skill B', false],
    ]);
  });

  it('AC-32: an agent of another workspace is a NotFoundError', async () => {
    s.agentsRepo.getById.mockResolvedValue(undefined);
    await expect(s.service.startRun(WS, AGENT.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.listCases).not.toHaveBeenCalled();
    expect(repo.insertRunning).not.toHaveBeenCalled();
  });

  it('reapInterrupted delegates to the repository', async () => {
    repo.reapInterrupted.mockResolvedValue(2);
    await expect(s.service.reapInterrupted()).resolves.toBe(2);
  });
});

// ---- reads (T-S7) ----------------------------------------------------------

const D = (iso: string) => new Date(iso);
const caseRow = (id: string, createdAt: string) => ({
  id,
  name: `case ${id}`,
  ownerId: AGENT.id,
  agentId: AGENT.id,
  sourceFindingId: null,
  createdAt: D(createdAt),
  expectedOutput: { type: 'must_find', file: 'a.ts', start_line: 1, end_line: 2, title: `case ${id}` },
});
const result = (case_id: string, status: string) => ({
  case_id,
  name: `case ${case_id}`,
  type: 'must_find',
  file: 'a.ts',
  start_line: 1,
  end_line: 2,
  status,
  kept: 0,
  dropped: 0,
  kept_findings: [],
  cost_usd: null,
  error: null,
});
const runRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  agentId: AGENT.id,
  agentVersion: 1,
  provider: 'openai',
  model: 'm',
  skills: [],
  status: 'completed',
  hasErrors: false,
  error: null,
  ranAt: D('2026-01-01T00:00:00Z'),
  finishedAt: D('2026-01-01T00:01:00Z'),
  recall: 1,
  precision: 1,
  citationAccuracy: 1,
  passed: 1,
  total: 1,
  costUsd: null,
  results: [],
  ...over,
});

describe('EvalService.overview', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    vi.clearAllMocks();
    s = setup();
  });

  it('AC-6/AC-21: newest cases and runs first; latest_status from the latest COMPLETED run', async () => {
    repo.listCases.mockResolvedValue([caseRow('c3', '2026-01-03T00:00:00Z'), caseRow('c2', '2026-01-02T00:00:00Z'), caseRow('c1', '2026-01-01T00:00:00Z')]);
    repo.listRuns.mockResolvedValue([
      runRow('r-running', { status: 'running', ranAt: D('2026-01-05T00:00:00Z'), results: null }),
      runRow('r-failed', { status: 'failed', ranAt: D('2026-01-04T00:00:00Z'), results: null }),
      runRow('r-done', { ranAt: D('2026-01-03T00:00:00Z'), results: [result('c1', 'failed'), result('c2', 'passed')] }),
      runRow('r-old', { ranAt: D('2026-01-02T00:00:00Z'), results: [result('c1', 'passed'), result('c2', 'failed')] }),
    ]);
    const out = await s.service.overview(WS, AGENT.id);
    expect(out.agent_name).toBe('Agent One');
    expect(out.cases.map((c) => [c.id, c.latest_status])).toEqual([
      ['c3', 'never_run'],
      ['c2', 'passed'],
      ['c1', 'failed'],
    ]);
    expect(out.runs.map((r) => r.id)).toEqual(['r-running', 'r-failed', 'r-done', 'r-old']);
    expect(repo.listCases).toHaveBeenCalledWith(WS, AGENT.id);
  });

  it('with no completed run every case is never_run', async () => {
    repo.listCases.mockResolvedValue([caseRow('c1', '2026-01-01T00:00:00Z')]);
    repo.listRuns.mockResolvedValue([runRow('r', { status: 'running', results: null })]);
    const out = await s.service.overview(WS, AGENT.id);
    expect(out.cases[0]!.latest_status).toBe('never_run');
  });

  it('AC-32: an agent of another workspace is a NotFoundError', async () => {
    s.agentsRepo.getById.mockResolvedValue(undefined);
    await expect(s.service.overview(WS, AGENT.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('EvalService.deleteCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  it('AC-7: deletes scoped to workspace and agent, touching no run', async () => {
    repo.deleteCase.mockResolvedValue(true);
    const s = new EvalService({ agentsRepo: {}, db: {} } as unknown as Container);
    await s.deleteCase(WS, AGENT.id, 'c1');
    expect(repo.deleteCase).toHaveBeenCalledWith(WS, AGENT.id, 'c1');
    expect(repo.listRuns).not.toHaveBeenCalled();
    expect(repo.insertRunning).not.toHaveBeenCalled();
  });

  it('an unknown case is a NotFoundError', async () => {
    repo.deleteCase.mockResolvedValue(false);
    const s = new EvalService({ agentsRepo: {}, db: {} } as unknown as Container);
    await expect(s.deleteCase(WS, AGENT.id, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('EvalService.compare', () => {
  let s: ReturnType<typeof setup>;
  const withAgent = (run: Record<string, unknown>, agentName: string | null = 'Agent One') => ({ run, agentName });
  beforeEach(() => {
    vi.clearAllMocks();
    s = setup();
  });

  it('AC-32: a run of another workspace (not returned) is a NotFoundError', async () => {
    repo.runsByIds.mockResolvedValue([withAgent(runRow('a'))]);
    await expect(s.service.compare(WS, 'a', 'b')).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.runsByIds).toHaveBeenCalledWith(WS, ['a', 'b']);
  });

  it('AC-32: the same foreign id twice is a NotFoundError, not a 422', async () => {
    repo.runsByIds.mockResolvedValue([]);
    await expect(s.service.compare(WS, 'x', 'x')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a === b (own run) is a 422 eval_compare_invalid', async () => {
    repo.runsByIds.mockResolvedValue([withAgent(runRow('a'))]);
    const err = (await s.service.compare(WS, 'a', 'a').catch((e) => e)) as AppError;
    expect(err.code).toBe('eval_compare_invalid');
    expect(err.statusCode).toBe(422);
  });

  it('a running run is a 422', async () => {
    repo.runsByIds.mockResolvedValue([withAgent(runRow('a')), withAgent(runRow('b', { status: 'running' }))]);
    const err = (await s.service.compare(WS, 'a', 'b').catch((e) => e)) as AppError;
    expect(err.code).toBe('eval_compare_invalid');
    expect(err.statusCode).toBe(422);
  });

  it('two different agents is a 422', async () => {
    repo.runsByIds.mockResolvedValue([withAgent(runRow('a')), withAgent(runRow('b', { agentId: 'agent-2' }))]);
    const err = (await s.service.compare(WS, 'a', 'b').catch((e) => e)) as AppError;
    expect(err.code).toBe('eval_compare_invalid');
  });

  it('AC-24: reads the prompts of both versions through agentsRepo.getVersion', async () => {
    repo.runsByIds.mockResolvedValue([
      withAgent(runRow('b', { agentVersion: 2, ranAt: D('2026-01-02T00:00:00Z') })),
      withAgent(runRow('a', { agentVersion: 1 })),
    ]);
    s.agentsRepo.getVersion.mockImplementation(async (_id: string, v: number) =>
      v === 1 ? { configJson: { system_prompt: 'old' } } : undefined,
    );
    const out = await s.service.compare(WS, 'a', 'b');
    expect(s.agentsRepo.getVersion).toHaveBeenCalledWith(AGENT.id, 1);
    expect(s.agentsRepo.getVersion).toHaveBeenCalledWith(AGENT.id, 2);
    expect(out.agent_name).toBe('Agent One');
    expect(out.earlier.id).toBe('a');
    expect(out.prompt).toMatchObject({ status: 'unavailable', unavailable_versions: [2] });
  });
});

describe('EvalService.dashboard', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    vi.clearAllMocks();
    s = setup();
  });

  it('AC-29/AC-30: agent rows with the latest completed run or null, plus the recent runs', async () => {
    repo.dashboardRows.mockResolvedValue([
      { agentId: 'a1', name: 'Alpha', enabled: false, casesTotal: 2, latest: { run: runRow('r1', { agentId: 'a1' }), agentName: 'Alpha' } },
      { agentId: 'a2', name: 'Beta', enabled: true, casesTotal: 1, latest: null },
    ]);
    repo.recentRuns.mockResolvedValue([
      { run: runRow('r2', { agentId: 'a2', status: 'running', results: null }), agentName: 'Beta' },
      { run: runRow('r1', { agentId: 'a1' }), agentName: 'Alpha' },
    ]);
    const out = await s.service.dashboard(WS);
    expect(repo.recentRuns).toHaveBeenCalledWith(WS, 10);
    expect(out.agents).toHaveLength(2);
    expect(out.agents[0]).toMatchObject({ agent_id: 'a1', name: 'Alpha', enabled: false, cases_total: 2 });
    expect(out.agents[0]!.latest!.id).toBe('r1');
    expect(out.agents[1]!.latest).toBeNull();
    expect(out.recent_runs.map((r) => [r.id, r.agent_name])).toEqual([
      ['r2', 'Beta'],
      ['r1', 'Alpha'],
    ]);
  });
});

describe('EvalService single-case runs and edits', () => {
  let s: ReturnType<typeof setup>;
  const single = {
    status: 'passed',
    error: null,
    kept: 1,
    dropped: 0,
    kept_findings: [],
    cost_usd: null,
    duration_ms: 5,
  };
  const FILE = 'src/a.ts';
  const PATCH = '@@ -1,3 +1,4 @@\n a\n+b\n c\n d';
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    workspaceId: WS,
    agentId: AGENT.id,
    name: 'Case one',
    sourceFindingId: 'f1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    inputDiff: `diff --git a/${FILE} b/${FILE}\n--- a/${FILE}\n+++ b/${FILE}\n${PATCH}\n`,
    inputMeta: { pr_id: 'pr-1', pr_number: 1, pr_title: 't', pr_description: '', file: FILE },
    expectedOutput: { type: 'must_find', file: FILE, start_line: 2, end_line: 2, title: 'T' },
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    s = setup();
    executor.runSingle.mockResolvedValue(single);
    repo.getCase.mockResolvedValue(row());
    repo.listRuns.mockResolvedValue([]);
  });

  it('AC-50: runCase reviews the stored case once and records nothing', async () => {
    s.agentsRepo.linkedSkills.mockResolvedValue([linked('Skill A', 2), linked('Off', 1, false)]);
    const out = await s.service.runCase(WS, AGENT.id, 'c1');
    expect(out).toEqual(single);
    expect(executor.runSingle).toHaveBeenCalledTimes(1);
    const [c, agent, skills] = executor.runSingle.mock.calls[0]!;
    expect(c.id).toBe('c1');
    expect(agent).toBe(AGENT);
    expect(skills.map((x: { name: string }) => x.name)).toEqual(['Skill A']);
    expect(repo.insertRunning).not.toHaveBeenCalled();
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it('AC-50: runCase is not blocked by a running run (the run table is not consulted)', async () => {
    repo.insertRunning.mockResolvedValue(null);
    repo.listRuns.mockResolvedValue([{ status: 'running', results: null }]);
    await expect(s.service.runCase(WS, AGENT.id, 'c1')).resolves.toEqual(single);
    expect(repo.listRuns).not.toHaveBeenCalled();
  });

  it('runCase: an agent or case outside the workspace is a 404 with no model call', async () => {
    s.agentsRepo.getById.mockResolvedValueOnce(undefined);
    await expect(s.service.runCase(WS, AGENT.id, 'c1')).rejects.toBeInstanceOf(NotFoundError);
    repo.getCase.mockResolvedValueOnce(undefined);
    await expect(s.service.runCase(WS, AGENT.id, 'c1')).rejects.toBeInstanceOf(NotFoundError);
    expect(executor.runSingle).not.toHaveBeenCalled();
  });

  describe('updateCase', () => {
    const edit = { name: ' New ', start_line: 2, end_line: 3 };
    beforeEach(() => {
      repo.updateCaseExclusive.mockImplementation(async (_w, _a, _c, values, decide) => {
        const blocker = decide([]);
        return blocker ? { kind: 'conflict', row: blocker } : { kind: 'updated', row: row(values) };
      });
    });

    it('AC-51: returns the edited row and keeps the latest status', async () => {
      repo.listRuns.mockResolvedValue([
        { status: 'completed', results: [{ case_id: 'c1', status: 'failed' }] },
      ]);
      const out = await s.service.updateCase(WS, AGENT.id, 'c1', edit);
      expect(out).toMatchObject({ id: 'c1', name: 'New', latest_status: 'failed' });
      expect(out.expectation).toMatchObject({ type: 'must_find', file: FILE, start_line: 2, end_line: 3 });
      expect(repo.insertRunning).not.toHaveBeenCalled();
    });

    it('AC-51: never_run when no completed run has the case', async () => {
      expect((await s.service.updateCase(WS, AGENT.id, 'c1', edit)).latest_status).toBe('never_run');
    });

    it('AC-51: a refused edit changes nothing', async () => {
      const err = (await s.service.updateCase(WS, AGENT.id, 'c1', { ...edit, start_line: 40, end_line: 41 }).catch((e) => e)) as AppError;
      expect(err.code).toBe('eval_case_no_hunk');
      expect(repo.updateCaseExclusive).not.toHaveBeenCalled();
    });

    it('AC-51: a case of another workspace or agent is a 404', async () => {
      repo.getCase.mockResolvedValue(undefined);
      await expect(s.service.updateCase(WS, AGENT.id, 'c1', edit)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('AC-51: the opposite-type conflict check is handed only the OTHER cases', async () => {
      repo.updateCaseExclusive.mockImplementation(async (_w, _a, _c, _v, decide) => {
        // The repository excludes the case itself; the case's own zone must never block it.
        expect(decide([])).toBeNull();
        const other = row({
          id: 'c2',
          name: 'Opposite',
          expectedOutput: { type: 'must_not_flag', file: FILE, start_line: 3, end_line: 3, title: 'O' },
        });
        return { kind: 'conflict', row: decide([other as never]) };
      });
      const err = (await s.service.updateCase(WS, AGENT.id, 'c1', edit).catch((e) => e)) as AppError;
      expect(err.code).toBe('eval_case_conflict');
      expect(err.statusCode).toBe(409);
      expect(err.details).toEqual({ case_id: 'c2', case_name: 'Opposite' });
    });
  });
});
