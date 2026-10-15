import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrBriefDraft } from '@devdigest/shared';
import type { PrBrief } from '@devdigest/shared';
import { MockLLMProvider } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { BriefService } from './service.js';

/**
 * Unit coverage for the brief service: MOCKED repository, blast service and
 * feature-model resolver, MockLLMProvider. The DB-backed behaviour lives in
 * brief.it.test.ts. No provider or model id is named here — the model is an
 * opaque stub string and the provider comes off the mock.
 */

const repo = vi.hoisted(() => ({ get: vi.fn(), upsert: vi.fn() }));
const blastSvc = vi.hoisted(() => ({ forPull: vi.fn() }));
const BlastCtor = vi.hoisted(() => vi.fn());
const featureModels = vi.hoisted(() => ({ resolveFeatureModel: vi.fn() }));
const projectContext = vi.hoisted(() => ({ forBrief: vi.fn() }));
const intentSvc = vi.hoisted(() => ({ get: vi.fn(), recalculate: vi.fn(), ensureForReview: vi.fn() }));

vi.mock('./repository.js', () => ({ BriefRepository: vi.fn(() => repo) }));
vi.mock('../blast/service.js', () => ({
  BlastService: BlastCtor.mockImplementation(() => blastSvc),
}));
vi.mock('../settings/feature-models.js', () => featureModels);
vi.mock('../reviews/intent/intent-service.js', () => ({ IntentService: vi.fn(() => intentSvc) }));

const WS = 'ws-1';
const PR = 'pr-1';
const MODEL = 'stub-model-for-tests';
const TITLE = 'A very secret title';

const PATCH = '@@ -1,2 +10,5 @@\n+x';
const PULL = { id: PR, workspaceId: WS, repoId: 'r1', title: TITLE, body: 'body', headSha: 'pull-row-sha' };
const FILES = [
  { path: 'src/a.ts', additions: 3, deletions: 1, patch: PATCH },
  { path: 'src/b.ts', additions: 1, deletions: 0, patch: PATCH },
];
const BLAST = {
  changed_symbols: [],
  downstream: [
    { symbol: 's', callers: [{ name: 'n', file: 'src/caller.ts', line: 4 }], endpoints_affected: [], crons_affected: [] },
  ],
  summary: '1 symbol · 1 caller · 0 endpoints · 0 crons',
  degraded: false,
  reason: null,
};
const REPLY = {
  summary: 'It does X.',
  risks: [{ kind: 'k', title: 't', explanation: 'e', severity: 'high', file_refs: ['src/a.ts'] }],
  review_focus: [{ file: 'src/a.ts', line: 11, reason: 'r' }],
};

const reviewRepo = { getPull: vi.fn(), getPrFiles: vi.fn() };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

let llm: MockLLMProvider;
let llmFactory: ReturnType<typeof vi.fn>;
let count: (t: string) => number;

