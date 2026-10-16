import type { Db } from '../../db/client.js';
import * as caseRepo from './repository/case.repo.js';
import * as runRepo from './repository/run.repo.js';
import type {
  DashboardAgentRow,
  EvalRunDbRow,
  EvalRunWithAgent,
  FinishedRunValues,
  NewRunningRun,
} from './repository/run.repo.js';
import type {
  CreateCaseResult,
  EvalCaseDbRow,
  NewEvalCase,
  UpdateCaseResult,
} from './repository/case.repo.js';

/**
 * Eval data-access: the ONLY layer touching `eval_cases` and `eval_runs`. Every read
 * and write is workspace-scoped. Query bodies live under `./repository/`; this class
 * composes them so the service sees one object.
 */

export type {
  CreateCaseResult,
  DashboardAgentRow,
  EvalCaseDbRow,
  NewEvalCase,
  UpdateCaseResult,
  EvalRunDbRow,
  EvalRunWithAgent,
  FinishedRunValues,
  NewRunningRun,
};

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- cases ---------------------------------------------------------------

  caseBySourceFinding(workspaceId: string, findingId: string): Promise<EvalCaseDbRow | undefined> {
    return caseRepo.caseBySourceFinding(this.db, workspaceId, findingId);
  }

  createCaseExclusive(
    values: NewEvalCase & { agentId: string; sourceFindingId: string },
    decide: (agentCases: EvalCaseDbRow[]) => EvalCaseDbRow | null,
  ): Promise<CreateCaseResult> {
    return caseRepo.createCaseExclusive(this.db, values, decide);
  }

  getCase(workspaceId: string, agentId: string, caseId: string): Promise<EvalCaseDbRow | undefined> {
    return caseRepo.getCase(this.db, workspaceId, agentId, caseId);
  }

  updateCaseExclusive(
    workspaceId: string,
    agentId: string,
    caseId: string,
    values: { name: string; expectedOutput: unknown },
    decide: (otherCases: EvalCaseDbRow[]) => EvalCaseDbRow | null,
  ): Promise<UpdateCaseResult> {
    return caseRepo.updateCaseExclusive(this.db, workspaceId, agentId, caseId, values, decide);
  }

  listCases(workspaceId: string, agentId: string): Promise<EvalCaseDbRow[]> {
    return caseRepo.listCases(this.db, workspaceId, agentId);
  }

  deleteCase(workspaceId: string, agentId: string, caseId: string): Promise<boolean> {
    return caseRepo.deleteCase(this.db, workspaceId, agentId, caseId);
  }

  // ---- runs ----------------------------------------------------------------

  /** Null when the agent already has a running run (unique violation). */
  insertRunning(values: NewRunningRun): Promise<EvalRunDbRow | null> {
    return runRepo.insertRunning(this.db, values);
  }

  /** False when the run row is gone (agent deleted) or no longer running. */
  finishRun(runId: string, values: FinishedRunValues): Promise<boolean> {
    return runRepo.finishRun(this.db, runId, values);
  }

  failRun(runId: string, reason: string): Promise<boolean> {
    return runRepo.failRun(this.db, runId, reason);
  }

  /** An agent's runs, newest first. */
  listRuns(workspaceId: string, agentId: string): Promise<EvalRunDbRow[]> {
    return runRepo.listRuns(this.db, workspaceId, agentId);
  }

  runsByIds(workspaceId: string, ids: string[]): Promise<EvalRunWithAgent[]> {
    return runRepo.runsByIds(this.db, workspaceId, ids);
  }

  dashboardRows(workspaceId: string): Promise<DashboardAgentRow[]> {
    return runRepo.dashboardRows(this.db, workspaceId);
  }

  recentRuns(workspaceId: string, limit: number): Promise<EvalRunWithAgent[]> {
    return runRepo.recentRuns(this.db, workspaceId, limit);
  }

  reapInterrupted(): Promise<number> {
    return runRepo.reapInterrupted(this.db);
  }
}
