import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockLLMProvider } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { CONVENTIONS_FEATURE, REPO_NOT_INDEXED_CODE } from './constants.js';
import { normalizeRule } from './helpers.js';
import type { ConventionRow, ConventionScanRow } from './repository.js';
import { ConventionsService } from './service.js';

/**
 * Unit coverage for the conventions service with a MOCKED repository and the
 * MockLLMProvider (no Postgres, no network — the DB-backed behaviour lives in
 * conventions.it.test.ts). What is pinned here is the rescan merge of spec §5,
 * that the model is whatever `resolveFeatureModel` says (AC-53), and that a
 * malformed model reply is a typed error rather than a 500 (AC-40).
 *
 * NOTE: no provider or model id is named in this file either — the provider comes
 * off the mock provider's own `id` and the model is an opaque stub string.
 */

const repo = vi.hoisted(() => ({
  getRepo: vi.fn(),
  latestScan: vi.fn(),
  recordScan: vi.fn(),
  listAll: vi.fn(),
  listVisible: vi.fn(),
  listByStatus: vi.fn(),
  getCandidate: vi.fn(),
  updateCandidate: vi.fn(),
}));

const skills = vi.hoisted(() => ({
  findByNameAndSource: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

const featureModels = vi.hoisted(() => ({ resolveFeatureModel: vi.fn() }));

vi.mock('./repository.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./repository.js')>()),
  ConventionsRepository: vi.fn(() => repo),
}));
vi.mock('../skills/service.js', () => ({ SkillsService: vi.fn(() => skills) }));
vi.mock('../settings/feature-models.js', () => featureModels);

const WS = 'ws-1';
const REPO_ID = 'repo-1';
const HEAD_SHA = 'deadbee';
/** Opaque stand-in for "whatever Settings → Models resolved" — never a real id. */
const MODEL = 'stub-model-for-tests';

const SAMPLE_PATH = 'server/src/modules/demo/service.ts';
const SAMPLE_LINES = [
  "import { NotFoundError } from '../../platform/errors.js';",
  '',
  'export class DemoService {',
  '  async get(workspaceId: string, id: string) {',
  "    throw new NotFoundError('Demo not found');",
  '  }',
  '}',
];

const RULE_A = 'Services throw NotFoundError instead of returning null';
const RULE_B = 'Every service method takes workspaceId as its first argument';
const RULE_C = 'Modules import platform errors through the platform barrel';

let llm: MockLLMProvider;

/** A model reply citing lines that really exist in the sample above. */
function reply(rules: string[]) {
  const ranges: [number, number][] = [
    [4, 6],
    [1, 1],
    [3, 3],
  ];
  return {
    candidates: rules.map((rule, i) => ({
      category: 'structure',
      rule,
      evidence: {
        file: SAMPLE_PATH,
        start_line: ranges[i % ranges.length]![0],
        end_line: ranges[i % ranges.length]![1],
      },
      confidence: 0.9 - i / 100,
    })),
  };
}

function container(opts: { ranked?: string[]; structured?: unknown } = {}): Container {
  llm = new MockLLMProvider(undefined, { structured: opts.structured ?? reply([RULE_A]) });
  const ranked = opts.ranked ?? [SAMPLE_PATH];
  return {
    db: {},
    git: {
      readFile: async (_ref: unknown, path: string) => {
        if (path !== SAMPLE_PATH) throw new Error(`ENOENT: ${path}`);
        return SAMPLE_LINES.join('\n');
      },
      currentHead: async () => HEAD_SHA,
    },
    repoIntel: { getConventionSamples: async () => ranked },
    llm: async () => llm,
    agentsRepo: agents,
  } as unknown as Container;
}

const agents = {
  getById: vi.fn(),
  linkedSkills: vi.fn(),
  linkSkill: vi.fn(),
};

