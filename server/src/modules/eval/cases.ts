import { groundFindings } from '@devdigest/reviewer-core';
import {
  EvalExpectation,
  EvalFrozenMeta,
  type EvalCaseCreated,
  type EvalCaseEdit,
  type EvalCaseRow,
  type Finding,
} from '@devdigest/shared';
import type { AgentRow } from '../../db/rows.js';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import {
  EVAL_CASE_BAD_NAME,
  EVAL_CASE_BAD_ZONE,
  EVAL_CASE_CONFLICT,
  EVAL_CASE_NO_AGENT,
  EVAL_CASE_NO_HUNK,
  EVAL_CASE_NO_PATCH,
  EVAL_CASE_UNDECIDED,
  MAX_CASE_NAME_CHARS,
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

/** A decided finding, ready to be frozen: every AC-5 check but the hunk one has passed. */
export type CaseDraft = {
  agent: AgentRow;
  type: EvalExpectation['type'];
  inputDiff: string;
  meta: EvalFrozenMeta;
  expectation: EvalExpectation;
  name: string;
  findingId: string;
  prNumber: number;
  prTitle: string;
};

const pick = (e: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>) => ({
  file: e.file,
  start_line: e.start_line,
  end_line: e.end_line,
});

/** The review's own grounding gate: does the zone sit inside a hunk of the frozen diff? */
function zoneMeetsHunk(inputDiff: string, file: string, title: string, start: number, end: number): boolean {
  const probe: Finding = {
    id: 'eval-zone-probe',
    severity: 'WARNING',
    category: 'bug',
    title,
    file,
    start_line: start,
    end_line: end,
    rationale: '',
    suggestion: null,
    confidence: 1,
    kind: 'finding',
  };
  return groundFindings([probe], parseUnifiedDiff(inputDiff)).kept.length > 0;
}

/**
 * The AC-47 / AC-51 checks on an edited name and zone, against a frozen diff. Returns the
 * cleaned name. Messages are fixed text and never echo the patch.
 */
export function checkEdit(edit: EvalCaseEdit, inputDiff: string, file: string): string {
  const name = edit.name.trim();
  if (name === '') throw refuse(EVAL_CASE_BAD_NAME, 'The name must not be empty');
  if (name.length > MAX_CASE_NAME_CHARS) {
    throw refuse(EVAL_CASE_BAD_NAME, `The name must be at most ${MAX_CASE_NAME_CHARS} characters`);
  }
  if (!Number.isInteger(edit.start_line) || !Number.isInteger(edit.end_line) || edit.start_line < 1) {
    throw refuse(EVAL_CASE_BAD_ZONE, 'The start line must be at least 1');
  }
  if (edit.start_line > edit.end_line) {
    throw refuse(EVAL_CASE_BAD_ZONE, 'The start line must not be after the end line');
  }
  if (!zoneMeetsHunk(inputDiff, file, name, edit.start_line, edit.end_line)) {
    throw refuse(EVAL_CASE_NO_HUNK, 'The lines lie outside every changed hunk of the stored patch');
  }
  return name;
}

/** The opposite-type case of the agent whose zone meets `expectation`, or null (AC-45). */
function opposingCase(
  agentCases: EvalCaseDbRow[],
  type: EvalExpectation['type'],
  prId: string,
  expectation: EvalExpectation,
): EvalCaseDbRow | null {
  return (
    agentCases.find((c) => {
      const theirs = EvalExpectation.safeParse(c.expectedOutput);
      const theirMeta = EvalFrozenMeta.safeParse(c.inputMeta);
      if (!theirs.success || !theirMeta.success) return false;
      return (
        theirs.data.type !== type &&
        zonesIntersect(
          { pr_id: theirMeta.data.pr_id, ...pick(theirs.data) },
          { pr_id: prId, ...pick(expectation) },
        )
      );
    }) ?? null
  );
}

const conflictError = (row: EvalCaseDbRow) =>
  new AppError(EVAL_CASE_CONFLICT, 'An eval case of the opposite type already covers these lines', 409, {
    case_id: row.id,
    case_name: row.name,
  });

async function createdFor(container: Container, workspaceId: string, row: EvalCaseDbRow, created: boolean) {
  const agent = row.agentId ? await container.agentsRepo.getById(workspaceId, row.agentId) : undefined;
  if (!agent) throw refuse(EVAL_CASE_NO_AGENT, 'The agent of this finding no longer exists');
  return { case: toCaseRow(row), agent_id: agent.id, agent_name: agent.name, created } satisfies EvalCaseCreated;
}

/** The case already made from this finding, as the API shows it, or null (AC-4). */
export async function existingCaseFor(
  container: Container,
  repo: EvalRepository,
  workspaceId: string,
  findingId: string,
): Promise<EvalCaseCreated | null> {
  const existing = await repo.caseBySourceFinding(workspaceId, findingId);
  return existing ? createdFor(container, workspaceId, existing, false) : null;
}

/**
 * Draft step: every AC-5 check of the first three reasons (undecided, no agent, no patch),
 * then the frozen input and expectation as the finding states them. Stores nothing, no model call.
 */
export async function draftCaseFromFinding(
  container: Container,
  workspaceId: string,
  findingId: string,
): Promise<CaseDraft> {
  const ctx = await container.reviewRepo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
  const { finding, review, pull } = ctx;

  const type = finding.acceptedAt ? 'must_find' : finding.dismissedAt ? 'must_not_flag' : null;
  if (!type) throw refuse(EVAL_CASE_UNDECIDED, 'Accept or dismiss the finding first');

  const agent = review.agentId ? await container.agentsRepo.getById(workspaceId, review.agentId) : undefined;
  if (!agent) throw refuse(EVAL_CASE_NO_AGENT, 'This review has no agent to attach the case to');

  const files = await container.reviewRepo.getPrFiles(pull.id);
  const patch = files.find((f) => f.path === finding.file)?.patch;
  if (!patch || patch.trim() === '') {
    throw refuse(EVAL_CASE_NO_PATCH, 'The pull request has no stored patch for this file');
  }

  return {
    agent,
    type,
    inputDiff: frozenDiff(finding.file, patch),
    meta: {
      pr_id: pull.id,
      pr_number: pull.number,
      pr_title: pull.title,
      pr_description: pull.body ?? '',
      file: finding.file,
    },
    expectation: {
      type,
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
      title: finding.title,
    },
    name: finding.title,
    findingId: finding.id,
    prNumber: pull.number,
    prTitle: pull.title,
  };
}

/**
 * Apply the user's name/zone to a draft (AC-47): the checks, then the draft with the edit. With
 * no edit, the finding's own zone still has to meet a hunk (the last AC-5 reason).
 */
export function applyEdit(draft: CaseDraft, edit?: EvalCaseEdit): CaseDraft {
  const e: EvalCaseEdit = edit ?? {
    name: draft.name,
    start_line: draft.expectation.start_line,
    end_line: draft.expectation.end_line,
  };
  // The finding's own title is stored as-is when there is no edit (it may be long).
  const name = edit ? checkEdit(e, draft.inputDiff, draft.expectation.file) : draft.name;
  if (!edit) {
    const x = draft.expectation;
    if (!zoneMeetsHunk(draft.inputDiff, x.file, x.title, x.start_line, x.end_line)) {
      throw refuse(EVAL_CASE_NO_HUNK, 'The finding lies outside every changed hunk of the stored patch');
    }
  }
  return {
    ...draft,
    name,
    expectation: { ...draft.expectation, start_line: e.start_line, end_line: e.end_line },
  };
}

/**
 * Freeze a decided finding into an eval case of its agent. Accepted → `must_find`,
 * dismissed → `must_not_flag`. An optional edit changes the name and zone (AC-47); a finding
 * that already has a case returns it unchanged and ignores the edit (AC-4).
 */
export async function createCaseFromFinding(
  container: Container,
  repo: EvalRepository,
  workspaceId: string,
  findingId: string,
  edit?: EvalCaseEdit,
): Promise<EvalCaseCreated> {
  const ctx = await container.reviewRepo.findingContext(findingId);
  if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');

  const existing = await existingCaseFor(container, repo, workspaceId, findingId);
  if (existing) return existing;

  const d = applyEdit(await draftCaseFromFinding(container, workspaceId, findingId), edit);

  const result = await repo.createCaseExclusive(
    {
      workspaceId,
      ownerKind: 'agent',
      ownerId: d.agent.id,
      agentId: d.agent.id,
      sourceFindingId: d.findingId,
      name: d.name,
      inputDiff: d.inputDiff,
      inputMeta: d.meta,
      expectedOutput: d.expectation,
    },
    (agentCases) => opposingCase(agentCases, d.type, d.meta.pr_id, d.expectation),
  );

  if (result.kind === 'unavailable') throw new NotFoundError('Finding not found');
  if (result.kind === 'conflict') throw conflictError(result.row);
  return {
    case: toCaseRow(result.row),
    agent_id: d.agent.id,
    agent_name: d.agent.name,
    created: result.kind === 'created',
  };
}

/**
 * Edit a stored case's name and zone (AC-51). Checks run against the case's OWN frozen diff;
 * type, file and frozen input never change. The conflict check excludes the case itself.
 */
export async function updateCaseFromEdit(
  repo: EvalRepository,
  workspaceId: string,
  agentId: string,
  caseId: string,
  edit: EvalCaseEdit,
): Promise<EvalCaseDbRow> {
  const row = await repo.getCase(workspaceId, agentId, caseId);
  if (!row) throw new NotFoundError('Eval case not found');
  const exp = EvalExpectation.safeParse(row.expectedOutput);
  const meta = EvalFrozenMeta.safeParse(row.inputMeta);
  if (!exp.success || !meta.success || !row.inputDiff) {
    throw refuse(EVAL_CASE_NO_PATCH, 'The stored case is incomplete');
  }

  const name = checkEdit(edit, row.inputDiff, exp.data.file);
  const expectation: EvalExpectation = { ...exp.data, start_line: edit.start_line, end_line: edit.end_line };

  const result = await repo.updateCaseExclusive(
    workspaceId,
    agentId,
    caseId,
    { name, expectedOutput: expectation },
    (others) => opposingCase(others, exp.data.type, meta.data.pr_id, expectation),
  );
  if (result.kind === 'missing') throw new NotFoundError('Eval case not found');
  if (result.kind === 'conflict') throw conflictError(result.row);
  return result.row;
}
