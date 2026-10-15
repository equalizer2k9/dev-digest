import type { Db } from '../../db/client.js';
import * as caseRepo from './repository/case.repo.js';
import * as runRepo from './repository/run.repo.js';
import type { EvalRunDbRow, FinishedRunValues, NewRunningRun } from './repository/run.repo.js';
import type {
  CreateCaseResult,
  EvalCaseDbRow,
  NewEvalCase,
} from './repository/case.repo.js';

/**
 * Eval data-access: the ONLY layer touching `eval_cases` and `eval_runs`. Every read
 * and write is workspace-scoped. Query bodies live under `./repository/`; this class
 * composes them so the service sees one object.
 */

export type { CreateCaseResult, EvalCaseDbRow, NewEvalCase, EvalRunDbRow, FinishedRunValues, NewRunningRun };

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

  reapInterrupted(): Promise<number> {
    return runRepo.reapInterrupted(this.db);
  }
}
