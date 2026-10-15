import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { EvalCaseDbRow, EvalRepository } from './repository.js';
import { createCaseFromFinding } from './cases.js';
import { frozenDiff } from './helpers.js';

const WS = 'ws-1';
const FINDING = 'f-1';
const AGENT = 'agent-1';
const PR = 'pr-1';
const FILE = 'src/a.ts';
const PATCH = '@@ -1,3 +1,4 @@\n a\n+b\n c\n d\n@@ -50,3 +51,4 @@\n x\n+y\n z\n w';
const AUTHOR = 'zed-the-author';

const finding = (over: Record<string, unknown> = {}) => ({
  id: FINDING,
  reviewId: 'rev-1',
  file: FILE,
  startLine: 2,
  endLine: 2,
  severity: 'high',
  category: 'bug',
  title: 'Null deref',
  rationale: 'r',
  suggestion: null,
  confidence: 0.9,
  kind: 'finding',
  trifectaComponents: null,
  acceptedAt: new Date(),
  dismissedAt: null,
  ...over,
});
const pull = (over: Record<string, unknown> = {}) => ({
  id: PR,
  workspaceId: WS,
  number: 482,
  title: 'Fix things',
  body: 'Body text',
  author: AUTHOR,
  ...over,
});
const ctx = (f: Record<string, unknown> = {}, p: Record<string, unknown> = {}, agentId: string | null = AGENT) => ({
  finding: finding(f),
  review: { id: 'rev-1', agentId },
  pull: pull(p),
});

function setup() {
  const reviewRepo = { findingContext: vi.fn(), getPrFiles: vi.fn() };
  const agentsRepo = { getById: vi.fn() };
  const llm = vi.fn();
  const container = { reviewRepo, agentsRepo, llm } as unknown as Container;
  let agentCases: EvalCaseDbRow[] = [];
  const repo = {
    caseBySourceFinding: vi.fn(),
    createCaseExclusive: vi.fn(async (values: any, decide: (c: EvalCaseDbRow[]) => EvalCaseDbRow | null) => {
      const blocker = decide(agentCases);
      if (blocker) return { kind: 'conflict', row: blocker };
      return { kind: 'created', row: { id: 'case-new', createdAt: new Date(), notes: null, ...values } };
    }),
  };
  reviewRepo.findingContext.mockResolvedValue(ctx());
  reviewRepo.getPrFiles.mockResolvedValue([{ path: FILE, patch: PATCH }]);
  agentsRepo.getById.mockResolvedValue({ id: AGENT, name: 'Agent One' });
  repo.caseBySourceFinding.mockResolvedValue(undefined);
  const run = () => createCaseFromFinding(container, repo as unknown as EvalRepository, WS, FINDING);
  return {
    reviewRepo,
    agentsRepo,
    llm,
    repo,
    run,
    setCases: (c: unknown[]) => {
      agentCases = c as EvalCaseDbRow[];
    },
  };
}

const existingCase = (type: 'must_find' | 'must_not_flag', s: number, e: number) =>
  ({
    id: 'case-old',
    name: 'Old case',
    agentId: AGENT,
    sourceFindingId: 'f-old',
    inputMeta: { pr_id: PR, pr_number: 482, pr_title: 't', pr_description: '', file: FILE },
    expectedOutput: { type, file: FILE, start_line: s, end_line: e, title: 'Old case' },
  }) as unknown as EvalCaseDbRow;

async function refusal(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected a refusal');
}

