import type {
  AgentEstimates,
  GroupMember,
  MultiRunAgent,
  MultiRunDetail,
  MultiRunLaunchResponse,
  MultiRunList,
} from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { NotFoundError, ValidationError } from '../../../platform/errors.js';
import type { AgentRow } from '../../../db/rows.js';
import type { ReviewRepository, MultiRunAgentRun } from '../repository.js';
import type { ReviewService } from '../service.js';
import type { Logger } from '../run-executor.js';
import { findingRowToDto } from '../helpers.js';
import { ESTIMATE_WINDOW, MULTI_RUN_LIST_LIMIT } from './constants.js';
import { groupFindings } from './grouping.js';
import { buildCells } from './disagreements.js';
import { estimateAgent } from './estimate.js';
import { isInProgress, multiRunStatus, usageTotals, wallClockMs } from './run-summary.js';

/** When a finished run ended: its review's created_at, else start + duration. */
function finishedAt(
  run: MultiRunAgentRun['run'],
  reviewCreatedAt: Date | null | undefined,
): Date | null {
  if (isInProgress(run.status)) return null;
  return reviewCreatedAt ?? new Date(run.ranAt.getTime() + (run.durationMs ?? 0));
}

/**
 * Multi-agent review: launches 2-5 enabled agents on one PR as one multi run
 * and reads it back (agents, finding groups, cells). Grouping and status logic
 * is pure and lives beside this file; this class only wires repository + pure
 * functions together.
 */
export class MultiRunService {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private reviews: ReviewService,
  ) {}

  /** Agents in request order; any id outside the enabled set is one generic error (A-11). */
  async resolveTargets(workspaceId: string, agentIds: string[]): Promise<AgentRow[]> {
    const enabled = await this.container.agentsRepo.listEnabled(workspaceId);
    const byId = new Map(enabled.map((a) => [a.id, a]));
    const targets: AgentRow[] = [];
    for (const id of agentIds) {
      const a = byId.get(id);
      if (!a) throw new ValidationError('Invalid agent list');
      targets.push(a);
    }
    return targets;
  }

  async launch(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger: Logger | undefined,
  ): Promise<MultiRunLaunchResponse> {
    const targets = await this.resolveTargets(workspaceId, agentIds);
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.getRepo(pull.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const multi = await this.repo.createMultiRun({ workspaceId, prId });
    const { runs } = await this.reviews.runReview(workspaceId, prId, targets, logger, {
      multiAgentRunId: multi.id,
    });
    return { pr_id: prId, runs, reviews: [], multi_run_id: multi.id };
  }

  async get(workspaceId: string, id: string): Promise<MultiRunDetail> {
    const head = await this.repo.getMultiRun(workspaceId, id);
    if (!head) throw new NotFoundError('Multi-agent run not found');

    const linked = await this.repo.agentRunsForMultiRun(id);
    const reviews = await this.repo.reviewsWithFindingsForRuns(linked.map((l) => l.run.id));
    const byRun = new Map(reviews.map((r) => [r.runId, r]));

    const statuses = linked.map((l) => l.run.status);
    const totals = usageTotals(
      linked.map((l) => ({
        tokensIn: l.run.tokensIn,
        tokensOut: l.run.tokensOut,
        costUsd: l.run.costUsd,
      })),
    );

    // Only finished (done) runs contribute findings.
    const doneRuns = linked
      .filter((l) => l.run.status === 'done')
      .map((l) => ({
        runId: l.run.id,
        findings: (byRun.get(l.run.id)?.findings ?? []).map(
          (f): GroupMember => ({ ...findingRowToDto(f), run_id: l.run.id }),
        ),
      }));
    const groups = buildCells(
      groupFindings(doneRuns),
      linked.map((l) => ({ runId: l.run.id, status: l.run.status })),
    );

    const agents: MultiRunAgent[] = linked.map(({ run, agentName }) => ({
      run_id: run.id,
      agent_id: run.agentId,
      agent_name: agentName,
      status: run.status,
      error: run.error,
      duration_ms: run.durationMs,
      tokens_in: run.tokensIn,
      tokens_out: run.tokensOut,
      cost_usd: run.costUsd,
      findings_count: run.findingsCount,
      score: run.score,
    }));

    return {
      id: head.id,
      pr: { id: head.pr.id, number: head.pr.number, title: head.pr.title, repo_id: head.pr.repoId },
      status: multiRunStatus(statuses),
      started_at: head.ranAt.toISOString(),
      wall_clock_ms: wallClockMs(
        head.ranAt,
        linked.map((l) => ({
          status: l.run.status,
          finishedAt: finishedAt(l.run, byRun.get(l.run.id)?.createdAt),
        })),
      ),
      ...totals,
      agents,
      groups,
    };
  }

  async list(workspaceId: string, prId?: string): Promise<MultiRunList> {
    const rows = await this.repo.listMultiRuns(workspaceId, { prId, limit: MULTI_RUN_LIST_LIMIT });
    return rows.map((m) => ({
      id: m.id,
      pr: { id: m.pr.id, number: m.pr.number, title: m.pr.title, repo_id: m.pr.repoId },
      agents: m.runs.map((r) => ({ agent_id: r.run.agentId, agent_name: r.agentName })),
      status: multiRunStatus(m.runs.map((r) => r.run.status)),
      wall_clock_ms: wallClockMs(
        m.ranAt,
        m.runs.map((r) => ({ status: r.run.status, finishedAt: finishedAt(r.run, r.reviewCreatedAt) })),
      ),
      cost_usd: usageTotals(
        m.runs.map((r) => ({ tokensIn: null, tokensOut: null, costUsd: r.run.costUsd })),
      ).cost_usd,
      started_at: m.ranAt.toISOString(),
    }));
  }

  async estimates(workspaceId: string): Promise<AgentEstimates> {
    const enabled = await this.container.agentsRepo.listEnabled(workspaceId);
    const agents = await Promise.all(
      enabled.map(async (a) => ({
        agent_id: a.id,
        agent_name: a.name,
        ...estimateAgent(await this.repo.finishedLocalRuns(workspaceId, a.id, ESTIMATE_WINDOW)),
      })),
    );
    return { agents };
  }
}