function row(over: Partial<ConventionRow> = {}): ConventionRow {
  return {
    id: 'cand-1',
    workspaceId: WS,
    repoId: REPO_ID,
    scanId: 'scan-1',
    category: 'structure',
    rule: RULE_A,
    ruleKey: normalizeRule(RULE_A),
    evidencePath: SAMPLE_PATH,
    evidenceStartLine: 4,
    evidenceEndLine: 6,
    evidenceSnippet: SAMPLE_LINES.slice(3, 6).join('\n'),
    confidence: 0.9,
    status: 'pending',
    accepted: false,
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    ...over,
  };
}

function scanRow(over: Partial<ConventionScanRow> = {}): ConventionScanRow {
  return {
    id: 'scan-1',
    workspaceId: WS,
    repoId: REPO_ID,
    headSha: HEAD_SHA,
    model: MODEL,
    sampleFiles: 1,
    dropped: 0,
    warnings: [],
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getRepo.mockResolvedValue({
    id: REPO_ID,
    owner: 'acme',
    name: 'widgets',
    fullName: 'acme/widgets',
    defaultBranch: 'main',
  });
  repo.latestScan.mockResolvedValue(scanRow());
  repo.recordScan.mockResolvedValue(scanRow());
  repo.listAll.mockResolvedValue([]);
  repo.listVisible.mockResolvedValue([]);
  repo.listByStatus.mockResolvedValue([]);
  featureModels.resolveFeatureModel.mockImplementation(async () => ({
    provider: llm.id,
    model: MODEL,
  }));
});

describe('ConventionsService.extract — the model comes from Settings → Models', () => {
  it('resolves the conventions feature and sends THAT model, then persists it (AC-53)', async () => {
    const c = container();

    const scan = await new ConventionsService(c).extract(WS, REPO_ID);

    expect(featureModels.resolveFeatureModel).toHaveBeenCalledWith(c, WS, CONVENTIONS_FEATURE);
    const call = llm.calls.find((x) => x.method === 'completeStructured');
    expect((call?.req as { model: string }).model).toBe(MODEL);
    expect(repo.recordScan).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL, sampleFiles: 1, headSha: HEAD_SHA }),
      expect.any(Array),
    );
    expect(scan.model).toBe(MODEL);
  });

  it('sends ONE structured call with the samples wrapped as untrusted data', async () => {
    await new ConventionsService(container()).extract(WS, REPO_ID);

    const structured = llm.calls.filter((x) => x.method === 'completeStructured');
    expect(structured).toHaveLength(1);
    const messages = (structured[0]!.req as { messages: { role: string; content: string }[] })
      .messages;
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.content).toContain(`<untrusted source="sample:${SAMPLE_PATH}">`);
  });

  it('persists the snippet read from the file, not the model text (AC-40b)', async () => {
    await new ConventionsService(container()).extract(WS, REPO_ID);

    const [, candidates] = repo.recordScan.mock.calls[0]!;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      rule: RULE_A,
      evidencePath: SAMPLE_PATH,
      evidenceStartLine: 4,
      evidenceEndLine: 6,
      evidenceSnippet: SAMPLE_LINES.slice(3, 6).join('\n'),
      ruleKey: normalizeRule(RULE_A),
    });
  });

  it('drops an unverifiable citation and counts it in `dropped` (AC-40b)', async () => {
    const structured = {
      candidates: [
        // a file the model was never shown
        {
          category: 'naming',
          rule: RULE_A,
          evidence: { file: 'src/invented.ts', start_line: 1, end_line: 3 },
          confidence: 0.9,
        },
        // a range past the end of the sample
        {
          category: 'naming',
          rule: RULE_B,
          evidence: { file: SAMPLE_PATH, start_line: 5, end_line: 30 },
          confidence: 0.8,
        },
        ...reply([RULE_C]).candidates,
      ],
    };

    await new ConventionsService(container({ structured })).extract(WS, REPO_ID);

    const [scan, candidates] = repo.recordScan.mock.calls[0]!;
    expect(scan).toMatchObject({ dropped: 2 });
    expect(candidates.map((c: { rule: string }) => c.rule)).toEqual([RULE_C]);
  });
});

