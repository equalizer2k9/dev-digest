import type { SkillPart } from '@devdigest/reviewer-core';
import type { EvalRunRecord } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { EVAL_RUN_IN_PROGRESS, EVAL_SET_EMPTY } from './constants.js';
import { toRunRecord } from './helpers.js';
import { EvalRepository } from './repository.js';
import { EvalRunExecutor, type EvalLogger } from './run-executor.js';

/**
 * Eval use-cases: start a run (T-S6); reads and compare follow in T-S7. Every
 * method is workspace-scoped; an id outside the caller's workspace is a 404.
 */
export class EvalService {
  private repo: EvalRepository;
  private executor: EvalRunExecutor;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
    this.executor = new EvalRunExecutor(container, this.repo);
  }

  /**
   * Snapshot the agent, its cases and its enabled linked skills ONCE, record a
   * `running` run and answer; the executor then goes on in the background.
   */
  async startRun(workspaceId: string, agentId: string, logger?: EvalLogger): Promise<EvalRunRecord> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const cases = await this.repo.listCases(workspaceId, agentId);
    if (cases.length === 0) {
      throw new AppError(EVAL_SET_EMPTY, 'Add at least one eval case before running', 422);
    }

    const linked = (await this.container.agentsRepo.linkedSkills(agentId)).filter((l) => l.skill.enabled);
    const skills: SkillPart[] = linked.map((l) => ({
      id: l.skill.id,
      name: l.skill.name,
      version: l.skill.version,
      body: l.skill.body,
      trusted: l.skill.source === 'manual' || l.skill.source === 'extracted',
    }));

    const run = await this.repo.insertRunning({
      workspaceId,
      agentId,
      agentVersion: agent.version,
      provider: agent.provider,
      model: agent.model,
      skills: skills.map((s) => ({ name: s.name, version: s.version })),
    });
    if (!run) throw new AppError(EVAL_RUN_IN_PROGRESS, 'A run of this agent is already in progress', 409);

    // Background: the executor stores its own failures, so nothing is awaited here.
    void this.executor.execute(run, agent, cases, skills, logger).catch((err: Error) => {
      logger?.error({ runId: run.id, agentId, reason: err.message }, 'eval executor crashed');
    });

    return toRunRecord(run, agent.name);
  }

  /** Boot: a run still `running` belongs to a dead process. */
  reapInterrupted(): Promise<number> {
    return this.repo.reapInterrupted();
  }
}
