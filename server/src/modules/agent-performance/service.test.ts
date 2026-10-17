import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';
import { AgentPerformanceService } from './service.js';
import type { PerfRunRow } from './helpers.js';

const NOW = new Date('2026-10-17T12:00:00Z');
const WS = 'w1';
const AGENT = { id: 'a1', name: 'Alpha' };

const runAt = (iso: string, over: Partial<PerfRunRow> = {}): PerfRunRow => ({
  id: iso,
  workspaceId: WS,
  agentId: 'a1',
  status: 'done',
  source: 'local',
  ranAt: new Date(iso),
  model: 'm',
  durationMs: 100,
  costUsd: 0.5,
  accepted: 1,
  dismissed: 1,
  pending: 0,
  critical: 0,
  warning: 0,
  suggestion: 0,
  ...over,
});

function setup(agent: typeof AGENT | null = AGENT) {
  const touched: string[] = [];
  const trap = (name: string) => () => {
    touched.push(name);
    throw new Error(`${name} must not be touched`);
  };
  const agentsRepo = {
    list: vi.fn(async () => [AGENT]),
    getById: vi.fn(async () => agent ?? undefined),
  };
  const container = {
    agentsRepo,
    get llm() {
      return trap('llm')();
    },
    get github() {
      return trap('github')();
    },
    get git() {
      return trap('git')();
    },
    get embedder() {
      return trap('embedder')();
    },
    get jobs() {
      return trap('jobs')();
    },
  } as unknown as Container;
  const repo = {
    runsInPeriod: vi.fn(async () => [runAt('2026-10-10T00:00:00Z')]),
  };
  const service = new AgentPerformanceService(container, { repo, now: () => NOW });
  return { service, repo, agentsRepo, touched };
}

describe('AgentPerformanceService', () => {
  it('AC-3: performance({}) asks the repo for [now - 30d, now) and reports the 30d preset', async () => {
    const { service, repo } = setup();
    const perf = await service.performance(WS, {});
    expect(repo.runsInPeriod).toHaveBeenCalledWith(WS, {
      from: new Date(NOW.getTime() - 30 * 24 * 3600 * 1000),
      to: NOW,
    });
    expect(perf.period.preset).toBe('30d');
    expect(perf.totals.runs).toBe(1);
  });

  it('AC-1: stats equals the dashboard row of the same data', async () => {
    const { service } = setup();
    const perf = await service.performance(WS, {});
    const stats = await service.stats(WS, AGENT.id, {});
    const { agent_id, agent_name, period, ...rest } = stats;
    const { agent_id: _i, agent_name: _n, ...row } = perf.rows[0]!;
    expect(agent_id).toBe('a1');
    expect(agent_name).toBe('Alpha');
    expect(period).toEqual(perf.period);
    expect(rest).toEqual(row);
  });

  it('EC-13: an unknown or foreign agent is a NotFoundError and the repo is not called', async () => {
    const { service, repo } = setup(null);
    await expect(service.stats(WS, 'nope', {})).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.runsInPeriod).not.toHaveBeenCalled();
  });

  it('NFR-11 / AC-12 / NFR-10: the caller workspace is passed on and no adapter is touched', async () => {
    const { service, repo, agentsRepo, touched } = setup();
    await service.stats('wX', AGENT.id, {});
    expect(agentsRepo.getById).toHaveBeenCalledWith('wX', AGENT.id);
    expect(agentsRepo.list).toHaveBeenCalledWith('wX');
    expect(repo.runsInPeriod).toHaveBeenCalledWith('wX', expect.anything());
    expect(touched).toEqual([]);
  });
});