describe('ConventionsService.extract — rescan merge (spec §5)', () => {
  it('keeps a rejected tombstone and an accepted row, and replaces only pending', async () => {
    repo.listAll.mockResolvedValue([
      row({ id: 'old-rejected', status: 'rejected', rule: RULE_A, ruleKey: normalizeRule(RULE_A) }),
      row({
        id: 'old-accepted',
        status: 'accepted',
        accepted: true,
        rule: RULE_B,
        ruleKey: normalizeRule(RULE_B),
      }),
      row({ id: 'old-pending', status: 'pending', rule: RULE_C, ruleKey: normalizeRule(RULE_C) }),
    ]);

    await new ConventionsService(container({ structured: reply([RULE_A, RULE_B, RULE_C]) })).extract(
      WS,
      REPO_ID,
    );

    // A re-found rejected rule is discarded; so is a re-found accepted one. Only
    // the rule whose previous row was `pending` is written again — and the old
    // pending row is deleted inside `recordScan`'s transaction.
    const [, candidates] = repo.recordScan.mock.calls[0]!;
    expect(candidates.map((c: { rule: string }) => c.rule)).toEqual([RULE_C]);
  });

  it('de-duplicates two phrasings of the same rule inside one scan', async () => {
    const structured = reply([RULE_A, 'services   THROW NotFoundError, instead of returning null']);

    await new ConventionsService(container({ structured })).extract(WS, REPO_ID);

    const [, candidates] = repo.recordScan.mock.calls[0]!;
    expect(candidates).toHaveLength(1);
  });
});

describe('ConventionsService.extract — failure modes', () => {
  it('malformed model output is a typed AppError, never an unhandled 500 (AC-40)', async () => {
    const c = container({ structured: { candidates: [{ rule: 'too short' }] } });

    const err = await new ConventionsService(c).extract(WS, REPO_ID).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(502);
    expect(repo.recordScan).not.toHaveBeenCalled();
  });

  it('a repo with no config and no ranked file is a 409 repo_not_indexed, with no model call', async () => {
    const c = container({ ranked: [] });

    const err = await new ConventionsService(c).extract(WS, REPO_ID).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(REPO_NOT_INDEXED_CODE);
    expect((err as AppError).statusCode).toBe(409);
    expect(llm.calls).toHaveLength(0);
    expect(featureModels.resolveFeatureModel).not.toHaveBeenCalled();
  });

  it('a repo from another workspace is a 404, not a 403', async () => {
    repo.getRepo.mockResolvedValue(undefined);
    const svc = new ConventionsService(container());

    for (const call of [
      svc.extract(WS, REPO_ID),
      svc.get(WS, REPO_ID),
      svc.draft(WS, REPO_ID),
      svc.createSkill(WS, REPO_ID, { name: 'repo-conventions', body: 'x' }),
    ]) {
      const err = await call.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as AppError).statusCode).toBe(404);
    }
  });
});

