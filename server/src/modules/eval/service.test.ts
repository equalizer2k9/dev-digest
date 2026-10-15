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
  insertRunning: vi.fn(),
  reapInterrupted: vi.fn(),
}));
const executor = vi.hoisted(() => ({ execute: vi.fn() }));

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
  const agentsRepo = { getById: vi.fn(), linkedSkills: vi.fn() };
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
      total: 0,
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
