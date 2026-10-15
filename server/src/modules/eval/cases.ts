import { groundFindings } from '@devdigest/reviewer-core';
import {
  EvalExpectation,
  EvalFrozenMeta,
  type EvalCaseCreated,
  type EvalCaseRow,
  type Finding,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import {
  EVAL_CASE_CONFLICT,
  EVAL_CASE_NO_AGENT,
  EVAL_CASE_NO_HUNK,
  EVAL_CASE_NO_PATCH,
  EVAL_CASE_UNDECIDED,
} from './constants.js';
import { frozenDiff, zonesIntersect } from './helpers.js';
import type { EvalCaseDbRow, EvalRepository } from './repository.js';

/** A case row as the API shows it. `latest_status` is filled by the reads (T-S7). */
export function toCaseRow(row: EvalCaseDbRow, latestStatus: EvalCaseRow['latest_status'] = 'never_run'): EvalCaseRow {
  return {
    id: row.id,
    name: row.name,
    agent_id: row.agentId ?? row.ownerId,
    expectation: EvalExpectation.parse(row.expectedOutput),
    source_finding_id: row.sourceFindingId ?? null,
    created_at: row.createdAt.toISOString(),
    latest_status: latestStatus,
  };
}

const refuse = (code: string, message: string) => new AppError(code, message, 422);

/**
 * Freeze a decided finding into an eval case of its agent. Accepted → `must_find`,
 * dismissed → `must_not_flag`. Messages are fixed text and never echo the patch.
 */
export async function createCaseFromFinding(
  container: Container,
  repo: EvalRepository,
  workspaceId: string,
  findingId: string,
): Promise<EvalCaseCreated> {
  const ctx = await container.reviewRepo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
  const { finding, review, pull } = ctx;

  const agentFor = async (agentId: string | null) =>
    agentId ? container.agentsRepo.getById(workspaceId, agentId) : undefined;

  const existing = await repo.caseBySourceFinding(workspaceId, findingId);
  if (existing) {
    const agent = await agentFor(existing.agentId ?? null);
    if (!agent) throw refuse(EVAL_CASE_NO_AGENT, 'The agent of this finding no longer exists');
    return { case: toCaseRow(existing), agent_id: agent.id, agent_name: agent.name, created: false };
  }

  const type = finding.acceptedAt ? 'must_find' : finding.dismissedAt ? 'must_not_flag' : null;
  if (!type) throw refuse(EVAL_CASE_UNDECIDED, 'Accept or dismiss the finding first');

  const agent = await agentFor(review.agentId);
  if (!agent) throw refuse(EVAL_CASE_NO_AGENT, 'This review has no agent to attach the case to');

  const files = await container.reviewRepo.getPrFiles(pull.id);
  const patch = files.find((f) => f.path === finding.file)?.patch;
  if (!patch || patch.trim() === '') {
    throw refuse(EVAL_CASE_NO_PATCH, 'The pull request has no stored patch for this file');
  }

  const inputDiff = frozenDiff(finding.file, patch);
  // The review's own grounding gate: the finding must sit inside a hunk of the frozen diff.
  const probe: Finding = {
    id: finding.id,
    severity: finding.severity as Finding['severity'],
    category: finding.category as Finding['category'],
    title: finding.title,
    file: finding.file,
    start_line: finding.startLine,
    end_line: finding.endLine,
    rationale: finding.rationale,
    suggestion: finding.suggestion ?? null,
    confidence: finding.confidence,
    kind: 'finding',
  };
  if (groundFindings([probe], parseUnifiedDiff(inputDiff)).kept.length === 0) {
    throw refuse(EVAL_CASE_NO_HUNK, 'The finding lies outside every changed hunk of the stored patch');
  }

  const expectation: EvalExpectation = {
    type,
    file: finding.file,
    start_line: finding.startLine,
    end_line: finding.endLine,
    title: finding.title,
  };
  const meta: EvalFrozenMeta = {
    pr_id: pull.id,
    pr_number: pull.number,
    pr_title: pull.title,
    pr_description: pull.body ?? '',
    file: finding.file,
  };

  const result = await repo.createCaseExclusive(
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      agentId: agent.id,
      sourceFindingId: finding.id,
      name: finding.title,
      inputDiff,
      inputMeta: meta,
      expectedOutput: expectation,
    },
    (agentCases) =>
      agentCases.find((c) => {
        const theirs = EvalExpectation.safeParse(c.expectedOutput);
        const theirMeta = EvalFrozenMeta.safeParse(c.inputMeta);
        if (!theirs.success || !theirMeta.success) return false;
        return (
          theirs.data.type !== type &&
          zonesIntersect(
            { pr_id: theirMeta.data.pr_id, ...pick(theirs.data) },
            { pr_id: pull.id, ...pick(expectation) },
          )
        );
      }) ?? null,
  );

  if (result.kind === 'conflict') {
    throw new AppError(
      EVAL_CASE_CONFLICT,
      'An eval case of the opposite type already covers these lines',
      409,
      { case_id: result.row.id, case_name: result.row.name },
    );
  }
  return {
    case: toCaseRow(result.row),
    agent_id: agent.id,
    agent_name: agent.name,
    created: result.kind === 'created',
  };
}

const pick = (e: EvalExpectation) => ({ file: e.file, start_line: e.start_line, end_line: e.end_line });
