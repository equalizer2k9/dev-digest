import type { AgentPerformance, AgentStats } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import {
  aggregatePerformance,
  resolvePeriod,
  toAgentStats,
  type PeriodInput,
} from './helpers.js';
import { AgentPerformanceRepository } from './repository.js';

export interface AgentPerformanceDeps {
  repo?: Pick<AgentPerformanceRepository, 'runsInPeriod'>;
  now?: () => Date;
}

/**
 * Agent performance (read-only). Both views go through `performance()`, so a Stats
 * response is by construction the agent's row of the dashboard. Never reaches the
 * model adapter, GitHub, git or the job runner.
 */
export class AgentPerformanceService {
  private repo: Pick<AgentPerformanceRepository, 'runsInPeriod'>;
  private now: () => Date;

  constructor(
    private container: Container,
    deps: AgentPerformanceDeps = {},
  ) {
    this.repo = deps.repo ?? new AgentPerformanceRepository(container.db);
    this.now = deps.now ?? (() => new Date());
  }

  async performance(workspaceId: string, q: PeriodInput): Promise<AgentPerformance> {
    const period = resolvePeriod(q, this.now());
    const [runs, agents] = await Promise.all([
      this.repo.runsInPeriod(workspaceId, { from: period.from, to: period.to }),
      this.container.agentsRepo.list(workspaceId),
    ]);
    return aggregatePerformance({
      workspaceId,
      period,
      runs,
      agents: agents.map((a) => ({ id: a.id, name: a.name })),
    });
  }

  async stats(workspaceId: string, agentId: string, q: PeriodInput): Promise<AgentStats> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return toAgentStats(await this.performance(workspaceId, q), { id: agent.id, name: agent.name });
  }
}