describe('createCaseFromFinding', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('AC-2: an accepted finding becomes a must_find case', async () => {
    const out = await s.run();
    expect(out.created).toBe(true);
    expect(out.agent_id).toBe(AGENT);
    expect(out.agent_name).toBe('Agent One');
    expect(out.case.name).toBe('Null deref');
    expect(out.case.source_finding_id).toBe(FINDING);
    expect(out.case.expectation).toEqual({
      type: 'must_find',
      file: FILE,
      start_line: 2,
      end_line: 2,
      title: 'Null deref',
    });
    expect(out.case.latest_status).toBe('never_run');
    const [values] = s.repo.createCaseExclusive.mock.calls[0]!;
    expect(values).toMatchObject({
      workspaceId: WS,
      ownerKind: 'agent',
      ownerId: AGENT,
      agentId: AGENT,
      sourceFindingId: FINDING,
      name: 'Null deref',
    });
  });

  it('AC-2: a dismissed finding becomes a must_not_flag case', async () => {
    s.reviewRepo.findingContext.mockResolvedValue(
      ctx({ acceptedAt: null, dismissedAt: new Date() }),
    );
    const out = await s.run();
    expect(out.case.expectation.type).toBe('must_not_flag');
  });

  it('AC-3: stores the frozen diff and metadata, never the author', async () => {
    await s.run();
    const [values] = s.repo.createCaseExclusive.mock.calls[0]!;
    expect(values.inputDiff).toBe(frozenDiff(FILE, PATCH));
    expect(values.inputMeta).toEqual({
      pr_id: PR,
      pr_number: 482,
      pr_title: 'Fix things',
      pr_description: 'Body text',
      file: FILE,
    });
    expect(JSON.stringify(values)).not.toContain(AUTHOR);
    expect(values.inputMeta).not.toHaveProperty('author');
  });

  it('EC-8: an empty PR body is stored as an empty description', async () => {
    s.reviewRepo.findingContext.mockResolvedValue(ctx({}, { body: null }));
    await s.run();
    expect(s.repo.createCaseExclusive.mock.calls[0]![0].inputMeta.pr_description).toBe('');
  });

  it('AC-4: an existing case is returned with created: false and nothing is inserted', async () => {
    s.repo.caseBySourceFinding.mockResolvedValue({
      ...existingCase('must_find', 2, 2),
      workspaceId: WS,
      createdAt: new Date(),
    });
    // EC-2: the decision was flipped since — still the existing case.
    s.reviewRepo.findingContext.mockResolvedValue(ctx({ acceptedAt: null, dismissedAt: new Date() }));
    const out = await s.run();
    expect(out.created).toBe(false);
    expect(out.case.id).toBe('case-old');
    expect(out.case.expectation.type).toBe('must_find');
    expect(s.repo.createCaseExclusive).not.toHaveBeenCalled();
  });

  describe('AC-5 refusals', () => {
    const expectRefused = async (code: string) => {
      const err = await refusal(s.run());
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(code);
      expect(err.statusCode).toBe(422);
      expect(s.repo.createCaseExclusive).not.toHaveBeenCalled();
    };

    it('undecided', async () => {
      s.reviewRepo.findingContext.mockResolvedValue(ctx({ acceptedAt: null, dismissedAt: null }));
      await expectRefused('eval_case_undecided');
    });
    it('review without an agent', async () => {
      s.reviewRepo.findingContext.mockResolvedValue(ctx({}, {}, null));
      await expectRefused('eval_case_no_agent');
    });
    it('agent is gone', async () => {
      s.agentsRepo.getById.mockResolvedValue(undefined);
      await expectRefused('eval_case_no_agent');
    });
    it('no file row', async () => {
      s.reviewRepo.getPrFiles.mockResolvedValue([{ path: 'other.ts', patch: PATCH }]);
      await expectRefused('eval_case_no_patch');
    });
    it('null patch', async () => {
      s.reviewRepo.getPrFiles.mockResolvedValue([{ path: FILE, patch: null }]);
      await expectRefused('eval_case_no_patch');
    });
    it('whitespace patch', async () => {
      s.reviewRepo.getPrFiles.mockResolvedValue([{ path: FILE, patch: '  \n ' }]);
      await expectRefused('eval_case_no_patch');
    });
    it('lines outside every hunk', async () => {
      s.reviewRepo.findingContext.mockResolvedValue(ctx({ startLine: 30, endLine: 31 }));
      await expectRefused('eval_case_no_hunk');
    });
    it('EC-1: no agent and no patch gives one of the two reasons', async () => {
      s.agentsRepo.getById.mockResolvedValue(undefined);
      s.reviewRepo.getPrFiles.mockResolvedValue([]);
      const err = await refusal(s.run());
      expect(['eval_case_no_agent', 'eval_case_no_patch']).toContain(err.code);
    });
  });

  describe('AC-45 zone conflict', () => {
    it('a must_find at 153-180 blocks a must_not_flag at 156-188', async () => {
      s.reviewRepo.findingContext.mockResolvedValue(
        ctx({ acceptedAt: null, dismissedAt: new Date(), startLine: 156, endLine: 188 }),
      );
      s.reviewRepo.getPrFiles.mockResolvedValue([
        { path: FILE, patch: '@@ -150,3 +150,40 @@\n' + Array.from({ length: 40 }, (_, i) => `+l${i}`).join('\n') },
      ]);
      s.setCases([existingCase('must_find', 153, 180)]);
      const err = await refusal(s.run());
      expect(err.code).toBe('eval_case_conflict');
      expect(err.statusCode).toBe(409);
      expect(err.details).toEqual({ case_id: 'case-old', case_name: 'Old case' });
    });

    it('the reverse order conflicts too', async () => {
      s.setCases([existingCase('must_not_flag', 1, 3)]);
      const err = await refusal(s.run());
      expect(err.code).toBe('eval_case_conflict');
      expect(err.statusCode).toBe(409);
    });

    it('the same type on the same lines is created', async () => {
      s.setCases([existingCase('must_find', 1, 3)]);
      const out = await s.run();
      expect(out.created).toBe(true);
    });
  });

  it('AC-32: a finding of another workspace is a NotFoundError and reads nothing else', async () => {
    s.reviewRepo.findingContext.mockResolvedValue(ctx({}, { workspaceId: 'ws-other' }));
    await expect(s.run()).rejects.toBeInstanceOf(NotFoundError);
    expect(s.reviewRepo.getPrFiles).not.toHaveBeenCalled();
    expect(s.repo.createCaseExclusive).not.toHaveBeenCalled();
  });

  it('a missing finding is a NotFoundError', async () => {
    s.reviewRepo.findingContext.mockResolvedValue(undefined);
    await expect(s.run()).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC-36: never calls the model', async () => {
    await s.run();
    expect(s.llm).not.toHaveBeenCalled();
  });
});