describe('ConventionsService.updateCandidate', () => {
  it('writes `accepted` in lockstep with `status`', async () => {
    repo.getCandidate.mockResolvedValue({ row: row(), headSha: HEAD_SHA });
    repo.updateCandidate.mockResolvedValue(row({ status: 'accepted', accepted: true }));

    const candidate = await new ConventionsService(container()).updateCandidate(WS, 'cand-1', {
      status: 'accepted',
    });

    expect(repo.updateCandidate).toHaveBeenCalledWith(WS, 'cand-1', {
      status: 'accepted',
      accepted: true,
    });
    expect(candidate.accepted).toBe(true);
    expect(candidate.head_sha).toBe(HEAD_SHA);
  });

  it('an edited rule gets a fresh merge key and keeps its evidence', async () => {
    repo.getCandidate.mockResolvedValue({ row: row(), headSha: HEAD_SHA });
    repo.updateCandidate.mockResolvedValue(row({ rule: RULE_C, ruleKey: normalizeRule(RULE_C) }));

    const candidate = await new ConventionsService(container()).updateCandidate(WS, 'cand-1', {
      rule: RULE_C,
    });

    expect(repo.updateCandidate).toHaveBeenCalledWith(WS, 'cand-1', {
      rule: RULE_C,
      ruleKey: normalizeRule(RULE_C),
    });
    expect(candidate.evidence_snippet).toBe(SAMPLE_LINES.slice(3, 6).join('\n'));
  });

  it('a candidate from another workspace is a 404', async () => {
    repo.getCandidate.mockResolvedValue(undefined);

    await expect(
      new ConventionsService(container()).updateCandidate(WS, 'cand-1', { status: 'rejected' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.updateCandidate).not.toHaveBeenCalled();
  });
});

describe('ConventionsService — accepted → skill (spec §6)', () => {
  const accepted = [{ row: row({ status: 'accepted', accepted: true }), headSha: HEAD_SHA }];

  it('409s on a draft with nothing accepted', async () => {
    repo.listByStatus.mockResolvedValue([]);

    const err = await new ConventionsService(container())
      .draft(WS, REPO_ID)
      .catch((e: unknown) => e);

    expect((err as AppError).statusCode).toBe(409);
  });

  it('creates with source extracted and the accepted evidence paths', async () => {
    repo.listByStatus.mockResolvedValue(accepted);
    skills.findByNameAndSource.mockResolvedValue(undefined);
    skills.create.mockResolvedValue({ id: 'skill-1', name: 'repo-conventions' });

    await new ConventionsService(container()).createSkill(WS, REPO_ID, {
      name: 'repo-conventions',
      description: 'edited description',
      body: 'edited body',
      enabled: false,
    });

    expect(skills.create).toHaveBeenCalledWith(
      WS,
      expect.objectContaining({
        name: 'repo-conventions',
        description: 'edited description',
        body: 'edited body',
        enabled: false,
        evidenceFiles: [SAMPLE_PATH],
      }),
      'extracted',
    );
  });

  it('UPDATES the existing extracted skill of the same name instead of inserting', async () => {
    repo.listByStatus.mockResolvedValue(accepted);
    skills.findByNameAndSource.mockResolvedValue({ id: 'skill-1', version: 1 });
    skills.update.mockResolvedValue({ id: 'skill-1', version: 2 });

    const skill = await new ConventionsService(container()).createSkill(WS, REPO_ID, {
      name: 'repo-conventions',
      body: 'rescanned body',
    });

    expect(skills.create).not.toHaveBeenCalled();
    expect(skills.update).toHaveBeenCalledWith(
      WS,
      'skill-1',
      expect.objectContaining({ body: 'rescanned body' }),
    );
    expect(skill.version).toBe(2);
  });

  it('links the skill at the end of the agent`s list when agent_id is given (AC-42)', async () => {
    repo.listByStatus.mockResolvedValue(accepted);
    skills.findByNameAndSource.mockResolvedValue(undefined);
    skills.create.mockResolvedValue({ id: 'skill-1' });
    agents.getById.mockResolvedValue({ id: 'agent-1' });
    agents.linkedSkills.mockResolvedValue([{ order: 0 }, { order: 3 }]);

    await new ConventionsService(container()).createSkill(WS, REPO_ID, {
      name: 'repo-conventions',
      body: 'body',
      agentId: 'agent-1',
    });

    expect(agents.linkSkill).toHaveBeenCalledWith('agent-1', 'skill-1', 4);
  });

  it('an unknown agent is a 404 and creates NOTHING', async () => {
    agents.getById.mockResolvedValue(undefined);

    await expect(
      new ConventionsService(container()).createSkill(WS, REPO_ID, {
        name: 'repo-conventions',
        body: 'body',
        agentId: 'agent-x',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(skills.create).not.toHaveBeenCalled();
    expect(skills.update).not.toHaveBeenCalled();
    expect(agents.linkSkill).not.toHaveBeenCalled();
  });
});
