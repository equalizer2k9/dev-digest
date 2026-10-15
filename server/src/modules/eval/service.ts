import type { SkillPart } from '@devdigest/reviewer-core';
import {
  type EvalAgentOverview,
  type EvalCaseCreated,
  type EvalCaseResult,
  type EvalCompare,
  type EvalDashboard,
  type EvalRunRecord,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { createCaseFromFinding, toCaseRow } from './cases.js';
import {
  EVAL_COMPARE_INVALID,
  EVAL_RUN_IN_PROGRESS,
  EVAL_SET_EMPTY,
  RECENT_RUNS,
} from './constants.js';
import { compareRuns, toRunRecord } from './helpers.js';
import { EvalRepository } from './repository.js';
import { EvalRunExecutor, type EvalLogger } from './run-executor.js';

/**
 * Eval use-cases: start a run, the overview, delete, compare and the dashboard. Every
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
      total: cases.length,
    });
    if (!run) throw new AppError(EVAL_RUN_IN_PROGRESS, 'A run of this agent is already in progress', 409);

    // Background: the executor stores its own failures, so nothing is awaited here.
    void this.executor.execute(run, agent, cases, skills, logger).catch((err: Error) => {
      logger?.error({ runId: run.id, agentId, reason: err.message }, 'eval executor crashed');
    });

    return toRunRecord(run, agent.name);
  }

  /** Freeze a decided finding into an eval case of its agent (idempotent per finding). */
  createCase(workspaceId: string, findingId: string): Promise<EvalCaseCreated> {
    return createCaseFromFinding(this.container, this.repo, workspaceId, findingId);
  }

  /** Everything the Evals tab shows: cases (newest first), their latest status, and the runs. */
  async overview(workspaceId: string, agentId: string): Promise<EvalAgentOverview> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const [cases, runs] = await Promise.all([
      this.repo.listCases(workspaceId, agentId),
      this.repo.listRuns(workspaceId, agentId),
    ]);

    // `runs` is newest first, so the first completed one is the latest completed run.
    const latest = runs.find((r) => r.status === 'completed');
    const statusByCase = new Map((latest?.results ?? []).map((r) => [r.case_id, r.status]));

    return {
      agent_id: agent.id,
      agent_name: agent.name,
      cases: cases.map((c) => toCaseRow(c, statusByCase.get(c.id) ?? 'never_run')),
      runs: runs.map((r) => toRunRecord(r, agent.name)),
    };
  }

  /** Remove one case; runs already recorded keep their own copy of the results. */
  async deleteCase(workspaceId: string, agentId: string, caseId: string): Promise<void> {
    const deleted = await this.repo.deleteCase(workspaceId, agentId, caseId);
    if (!deleted) throw new NotFoundError('Eval case not found');
  }

  /** Compare two completed runs of one agent. */
  async compare(workspaceId: string, aId: string, bId: string): Promise<EvalCompare> {
    const invalid = (message: string) => new AppError(EVAL_COMPARE_INVALID, message, 422);
    if (aId === bId) throw invalid('Pick two different runs');

    const found = await this.repo.runsByIds(workspaceId, [aId, bId]);
    const a = found.find((r) => r.run.id === aId);
    const b = found.find((r) => r.run.id === bId);
    if (!a || !b) throw new NotFoundError('Eval run not found');
    if (a.run.status !== 'completed' || b.run.status !== 'completed') {
      throw invalid('Only completed runs can be compared');
    }
    if (!a.run.agentId || a.run.agentId !== b.run.agentId) {
      throw invalid('Both runs must belong to the same agent');
    }
    const agentId = a.run.agentId;
    const agentName = a.agentName ?? b.agentName ?? '';

    const versions = [...new Set([a.run.agentVersion, b.run.agentVersion])].filter(
      (v): v is number => v !== null,
    );
    const prompts: Record<number, string | null> = {};
    await Promise.all(
      versions.map(async (v) => {
        const row = await this.container.agentsRepo.getVersion(agentId, v);
        const prompt = (row?.configJson as { system_prompt?: unknown } | undefined)?.system_prompt;
        prompts[v] = typeof prompt === 'string' ? prompt : null;
      }),
    );

    const withResults = (r: typeof a) => ({
      run: toRunRecord(r.run, agentName),
      results: (r.run.results ?? []) as EvalCaseResult[],
    });
    return {
      agent_id: agentId,
      agent_name: agentName,
      ...compareRuns(withResults(a), withResults(b), prompts),
    };
  }

  /** Workspace dashboard: agents with an eval set + the most recent runs. */
  async dashboard(workspaceId: string): Promise<EvalDashboard> {
    const [rows, recent] = await Promise.all([
      this.repo.dashboardRows(workspaceId),
      this.repo.recentRuns(workspaceId, RECENT_RUNS),
    ]);
    return {
      agents: rows.map((r) => ({
        agent_id: r.agentId,
        name: r.name,
        enabled: r.enabled,
        cases_total: r.casesTotal,
        latest: r.latest ? toRunRecord(r.latest.run, r.name) : null,
      })),
      recent_runs: recent.map((r) => toRunRecord(r.run, r.agentName ?? '')),
    };
  }

  /** Boot: a run still `running` belongs to a dead process. */
  reapInterrupted(): Promise<number> {
    return this.repo.reapInterrupted();
  }
}