function make(opts: { structured?: unknown; llmThrows?: unknown } = {}) {
  llm = new MockLLMProvider(undefined, { structured: opts.structured ?? REPLY });
  llmFactory = vi.fn(async () => {
    if (opts.llmThrows) throw opts.llmThrows;
    return llm;
  });
  const container = {
    db: {},
    reviewRepo,
    tokenizer: { count: (t: string) => count(t) },
    projectContext,
    llm: llmFactory,
  } as unknown as Container;
  return new BriefService(container, log as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  BlastCtor.mockImplementation(() => blastSvc);
  count = (t) => Math.ceil(t.length / 4);
  reviewRepo.getPull.mockResolvedValue(PULL);
  reviewRepo.getPrFiles.mockResolvedValue(FILES);
  blastSvc.forPull.mockResolvedValue(BLAST);
  featureModels.resolveFeatureModel.mockResolvedValue({ provider: 'openai', model: MODEL });
  intentSvc.get.mockResolvedValue(null);
  projectContext.forBrief.mockResolvedValue({ documents: [], skipped: [] });
  repo.get.mockResolvedValue(undefined);
  repo.upsert.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('BriefService.generate', () => {
  it('refuses a PR without recorded files: 409, no model call, no upsert, no blast (AC-9)', async () => {
    reviewRepo.getPrFiles.mockResolvedValue([]);
    const svc = make();
    const err = await svc.generate(WS, PR, 'sha').catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('brief_no_files');
    expect(err.statusCode).toBe(409);
    expect(llm.calls).toEqual([]);
    expect(llmFactory).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(blastSvc.forPull).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });

  it('is 404 when the PR is not in the workspace', async () => {
    reviewRepo.getPull.mockResolvedValue(undefined);
    await expect(make().generate(WS, PR, 'sha')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('sends exactly one request with maxRetries 0, timeoutMs 60000 and the draft schema (AC-13)', async () => {
    const svc = make();
    await svc.generate(WS, PR, 'sha');
    expect(llm.calls).toHaveLength(1);
    const req = llm.calls[0]!.req as Record<string, unknown>;
    expect(req.maxRetries).toBe(0);
    expect(req.timeoutMs).toBe(60000);
    expect(req.schema).toBe(PrBriefDraft);
  });

  it('turns an invalid reply into an ExternalServiceError without raw; one call, no upsert (AC-13, AC-16, EC-6)', async () => {
    const svc = make({ structured: { nope: true } });
    const err = await svc.generate(WS, PR, 'sha').catch((e) => e);
    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(JSON.stringify(err.details)).not.toContain('raw');
    // The mock fails with a plain Error (no adapter `raw` signal): classified structurally, not by message text.
    expect(err.details).toEqual({ reason: 'provider_error' });
    expect(llm.calls).toHaveLength(1);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('never rethrows the adapter error or its raw reply', async () => {
    const svc = make();
    llm.completeStructured = async () => {
      throw new ExternalServiceError('provider said no', { raw: 'LEAKED-RAW-REPLY' });
    };
    const err = await svc.generate(WS, PR, 'sha').catch((e) => e);
    expect(JSON.stringify([err.message, err.details])).not.toContain('LEAKED-RAW-REPLY');
    expect(err.details).toEqual({ reason: 'invalid_reply' });
  });

  it('a plain error whose message mentions "schema" is a provider_error, not an invalid_reply', async () => {
    const svc = make();
    llm.completeStructured = async () => {
      throw new Error('400 unsupported JSON schema');
    };
    const err = await svc.generate(WS, PR, 'sha').catch((e) => e);
    expect(err.details).toEqual({ reason: 'provider_error' });
  });

  it('a missing key (container.llm rejects with ConfigError) fails with zero model calls and no upsert (EC-6)', async () => {
    const svc = make({ llmThrows: new ConfigError('KEY is not configured') });
    const err = await svc.generate(WS, PR, 'sha').catch((e) => e);
    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err.details).toEqual({ reason: 'no_api_key' });
    expect(llm.calls).toEqual([]);
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledTimes(1);
    expect(log.info.mock.calls[0]![0]).toMatchObject({ outcome: 'failed' });
  });

  it('a provider that never resolves fails after 60 s and stores nothing', async () => {
    vi.useFakeTimers();
    const svc = make();
    llm.completeStructured = () => new Promise(() => {});
    const p = svc.generate(WS, PR, 'sha').catch((e) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    const err = await p;
    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err.details).toEqual({ reason: 'timeout' });
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(log.info.mock.calls[0]![0]).toMatchObject({ outcome: 'failed' });
  });

  it('uses the provider and model resolveFeatureModel returned for risk_brief (AC-17)', async () => {
    const svc = make();
    await svc.generate(WS, PR, 'sha');
    expect(featureModels.resolveFeatureModel).toHaveBeenCalledWith(expect.anything(), WS, 'risk_brief');
    expect(llmFactory).toHaveBeenCalledWith('openai');
    expect((llm.calls[0]!.req as { model: string }).model).toBe(MODEL);
  });

  it('stores the head SHA the caller sent, not the pull row SHA (AC-19, EC-7)', async () => {
    const svc = make();
    const res = await svc.generate(WS, PR, 'client-sha');
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    const [prId, stored] = repo.upsert.mock.calls[0]! as [string, PrBrief];
    expect(prId).toBe(PR);
    expect(stored.head_sha).toBe('client-sha');
    expect(stored.intent).toBeNull();
    expect(stored.history).toBeNull();
    expect(res.brief).toEqual(stored);
  });

  it('grounds against the full facts even when the budget cut a file from the input (AC-12)', async () => {
    count = (t) => t.length; // 1 token per char: 150 file rows cannot fit in 8000
    const svc = make({
      structured: {
        summary: 's',
        risks: [{ kind: 'k', title: 't', explanation: 'e', severity: 'low', file_refs: ['src/b.ts'] }],
        review_focus: [{ file: 'src/b.ts', line: 10, reason: 'r' }],
      },
    });
    const big = Array.from({ length: 150 }, (_, i) => ({ ...FILES[0]!, path: `src/file-${i}.ts` }));
    reviewRepo.getPrFiles.mockResolvedValue([...FILES, ...big]);
    const res = await svc.generate(WS, PR, 'sha');
    const user = (llm.calls[0]!.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(user).toContain(TITLE);
    expect(user).not.toContain('src/b.ts |'); // lowest-churn core row was cut from the input
    expect(res.brief!.risks[0]!.file_refs).toEqual(['src/b.ts']);
    expect(res.brief!.review_focus).toHaveLength(1);
  });

  it('still stores a brief grounded on PR files only when blast throws (AC-12, EC-2)', async () => {
    blastSvc.forPull.mockRejectedValue(new Error('boom'));
    const svc = make({
      structured: {
        summary: 's',
        risks: [
          { kind: 'k', title: 'ok', explanation: 'e', severity: 'low', file_refs: ['src/a.ts'] },
          { kind: 'k', title: 'caller', explanation: 'e', severity: 'low', file_refs: ['src/caller.ts'] },
        ],
        review_focus: [],
      },
    });
    const res = await svc.generate(WS, PR, 'sha');
    expect(res.brief!.risks.map((r) => r.title)).toEqual(['ok']);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('logs exactly one generation record without title, paths, reply or key (NFR-5)', async () => {
    const svc = make();
    await svc.generate(WS, PR, 'sha');
    expect(log.info).toHaveBeenCalledTimes(1);
    const [record, msg] = log.info.mock.calls[0]!;
    expect(msg).toBe('brief: generation');
    expect(Object.keys(record).sort()).toEqual([
      'contextDocs',
      'contextDocsDropped',
      'contextDocsSkipped',
      'inputTokens',
      'model',
      'outcome',
      'prId',
      'provider',
    ]);
    expect(record).toMatchObject({ prId: PR, provider: 'openai', model: MODEL, outcome: 'stored' });
    expect(typeof record.inputTokens).toBe('number');
    const text = JSON.stringify(log.info.mock.calls) + JSON.stringify(log.warn.mock.calls);
    expect(text).not.toContain(TITLE);
    expect(text).not.toContain('src/a.ts');
    expect(text).not.toContain('It does X.');
  });
});

const INTENT_DETAIL = {
  intent: 'Add retry to the uploader',
  in_scope: ['retry loop', 'backoff config'],
  out_of_scope: ['UI changes'],
  confidence: 'medium',
  stale: false,
};
const modelText = () =>
  (llm.calls[0]!.req as { messages: { content: string }[] }).messages.map((m) => m.content).join('\n');
const modelCalls = () => llm.calls.filter((c) => c.method === 'completeStructured');
const intentBlock = (text: string) =>
  /<untrusted source="pr-intent">([\s\S]*?)<\/untrusted>/.exec(text)?.[1];

describe('BriefService.generate: stored intent (AC-31, AC-32, AC-33)', () => {
  it('AC-31: gives the stored intent to the model inside a pr-intent untrusted block, stores it, one call', async () => {
    intentSvc.get.mockResolvedValue(INTENT_DETAIL);
    const res = await make().generate(WS, PR, 'sha');
    expect(modelCalls()).toHaveLength(1);
    const block = intentBlock(modelText());
    expect(block).toBeDefined();
    for (const needle of ['Add retry to the uploader', 'retry loop', 'backoff config', 'UI changes', 'medium']) {
      expect(block).toContain(needle);
    }
    const expected = { intent: INTENT_DETAIL.intent, in_scope: INTENT_DETAIL.in_scope, out_of_scope: INTENT_DETAIL.out_of_scope };
    expect(res.brief!.intent).toEqual(expected);
    expect((repo.upsert.mock.calls[0]![1] as PrBrief).intent).toEqual(expected);
    expect(intentSvc.get).toHaveBeenCalledWith(WS, PR);
  });

  it('AC-31: with no stored intent the input has no pr-intent block and brief.intent is null, one call', async () => {
    const res = await make().generate(WS, PR, 'sha');
    expect(modelCalls()).toHaveLength(1);
    expect(modelText()).not.toContain('pr-intent');
    expect(res.brief!.intent).toBeNull();
  });

  it('AC-33: a stale intent is still given, marked stale as trusted text outside the block; one call', async () => {
    intentSvc.get.mockResolvedValue({ ...INTENT_DETAIL, stale: true });
    const res = await make().generate(WS, PR, 'sha');
    expect(modelCalls()).toHaveLength(1);
    const text = modelText();
    expect(intentBlock(text)).toContain('Add retry to the uploader');
    const outside = text.replace(/<untrusted source="[^"]*">[\s\S]*?<\/untrusted>/g, '');
    expect(outside).toMatch(/stale/i);
    expect(res.brief!.intent).toEqual({
      intent: INTENT_DETAIL.intent,
      in_scope: INTENT_DETAIL.in_scope,
      out_of_scope: INTENT_DETAIL.out_of_scope,
    });
  });

  it('AC-33: a fresh intent is not marked stale', async () => {
    intentSvc.get.mockResolvedValue(INTENT_DETAIL);
    await make().generate(WS, PR, 'sha');
    const user = (llm.calls[0]!.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(user).not.toMatch(/stale/i);
  });

  it.each([
    ['no intent', null],
    ['fresh intent', INTENT_DETAIL],
    ['stale intent', { ...INTENT_DETAIL, stale: true }],
  ])('AC-32: %s -> never derives (recalculate/ensureForReview untouched), exactly one model call', async (_n, detail) => {
    intentSvc.get.mockResolvedValue(detail);
    await make().generate(WS, PR, 'sha');
    expect(intentSvc.recalculate).not.toHaveBeenCalled();
    expect(intentSvc.ensureForReview).not.toHaveBeenCalled();
    expect(modelCalls()).toHaveLength(1);
    const features = featureModels.resolveFeatureModel.mock.calls.map((c) => c[2]);
    expect(features).toEqual(['risk_brief']);
    expect(llmFactory).toHaveBeenCalledTimes(1);
  });

  it('AC-31/AC-32: when reading the intent fails the brief is generated without it; error text not in the input', async () => {
    intentSvc.get.mockRejectedValue(new Error('LEAKED-INTENT-FAILURE-TEXT'));
    const res = await make().generate(WS, PR, 'sha');
    expect(modelCalls()).toHaveLength(1);
    expect(res.brief!.intent).toBeNull();
    const text = modelText();
    expect(text).not.toContain('LEAKED-INTENT-FAILURE-TEXT');
    expect(text).not.toContain('pr-intent');
    expect(intentSvc.recalculate).not.toHaveBeenCalled();
  });

  it('NFR-2/NFR-3: a huge intent plus many files keeps the model input <= 8000 tokens and keeps every file row the intent displaced', async () => {
    count = (t) => t.length;
    intentSvc.get.mockResolvedValue({
      ...INTENT_DETAIL,
      in_scope: Array.from({ length: 300 }, (_, i) => `in-scope item number ${i} `.padEnd(60, 'x')),
      out_of_scope: Array.from({ length: 300 }, (_, i) => `out-of-scope item ${i} `.padEnd(60, 'y')),
    });
    const many = Array.from({ length: 40 }, (_, i) => ({ ...FILES[0]!, path: `src/many-${i}.ts` }));
    reviewRepo.getPrFiles.mockResolvedValue(many);
    await make().generate(WS, PR, 'sha');
    const text = modelText();
    expect(text.length).toBeLessThanOrEqual(8000);
    for (const f of many) expect(text).toContain(`${f.path} |`);
    expect(text).not.toContain('in-scope item number 299');
  });
});

describe('BriefService.generate: stored intent vs. what the model was given (AC-31)', () => {
  it('AC-31: the whole intent cut from the model input -> stored intent is null', async () => {
    count = (t) => t.length;
    intentSvc.get.mockResolvedValue({ ...INTENT_DETAIL, intent: 'very long summary '.repeat(1500) });
    const res = await make().generate(WS, PR, 'sha');
    expect(modelText()).not.toContain('pr-intent');
    expect(res.brief!.intent).toBeNull();
    expect((repo.upsert.mock.calls[0]![1] as PrBrief).intent).toBeNull();
  });

  it('AC-31: only the lists cut from the model input -> stored intent is still set', async () => {
    count = (t) => t.length;
    intentSvc.get.mockResolvedValue({
      ...INTENT_DETAIL,
      in_scope: Array.from({ length: 300 }, (_, i) => `in-scope item number ${i} `.padEnd(60, 'x')),
      out_of_scope: Array.from({ length: 300 }, (_, i) => `out-of-scope item ${i} `.padEnd(60, 'y')),
    });
    const res = await make().generate(WS, PR, 'sha');
    expect(intentBlock(modelText())).toContain(INTENT_DETAIL.intent);
    expect(res.brief!.intent).not.toBeNull();
    expect(res.brief!.intent!.intent).toBe(INTENT_DETAIL.intent);
    expect((repo.upsert.mock.calls[0]![1] as PrBrief).intent).not.toBeNull();
  });
});

describe('BriefService.get', () => {
  it('returns { brief: null } when no row is stored', async () => {
    expect(await make().get(WS, PR)).toEqual({ brief: null });
  });

  it('returns the stored brief', async () => {
    const stored = { ...REPLY, head_sha: 'h', intent: null, history: null };
    repo.get.mockResolvedValue(stored);
    expect(await make().get(WS, PR)).toEqual({ brief: stored });
  });

  it('returns { brief: null } for a row that fails PrBrief', async () => {
    repo.get.mockResolvedValue({ summary: 1 });
    expect(await make().get(WS, PR)).toEqual({ brief: null });
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('is 404 for a PR getPull does not return, without reading the brief (AC-30)', async () => {
    reviewRepo.getPull.mockResolvedValue(undefined);
    await expect(make().get(WS, PR)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.get).not.toHaveBeenCalled();
  });
});


describe('BriefService.generate — project documents', () => {
  const DOC_TEXT = 'SECRET-DOC-TEXT ';
  const two = {
    documents: [
      { path: 'docs/a.md', content: `${DOC_TEXT}a` },
      { path: 'specs/b.md', content: `${DOC_TEXT}b` },
    ],
    skipped: [],
  };

  it('AC-19: one model call with maxRetries 0; intent is not recalculated', async () => {
    projectContext.forBrief.mockResolvedValue(two);
    await make().generate(WS, PR, 'sha');
    expect(llm.calls).toHaveLength(1);
    expect((llm.calls[0]!.req as Record<string, unknown>).maxRetries).toBe(0);
    expect(intentSvc.recalculate).not.toHaveBeenCalled();
    expect(intentSvc.ensureForReview).not.toHaveBeenCalled();
    const user = (llm.calls[0]!.req as { messages: { content: string }[] }).messages[1]!.content;
    expect(user).toContain(`${DOC_TEXT}a`);
  });

  it('SPEC-01 AC-36: context_docs lists the paths given, in order; [] when none', async () => {
    projectContext.forBrief.mockResolvedValue(two);
    await make().generate(WS, PR, 'sha');
    expect(repo.upsert.mock.calls[0]![1].context_docs).toEqual(['docs/a.md', 'specs/b.md']);
    repo.upsert.mockClear();
    projectContext.forBrief.mockResolvedValue({ documents: [], skipped: [] });
    await make().generate(WS, PR, 'sha');
    expect(repo.upsert.mock.calls[0]![1].context_docs).toEqual([]);
  });

  it('EC-17: a tiny budget leaves only the documents that stayed in context_docs and counts the dropped', async () => {
    projectContext.forBrief.mockResolvedValue({
      documents: [
        { path: 'docs/a.md', content: 'a'.repeat(12_000) },
        { path: 'docs/b.md', content: 'b'.repeat(40_000) },
      ],
      skipped: [],
    });
    await make().generate(WS, PR, 'sha');
    expect(repo.upsert.mock.calls[0]![1].context_docs).toEqual(['docs/a.md']);
    expect(log.info.mock.calls[0]![0]).toMatchObject({ contextDocs: 1, contextDocsDropped: 1 });
  });

  it('NFR-6: forBrief rejecting still generates, context_docs [], warn without document text', async () => {
    projectContext.forBrief.mockRejectedValue(new Error('db down'));
    await make().generate(WS, PR, 'sha');
    expect(repo.upsert.mock.calls[0]![1].context_docs).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ prId: PR }), expect.any(String));
  });

  it('NFR-4: the log record has counts, skipped paths and reasons, never text', async () => {
    projectContext.forBrief.mockResolvedValue({
      documents: [{ path: 'docs/a.md', content: DOC_TEXT }],
      skipped: [
        { path: 'docs/m.md', reason: 'missing' },
        { path: 'docs/t\n.md', reason: 'too_large' },
      ],
    });
    await make().generate(WS, PR, 'sha');
    const rec = log.info.mock.calls[0]![0];
    expect(rec).toMatchObject({ contextDocs: 1 });
    expect(rec.contextDocsSkipped).toEqual([
      { path: 'docs/m.md', reason: 'missing' },
      { path: 'docs/t\\u{a}.md', reason: 'too_large' },
    ]);
    expect(JSON.stringify([log.info.mock.calls, log.warn.mock.calls])).not.toContain('SECRET-DOC-TEXT');
  });

  it('forBrief is called with the pull repo id and budget x 12 characters', async () => {
    await make().generate(WS, PR, 'sha');
    expect(projectContext.forBrief).toHaveBeenCalledWith(WS, 'r1', 8_000 * 12);
  });

  it('SPEC-01 AC-35: a risk naming an attached document path is stored without that reference', async () => {
    projectContext.forBrief.mockResolvedValue(two);
    const svc = make({
      structured: {
        summary: 's',
        risks: [
          { kind: 'k', title: 't', explanation: 'e', severity: 'high', file_refs: ['docs/a.md', 'src/a.ts'] },
          { kind: 'k', title: 't2', explanation: 'e', severity: 'low', file_refs: ['docs/a.md'] },
        ],
        review_focus: [{ file: 'docs/a.md', line: 1, reason: 'r' }],
      },
    });
    const { brief } = await svc.generate(WS, PR, 'sha');
    expect(brief!.risks).toHaveLength(1);
    expect(brief!.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(brief!.review_focus).toEqual([]);
  });
});
