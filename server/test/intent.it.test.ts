/**
 * Intent layer (server) — routes, persistence, pre-review step, provider-error
 * mapping. Spec: server/specs/intent-layer.md. Every app overrides
 * `llm.openrouter` (the review_intent default provider) and `github` with mocks:
 * no real model or GitHub call is ever made.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { resolveFeatureModel } from '../src/modules/settings/feature-models.js';
import { PrIntentResponse, type PrIntentDetail, type StructuredRequest, type StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const INTENT_FIXTURE = {
  intent: 'Add rate limiting to the public API.',
  in_scope: ['src/middleware'],
  out_of_scope: ['unrelated refactors'],
  confidence: 'high' as const,
};
const REVIEW_FIXTURE = { verdict: 'comment', summary: 'ok', score: 90, findings: [] };

/** An LLM whose structured call fails with a given error; records calls like the mock. */
class FailingLlm extends MockLLMProvider {
  constructor(private err: unknown) {
    super('openai');
  }
  override async completeStructured<T>(): Promise<never> {
    this.calls.push({ method: 'completeStructured', req: null });
    throw this.err;
  }
}

const structuredCalls = (l: MockLLMProvider) => l.calls.filter((c) => c.method === 'completeStructured');
const promptText = (l: MockLLMProvider, i = 0) =>
  JSON.stringify((structuredCalls(l)[i]!.req as { messages: unknown }).messages);

/** An LLM that answers after a delay, so a second trigger arrives while the first is in flight. */
class SlowLlm extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await new Promise((r) => setTimeout(r, 250));
    return super.completeStructured(req);
  }
}

const TWO_FILE_DIFF =
  'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n x\n+y\n' +
  'diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1,1 +1,2 @@\n x\n+z\n';

const critical = (title: string) => ({
  verdict: 'request_changes',
  summary: 's',
  score: 10,
  findings: [
    {
      id: 'f1', severity: 'CRITICAL', category: 'security', title,
      file: 'src/config.ts', start_line: 11, end_line: 11,
      rationale: 'r', confidence: 0.9, kind: 'finding',
    },
  ],
});

function capture() {
  const lines: { level: string; obj: Record<string, unknown>; msg?: string }[] = [];
  const mk = (level: string) => (obj: unknown, msg?: string) =>
    void lines.push({ level, obj: (obj ?? {}) as Record<string, unknown>, msg });
  return { lines, logger: { info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('debug') } };
}

d('Intent layer (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setupPr(opts: { body?: string | null; headSha?: string; patch?: string } = {}) {
    const name = `intent-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add rate limiting',
        author: 'marisa',
        branch: 'feat/rl',
        base: 'main',
        headSha: opts.headSha ?? 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: opts.body === undefined ? 'Adds a limiter to the API.' : opts.body,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: opts.patch ?? '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }

  function appWith(
    o: {
      intentLlm?: MockLLMProvider | null;
      reviewLlm?: MockLLMProvider;
      git?: MockGitClient;
      github?: MockGitHubClient;
      cfg?: ReturnType<typeof config>;
    } = {},
  ) {
    const intentLlm =
      o.intentLlm === undefined
        ? new MockLLMProvider('openai', { structuredBySchema: { PrIntent: INTENT_FIXTURE }, costUsd: 0.5 })
        : o.intentLlm;
    const reviewLlm =
      o.reviewLlm ?? new MockLLMProvider('openai', { structuredBySchema: { Review: REVIEW_FIXTURE }, costUsd: 0.001 });
    return buildApp({
      config: o.cfg ?? config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: o.git ?? new MockGitClient(),
        github: o.github ?? new MockGitHubClient(),
        llm: { openai: reviewLlm, ...(intentLlm ? { openrouter: intentLlm } : {}) },
      },
    }).then((app) => ({ app, intentLlm, reviewLlm }));
  }

  const getIntent = (app: Awaited<ReturnType<typeof appWith>>['app'], id: string) =>
    app.inject({ method: 'GET', url: `/pulls/${id}/intent` });
  const recalc = (app: Awaited<ReturnType<typeof appWith>>['app'], id: string) =>
    app.inject({ method: 'POST', url: `/pulls/${id}/intent/recalculate` });

  async function newAgent(app: Awaited<ReturnType<typeof appWith>>['app'], name: string, strategy?: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review', ...(strategy ? { strategy } : {}) },
    });
    return res.json() as { id: string };
  }

  // ---------------------------------------------------------------- S-AC-2
  it('S-AC-2: pr_intent gained only nullable or defaulted columns', async () => {
    const rows = (await pg.handle.db.execute(sql`
      select column_name, is_nullable, column_default from information_schema.columns
      where table_name = 'pr_intent'`)) as unknown as { column_name: string; is_nullable: string; column_default: string | null }[];
    const byName = new Map(rows.map((r) => [r.column_name, r]));
    for (const c of ['confidence', 'sources', 'provider', 'model', 'head_sha', 'tokens_in', 'tokens_out', 'cost_usd', 'generated_at']) {
      const col = byName.get(c);
      expect(col, c).toBeDefined();
      expect(col!.is_nullable === 'YES' || col!.column_default !== null, c).toBe(true);
    }
  });

  it('S-AC-2: a row written by the old upsertIntent still reads back', async () => {
    const pr = await setupPr();
    const repo = new ReviewRepository(pg.handle.db);
    await repo.upsertIntent(pr.id, { intent: 'old style', in_scope: ['a'], out_of_scope: ['b'] });
    expect(await repo.getIntent(pr.id)).toEqual({ intent: 'old style', in_scope: ['a'], out_of_scope: ['b'] });
    const rec = await repo.getIntentRecord(pr.id);
    expect(rec?.intent).toEqual({ intent: 'old style', in_scope: ['a'], out_of_scope: ['b'] });
    expect(rec?.confidence).toBe('low');
    expect(rec?.sources).toEqual([]);

    const { app } = await appWith();
    const res = await getIntent(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(PrIntentResponse.parse(res.json()).intent?.intent).toBe('old style');
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-3
  it('S-AC-3: review_intent defaults to openrouter/deepseek flash; a PUT /settings override is honoured', async () => {
    const { app } = await appWith();
    expect(await resolveFeatureModel(app.container, workspaceId, 'review_intent')).toEqual({
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { review_intent: { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' } } },
    });
    expect(put.statusCode).toBe(200);
    expect(await resolveFeatureModel(app.container, workspaceId, 'review_intent')).toEqual({
      provider: 'openrouter',
      model: 'z-ai/glm-4.7-flash',
    });
    // restore so later tests see the default
    await pg.handle.db.delete(t.settings).where(eq(t.settings.workspaceId, workspaceId));
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-4
  it('S-AC-4: GET → { intent: null } with no row, the stored intent after one, never a model call', async () => {
    const { app, intentLlm, reviewLlm } = await appWith();
    const pr = await setupPr();

    const empty = await getIntent(app, pr.id);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ intent: null });

    const repo = new ReviewRepository(pg.handle.db);
    await repo.saveIntentRecord(pr.id, {
      intent: { intent: 'stored', in_scope: ['x'], out_of_scope: [] },
      confidence: 'medium',
      sources: [{ kind: 'pr_title', ref: 'title', status: 'used' }],
      provider: 'openrouter',
      model: 'm',
      headSha: pr.headSha,
      tokensIn: 1,
      tokensOut: 2,
      costUsd: 0.01,
      generatedAt: new Date(),
    });
    const res = await getIntent(app, pr.id);
    expect(res.statusCode).toBe(200);
    const body = PrIntentResponse.parse(res.json());
    expect(body.intent).toMatchObject({ pr_id: pr.id, intent: 'stored', confidence: 'medium', model: 'm', stale: false });

    expect(intentLlm!.calls).toEqual([]);
    expect(reviewLlm.calls).toEqual([]);
    await app.close();
  });

  it('S-AC-4: 404 for an unknown PR, 422 for a non-uuid', async () => {
    const { app } = await appWith();
    expect((await getIntent(app, randomUUID())).statusCode).toBe(404);
    expect((await getIntent(app, 'not-a-uuid')).statusCode).toBe(422);
    await app.close();
  });

  it('S-AC-4: a PR outside the workspace is 404', async () => {
    const { app } = await appWith();
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'x', name: `y${seq++}`, fullName: `x/y${seq}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws2!.id, repoId: repo!.id, number: 1, title: 't', author: 'a', branch: 'b', base: 'main',
        headSha: 'zzz', additions: 0, deletions: 0, filesCount: 0, status: 'open',
      })
      .returning();
    expect((await getIntent(app, pr!.id)).statusCode).toBe(404);
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-7
  it('S-AC-7: no description and nothing resolved → stored confidence low whatever the model said; pr_description missing', async () => {
    const { app, intentLlm } = await appWith(); // model answers "high"
    for (const body of ['', null]) {
      const pr = await setupPr({ body });
      const res = await recalc(app, pr.id);
      expect(res.statusCode).toBe(200);
      const detail = PrIntentResponse.parse(res.json()).intent!;
      expect(detail.confidence).toBe('low');
      const desc = detail.sources.find((s) => s.kind === 'pr_description')!;
      expect(desc.status).toBe('missing');

      const rec = await new ReviewRepository(pg.handle.db).getIntentRecord(pr.id);
      expect(rec?.confidence).toBe('low');
      expect(rec?.sources.find((s) => s.kind === 'pr_description')?.status).toBe('missing');
    }
    expect(structuredCalls(intentLlm!)).toHaveLength(2);
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-8 / 9 / 10 through the route
  it('S-AC-8: a referenced .md from the head is used and in the prompt; a missing one is recorded, absent from the prompt, and the call still happens', async () => {
    const git = new MockGitClient({ files: { 'docs/plan.md': 'PLAN-BODY-MARKER' } });
    const { app, intentLlm } = await appWith({ git });
    const pr = await setupPr({ body: 'Implements `docs/plan.md` and `docs/gone.md`.' });
    const res = await recalc(app, pr.id);
    expect(res.statusCode).toBe(200);
    const detail = PrIntentResponse.parse(res.json()).intent!;
    expect(detail.sources).toContainEqual({ kind: 'spec_file', ref: 'docs/plan.md', status: 'used' });
    const gone = detail.sources.find((s) => s.ref === 'docs/gone.md')!;
    expect(gone.status).toBe('missing');
    expect(gone.reason).toBeTruthy();
    expect(structuredCalls(intentLlm!)).toHaveLength(1);
    expect(promptText(intentLlm!)).toContain('PLAN-BODY-MARKER');
    await app.close();
  });

  it('S-AC-9 / S-AC-10: foreign URLs, traversal and a bare #N never produce a read or a linked issue', async () => {
    const github = new MockGitHubClient();
    const issueCalls: number[] = [];
    github.getIssue = async (_r, n) => {
      issueCalls.push(n);
      return { number: n, title: `Issue ${n}`, body: 'b', state: 'open' };
    };
    const git = new MockGitClient({ files: { 'etc/passwd.md': 'LEAK' } });
    const { app, intentLlm } = await appWith({ git, github });
    const pr = await setupPr({
      body: 'See #99, [x](../../etc/passwd.md), [y](/etc/passwd.md), https://github.com/evil/o/issues/5. Closes #12.',
    });
    const res = await recalc(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(issueCalls).toEqual([12]);
    expect(promptText(intentLlm!)).not.toContain('LEAK');
    await app.close();
  });

  it('S-AC-10: a #N that is a pull request is recorded skipped / is_pull_request', async () => {
    const github = new MockGitHubClient();
    github.getIssue = async (_r, n) => ({ number: n, title: 'a PR', body: 'PR-BODY-MARKER', state: 'open', is_pull_request: true });
    const { app, intentLlm } = await appWith({ github });
    const pr = await setupPr({ body: 'Fixes #31' });
    const detail = PrIntentResponse.parse((await recalc(app, pr.id)).json()).intent!;
    expect(detail.sources).toContainEqual({ kind: 'linked_issue', ref: '#31', status: 'skipped', reason: 'is_pull_request' });
    expect(promptText(intentLlm!)).not.toContain('PR-BODY-MARKER');
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-25
  it('S-AC-25: over-budget spec files are cut first; each cut source carries reason "truncated"', async () => {
    const big = (m: string) => `${m} ` + 'lorem ipsum dolor sit amet '.repeat(700); // ~19k chars, under the file cap
    const git = new MockGitClient({ files: { 'a.md': big('A'), 'b.md': big('B'), 'c.md': big('C') } });
    const { app, intentLlm } = await appWith({ git });
    const pr = await setupPr({ body: 'Specs: `a.md` `b.md` `c.md`' });
    const detail = PrIntentResponse.parse((await recalc(app, pr.id)).json()).intent!;
    const cut = detail.sources.filter((s) => s.kind === 'spec_file' && s.reason === 'truncated');
    expect(cut.length).toBeGreaterThan(0);
    // spec texts go before anything else: title / description / outline sources are untouched
    expect(detail.sources.filter((s) => s.kind !== 'spec_file').every((s) => s.reason !== 'truncated')).toBe(true);
    const sent = promptText(intentLlm!);
    expect(sent.length).toBeLessThan(3 * 19_000); // the three files together never went out whole
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-5 (supporting) + S-AC-18
  it('S-AC-18: the classifier tokens and cost are on the pr_intent row and in its llm_call line', async () => {
    const { app } = await appWith(); // intent mock: 100 in / 50 out / $0.5
    const pr = await setupPr();
    const svc = new ReviewService(app.container);
    const { lines, logger } = capture();
    const detail = await svc.recalculateIntent(workspaceId, pr.id, logger);
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toMatchObject({ tokensIn: 100, tokensOut: 50, costUsd: 0.5, provider: 'openrouter', headSha: pr.headSha });
    expect(detail.confidence).toBe('high');
    const call = lines.find((l) => l.obj.event === 'llm_call')!;
    expect(call.obj).toMatchObject({ call: 'intent_classifier', tokensIn: 100, tokensOut: 50, costUsd: 0.5, prId: pr.id });
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-19
  it.each([
    ['402', { status: 402 }, 402, 'llm_payment_required'],
    ['404', { status: 404 }, 502, 'llm_model_not_found'],
    ['other', new Error('boom'), 502, undefined],
    ['500', { status: 500, message: 'upstream' }, 502, undefined],
  ])('S-AC-19: provider %s → HTTP %i', async (_n, err, status, code) => {
    const failing = new FailingLlm(Object.assign(new Error('provider failed'), err));
    const { app } = await appWith({ intentLlm: failing });
    const pr = await setupPr();
    const res = await recalc(app, pr.id);
    expect(res.statusCode).toBe(status);
    if (code) expect(res.json().error.code).toBe(code);
    expect(res.statusCode).not.toBe(404); // 404 only ever means "PR not found"
    expect(structuredCalls(failing)).toHaveLength(1);
    await app.close();
  });

  it('S-AC-19: a missing provider key → ConfigError (config_error), no model call', async () => {
    const { app } = await appWith({ intentLlm: null });
    const pr = await setupPr();
    const res = await recalc(app, pr.id);
    expect(res.json().error.code).toBe('config_error');
    await app.close();
  });

  it('S-AC-5: a failed recalculate leaves the stored row untouched', async () => {
    const pr = await setupPr();
    const ok = await appWith();
    expect((await recalc(ok.app, pr.id)).statusCode).toBe(200);
    const before = await new ReviewRepository(pg.handle.db).getIntentRecord(pr.id);
    await ok.app.close();

    const bad = await appWith({ intentLlm: new FailingLlm(Object.assign(new Error('x'), { status: 402 })) });
    expect((await recalc(bad.app, pr.id)).statusCode).toBe(402);
    expect(await new ReviewRepository(pg.handle.db).getIntentRecord(pr.id)).toEqual(before);
    await bad.app.close();
  });

  // ---------------------------------------------------------------- S-AC-20
  it('S-AC-20: stale is true when the stored head_sha differs from the PR head, false otherwise or when null', async () => {
    const { app } = await appWith();
    const repo = new ReviewRepository(pg.handle.db);
    const rec = (headSha: string | null) => ({
      intent: { intent: 'i', in_scope: [], out_of_scope: [] },
      confidence: 'low' as const,
      sources: [],
      provider: null, model: null, headSha,
      tokensIn: null, tokensOut: null, costUsd: null, generatedAt: null,
    });
    const check = async (stored: string | null) => {
      const pr = await setupPr({ headSha: 'current-sha' });
      await repo.saveIntentRecord(pr.id, rec(stored));
      return (PrIntentResponse.parse((await getIntent(app, pr.id)).json()).intent as PrIntentDetail).stale;
    };
    expect(await check('older-sha')).toBe(true);
    expect(await check('current-sha')).toBe(false);
    expect(await check(null)).toBe(false);
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-11 / 12 / 13 / 18 (review)
  describe('before a review', () => {
    it('S-AC-11: no stored intent → one classifier call shared by all queued agents', async () => {
      const { app, intentLlm, reviewLlm } = await appWith();
      const pr = await setupPr();
      const a1 = await newAgent(app, `A1-${seq++}`);
      const a2 = await newAgent(app, `A2-${seq++}`);
      const svc = new ReviewService(app.container);
      const targets = [
        ...(await svc.resolveTargets(workspaceId, { agentId: a1.id })),
        ...(await svc.resolveTargets(workspaceId, { agentId: a2.id })),
      ];
      await svc.runReview(workspaceId, pr.id, targets);
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
      expect(structuredCalls(intentLlm!)).toHaveLength(1);
      expect(structuredCalls(reviewLlm).length).toBeGreaterThanOrEqual(2);
      expect((await getIntent(app, pr.id)).json().intent).not.toBeNull();
      await app.close();
    });

    it('S-AC-11: with a stored intent, zero classifier calls', async () => {
      const { app, intentLlm } = await appWith();
      const pr = await setupPr();
      await new ReviewRepository(pg.handle.db).saveIntentRecord(pr.id, {
        intent: { intent: 'stored', in_scope: [], out_of_scope: [] },
        confidence: 'high', sources: [], provider: 'openrouter', model: 'm', headSha: pr.headSha,
        tokensIn: 1, tokensOut: 1, costUsd: 0, generatedAt: new Date(),
      });
      const agent = await newAgent(app, `A-${seq++}`);
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
      expect(res.statusCode).toBe(200);
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      expect(intentLlm!.calls).toEqual([]);
      await app.close();
    });

    it('S-AC-11: two concurrent triggers for the same PR share one in-flight classifier call', async () => {
      const { app, intentLlm } = await appWith();
      const pr = await setupPr();
      const a1 = await newAgent(app, `C1-${seq++}`);
      const a2 = await newAgent(app, `C2-${seq++}`);
      const [r1, r2] = await Promise.all([
        app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: a1.id } }),
        app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: a2.id } }),
      ]);
      expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
      expect(structuredCalls(intentLlm!)).toHaveLength(1);
      await app.close();
    });

    it('S-AC-12 / S-AC-18: a "Deriving PR intent" step per run; two llm_call lines with one correlationId; agent_runs total = review calls only', async () => {
      const { app, reviewLlm } = await appWith(); // intent costs $0.5, review $0.001/call
      const pr = await setupPr();
      const agent = await newAgent(app, `L-${seq++}`);
      const svc = new ReviewService(app.container);
      const { lines, logger } = capture();
      const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
      const { runs } = await svc.runReview(workspaceId, pr.id, targets, logger);
      const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

      const trace = await svc.getRunTrace(runs[0]!.run_id);
      const stepLines = trace!.log.filter((l) => /Deriving PR intent \(openrouter\/deepseek\/deepseek-v4-flash\)/.test(l.msg));
      expect(stepLines.length).toBeGreaterThan(0);

      const calls = lines.filter((l) => l.obj.event === 'llm_call').map((l) => l.obj);
      const classifier = calls.filter((c) => c.call === 'intent_classifier');
      const review = calls.filter((c) => c.call === 'review');
      expect(classifier).toHaveLength(1);
      expect(review.length).toBeGreaterThanOrEqual(1);
      expect(new Set(calls.map((c) => c.correlationId)).size).toBe(1);
      expect(classifier[0]!.costUsd).toBe(0.5);

      // agent_runs cost / tokens cover the review call(s) only
      const reviewCalls = structuredCalls(reviewLlm).length;
      expect(run!.costUsd).toBeCloseTo(0.001 * reviewCalls, 6);
      expect(run!.tokensIn).toBe(100 * reviewCalls);
      await app.close();
    });

    it.each([
      ['402', () => new FailingLlm(Object.assign(new Error('pay'), { status: 402 }))],
      ['404', () => new FailingLlm(Object.assign(new Error('nf'), { status: 404 }))],
      ['schema failure', () => new MockLLMProvider('openai', { structuredBySchema: { PrIntent: { nope: true } } })],
    ])('S-AC-13: classifier %s → error logged, review runs without an intent section and ends done', async (_n, mk) => {
      const { app, reviewLlm } = await appWith({ intentLlm: mk() });
      const pr = await setupPr();
      const agent = await newAgent(app, `F-${seq++}`);
      const svc = new ReviewService(app.container);
      const { lines, logger } = capture();
      const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
      await svc.runReview(workspaceId, pr.id, targets, logger);
      const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      expect(runs[0]!.status).toBe('done');
      expect(lines.some((l) => l.level === 'error')).toBe(true);
      expect(structuredCalls(reviewLlm).length).toBeGreaterThanOrEqual(1);
      expect(promptText(reviewLlm)).not.toContain('PR intent and scope');
      await app.close();
    });

    it('S-AC-13: missing key (no openrouter provider) → error logged, review done without an intent section', async () => {
      const { app, reviewLlm } = await appWith({ intentLlm: null });
      const pr = await setupPr();
      const agent = await newAgent(app, `K-${seq++}`);
      const svc = new ReviewService(app.container);
      const { lines, logger } = capture();
      const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
      await svc.runReview(workspaceId, pr.id, targets, logger);
      const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      expect(runs[0]!.status).toBe('done');
      expect(lines.some((l) => l.level === 'error')).toBe(true);
      expect(promptText(reviewLlm)).not.toContain('PR intent and scope');
      await app.close();
    });
  });

  // ================================================================ added: missing-test coverage
  const logsJson = (ls: { obj: unknown; msg?: string }[]) => JSON.stringify(ls);

  // ---------------------------------------------------------------- S-AC-9 (route)
  it('S-AC-9: a refused file reference is recorded skipped with its reason in the stored sources and never read', async () => {
    const git = new MockGitClient({ files: { 'etc/passwd.md': 'LEAK', 'notes.txt': 'LEAK' } });
    const { app, intentLlm } = await appWith({ git });
    const pr = await setupPr({ body: 'See [a](/etc/passwd.md) [b](../../etc/passwd.md) [c](notes.txt) [d](https://evil.example/x.md).' });
    const detail = PrIntentResponse.parse((await recalc(app, pr.id)).json()).intent!;
    expect(detail.sources).toContainEqual({ kind: 'spec_file', ref: '/etc/passwd.md', status: 'skipped', reason: 'absolute_path' });
    expect(detail.sources).toContainEqual({ kind: 'spec_file', ref: '../../etc/passwd.md', status: 'skipped', reason: 'path_traversal' });
    expect(detail.sources).toContainEqual({ kind: 'spec_file', ref: 'notes.txt', status: 'skipped', reason: 'not_markdown' });
    expect(detail.sources.some((s) => s.ref.includes('evil.example'))).toBe(false);
    expect(promptText(intentLlm!)).not.toContain('LEAK');
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-12
  it('S-AC-12: in a map-reduce review of N files there are N review llm_call lines and one intent_classifier line, one correlationId', async () => {
    const git = new MockGitClient({ diff: TWO_FILE_DIFF });
    const { app, reviewLlm } = await appWith({ git });
    const pr = await setupPr();
    const agent = await newAgent(app, `MR-${seq++}`, 'map-reduce');
    const svc = new ReviewService(app.container);
    const { lines, logger } = capture();
    const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
    const { runs } = await svc.runReview(workspaceId, pr.id, targets, logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const calls = lines.filter((l) => l.obj.event === 'llm_call').map((l) => l.obj);
    expect(calls.filter((c) => c.call === 'intent_classifier')).toHaveLength(1);
    expect(calls.filter((c) => c.call === 'review')).toHaveLength(2);
    expect(structuredCalls(reviewLlm)).toHaveLength(2);
    expect(new Set(calls.map((c) => c.correlationId)).size).toBe(1);

    // the intent step is its own log entry, distinct from the review entries
    const trace = await svc.getRunTrace(runs[0]!.run_id);
    const intentEntries = trace!.log.filter((l) => /^Deriving PR intent \(/.test(l.msg));
    const reviewEntries = trace!.log.filter((l) => /Starting review with agent|map: reviewing/.test(l.msg));
    expect(intentEntries.length).toBeGreaterThan(0);
    expect(reviewEntries.length).toBeGreaterThan(0);
    for (const e of intentEntries) expect(reviewEntries).not.toContain(e);
    await app.close();
  });

  it('S-AC-12: a trigger that joins a derivation already in flight logs "PR intent derived by a concurrent request"', async () => {
    const slow = new SlowLlm('openai', { structuredBySchema: { PrIntent: INTENT_FIXTURE } });
    const { app, intentLlm } = await appWith({ intentLlm: slow });
    const pr = await setupPr();
    const a1 = await newAgent(app, `J1-${seq++}`);
    const a2 = await newAgent(app, `J2-${seq++}`);
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: a1.id } }),
      app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: a2.id } }),
    ]);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    const svc = new ReviewService(app.container);
    const ids = [r1, r2].map((r) => (r.json() as { runs: { run_id: string }[] }).runs[0]!.run_id);
    const logs = (await Promise.all(ids.map((id) => svc.getRunTrace(id)))).map((t) => t!.log.map((l) => l.msg));
    const joined = logs.filter((l) => l.some((m) => m.startsWith('PR intent derived by a concurrent request')));
    expect(joined).toHaveLength(1); // exactly the trigger that joined, not the one that derived
    expect(structuredCalls(intentLlm!)).toHaveLength(1);
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-15 (server)
  it.each([
    ['with the marker', 'Out of scope: Hardcoded Stripe secret key'],
    ['without the marker', 'Hardcoded Stripe secret key'],
  ])('S-AC-15: a CRITICAL in a file outside in_scope is persisted unchanged (%s)', async (_l, title) => {
    const reviewLlm = new MockLLMProvider('openai', { structuredBySchema: { Review: critical(title) } });
    const { app } = await appWith({ reviewLlm });
    const pr = await setupPr();
    await new ReviewRepository(pg.handle.db).saveIntentRecord(pr.id, {
      intent: { intent: 'docs only', in_scope: ['README.md'], out_of_scope: ['src/config.ts'] },
      confidence: 'high', sources: [], provider: 'openrouter', model: 'm', headSha: pr.headSha,
      tokensIn: 1, tokensOut: 1, costUsd: 0, generatedAt: new Date(),
    });
    const agent = await newAgent(app, `S15-${seq++}`);
    const svc = new ReviewService(app.container);
    const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
    await svc.runReview(workspaceId, pr.id, targets);
    const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(run!.status).toBe('done');
    const rows = await pg.handle.db
      .select({ severity: t.findings.severity, title: t.findings.title, file: t.findings.file })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(eq(t.reviews.prId, pr.id));
    expect(rows).toEqual([{ severity: 'CRITICAL', title, file: 'src/config.ts' }]);
    expect(promptText(reviewLlm)).toContain('PR intent and scope'); // the intent was in play
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-16
  const DESC = 'DESC-MARKER-77 adds a limiter. Closes #12. Plan: `docs/plan.md`.';
  const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  const DIFF-MARKER-55 = 1;\n   redisUrl: x,';
  const markerGit = () => new MockGitClient({ files: { 'docs/plan.md': 'SPEC-MARKER-88' } });
  const markerGithub = () => {
    const gh = new MockGitHubClient();
    gh.getIssue = async (_r, n) => ({ number: n, title: 'ISSUE-MARKER-99', body: 'ISSUE-MARKER-99 body', state: 'open' });
    return gh;
  };
  const MARKERS = ['DESC-MARKER-77', 'DIFF-MARKER-55', 'SPEC-MARKER-88', 'ISSUE-MARKER-99'];
  const SECTION_KEYS = ['name', 'source', 'tokens'];

  function expectAssemblyLines(
    lines: { obj: Record<string, unknown> }[],
    call: 'intent_classifier' | 'review',
    prId: string,
    expectedCount: number,
  ) {
    const asm = lines.filter((l) => l.obj.event === 'prompt_assembly' && l.obj.call === call).map((l) => l.obj);
    expect(asm).toHaveLength(expectedCount);
    for (const a of asm) {
      expect(Object.keys(a).sort()).toEqual(
        ['call', 'correlationId', 'event', 'model', 'prId', 'provider', 'sections', 'totalTokens'],
      );
      expect(a.prId).toBe(prId);
      expect(typeof a.correlationId).toBe('string');
      expect(typeof a.provider).toBe('string');
      expect(typeof a.model).toBe('string');
      expect(typeof a.totalTokens).toBe('number');
      const sections = a.sections as Record<string, unknown>[];
      expect(sections.length).toBeGreaterThan(0);
      for (const sec of sections) {
        expect(Object.keys(sec).sort()).toEqual(SECTION_KEYS);
        expect(typeof sec.name).toBe('string');
        expect(typeof sec.source).toBe('string');
        expect(typeof sec.tokens).toBe('number');
      }
      for (const m of MARKERS) expect(JSON.stringify(a)).not.toContain(m);
    }
    return asm;
  }

  it('S-AC-16: a recalculate logs one prompt_assembly line with ids, sections {name, source, tokens} and totalTokens; no prompt text', async () => {
    const { app, intentLlm } = await appWith({ git: markerGit(), github: markerGithub() });
    const pr = await setupPr({ body: DESC, patch: PATCH });
    const svc = new ReviewService(app.container);
    const { lines, logger } = capture();
    await svc.recalculateIntent(workspaceId, pr.id, logger);
    // the markers really were in the model input (so their absence from the log means something)
    for (const m of ['DESC-MARKER-77', 'SPEC-MARKER-88', 'ISSUE-MARKER-99']) expect(promptText(intentLlm!)).toContain(m);
    const [a] = expectAssemblyLines(lines, 'intent_classifier', pr.id, 1);
    expect(a!.provider).toBe('openrouter');
    expect(a!.model).toBe('deepseek/deepseek-v4-flash');
    expect(logsJson(lines)).not.toContain('SPEC-MARKER-88');
    await app.close();
  });

  it('S-AC-16: a review logs one prompt_assembly line per model call (map-reduce: per file), one correlationId; no prompt text', async () => {
    const git = new MockGitClient({ diff: TWO_FILE_DIFF.replace('+y', '+DIFF-MARKER-55'), files: { 'docs/plan.md': 'SPEC-MARKER-88' } });
    const { app, reviewLlm } = await appWith({ git, github: markerGithub() });
    const pr = await setupPr({ body: DESC, patch: PATCH });
    const agent = await newAgent(app, `S16-${seq++}`, 'map-reduce');
    const svc = new ReviewService(app.container);
    const { lines, logger } = capture();
    const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
    await svc.runReview(workspaceId, pr.id, targets, logger);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const calls = structuredCalls(reviewLlm).length;
    expect(calls).toBe(2);
    const rev = expectAssemblyLines(lines, 'review', pr.id, calls);
    const cls = expectAssemblyLines(lines, 'intent_classifier', pr.id, 1);
    expect(new Set([...rev, ...cls].map((a) => a.correlationId)).size).toBe(1);
    expect(rev[0]!.provider).toBe('openai');
    for (const m of MARKERS) {
      expect(JSON.stringify(lines.filter((l) => l.obj.event === 'prompt_assembly'))).not.toContain(m);
    }
    await app.close();
  });

  // ---------------------------------------------------------------- S-AC-17
  describe('S-AC-17 verbose previews through the real call sites', () => {
    const devCfg = () =>
      loadConfig({ ...process.env, NODE_ENV: 'development', PROMPT_LOG_VERBOSE: 'true' } as NodeJS.ProcessEnv);
    const testCfgVerboseEnv = () =>
      loadConfig({ ...process.env, NODE_ENV: 'test', PROMPT_LOG_VERBOSE: 'true' } as NodeJS.ProcessEnv);

    async function runBoth(cfg: ReturnType<typeof config>) {
      const { app } = await appWith({ cfg, git: markerGit(), github: markerGithub() });
      const svc = new ReviewService(app.container);
      const out = capture();
      const pr1 = await setupPr({ body: DESC, patch: PATCH });
      await svc.recalculateIntent(workspaceId, pr1.id, out.logger);
      const pr2 = await setupPr({ body: DESC, patch: PATCH });
      const agent = await newAgent(app, `S17-${seq++}`);
      const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
      await svc.runReview(workspaceId, pr2.id, targets, out.logger);
      await waitForPrRuns(pg.handle.db, pr2.id, { expected: 1 });
      await app.close();
      return out.lines;
    }

    it('S-AC-17: promptLogVerbose false → no prompt_preview line and no preview text, even with PROMPT_LOG_VERBOSE=true in NODE_ENV=test', async () => {
      const cfg = testCfgVerboseEnv();
      expect(cfg.promptLogVerbose).toBe(false);
      const lines = await runBoth(cfg);
      expect(lines.filter((l) => l.obj.event === 'prompt_assembly').length).toBeGreaterThan(0);
      expect(lines.some((l) => l.obj.event === 'prompt_preview')).toBe(false);
      expect(lines.some((l) => l.level === 'debug' && l.obj.event === 'prompt_preview')).toBe(false);
      for (const m of ['DESC-MARKER-77', 'SPEC-MARKER-88', 'ISSUE-MARKER-99']) expect(logsJson(lines)).not.toContain(m);
    });

    it('S-AC-17: promptLogVerbose true (development + PROMPT_LOG_VERBOSE=true) → a debug prompt_preview line per call site', async () => {
      const cfg = devCfg();
      expect(cfg.promptLogVerbose).toBe(true);
      const lines = await runBoth(cfg);
      const previews = lines.filter((l) => l.obj.event === 'prompt_preview');
      expect(previews.length).toBeGreaterThanOrEqual(2);
      for (const p of previews) expect(p.level).toBe('debug');
      expect(new Set(previews.map((p) => p.obj.call))).toEqual(new Set(['intent_classifier', 'review']));
      // the opt-in preview is where prompt text may appear; the info-level lines stay clean
      for (const l of lines.filter((x) => x.level === 'info' && x.obj.event === 'prompt_assembly')) {
        for (const m of MARKERS) expect(JSON.stringify(l.obj)).not.toContain(m);
      }
    });
  });

  // ---------------------------------------------------------------- S-AC-25 (budget)
  it('S-AC-25: after a recalculate with oversized description, issues and specs the classifier input is ≤ 6000 tokens (app tokenizer)', async () => {
    const big = (m: string) => `${m} ` + 'lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(400);
    const git = new MockGitClient({ files: { 'a.md': big('A'), 'b.md': big('B'), 'c.md': big('C') } });
    const github = new MockGitHubClient();
    github.getIssue = async (_r, n) => ({ number: n, title: `Issue ${n}`, body: big(`ISSUE${n}`), state: 'open' });
    const { app, intentLlm } = await appWith({ git, github });
    const body =
      'Closes #1, closes #2, closes #3. Specs: `a.md` `b.md` `c.md`. ' + 'Long description text goes on and on. '.repeat(400);
    const pr = await setupPr({ body });
    expect((await recalc(app, pr.id)).statusCode).toBe(200);
    const req = structuredCalls(intentLlm!)[0]!.req as { messages: { content: string }[] };
    const total = req.messages.reduce((n, m) => n + app.container.tokenizer.count(m.content), 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(6000);
    await app.close();
  });

  // ---------------------------------------------------------------- security carry-over
  describe('provider error text never leaks', () => {
    const SENTINEL = 'SENTINEL-raw-provider-error-ghp_Zx81';
    it.each([
      ['500 with a message', { status: 500 }],
      ['402', { status: 402 }],
      ['404', { status: 404 }],
      ['no status', {}],
    ])('security: recalculate (%s) → neither the response body nor the log carries the provider message', async (_n, extra) => {
      const failing = new FailingLlm(Object.assign(new Error(SENTINEL), extra));
      const { app } = await appWith({ intentLlm: failing });
      const pr = await setupPr();
      const res = await recalc(app, pr.id);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.body).not.toContain(SENTINEL);

      const svc = new ReviewService(app.container);
      const { lines, logger } = capture();
      await svc.recalculateIntent(workspaceId, pr.id, logger).catch((e: Error) => {
        expect(e.message).not.toContain(SENTINEL);
      });
      expect(logsJson(lines)).not.toContain(SENTINEL);
      await app.close();
    });

    it('security: a review whose classifier fails with a sentinel message logs and traces no raw provider text', async () => {
      const failing = new FailingLlm(Object.assign(new Error(SENTINEL), { status: 500 }));
      const { app } = await appWith({ intentLlm: failing });
      const pr = await setupPr();
      const agent = await newAgent(app, `SEC-${seq++}`);
      const svc = new ReviewService(app.container);
      const { lines, logger } = capture();
      const targets = await svc.resolveTargets(workspaceId, { agentId: agent.id });
      const { runs } = await svc.runReview(workspaceId, pr.id, targets, logger);
      const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      expect(run!.status).toBe('done');
      expect(logsJson(lines)).not.toContain(SENTINEL);
      const trace = await svc.getRunTrace(runs[0]!.run_id);
      expect(JSON.stringify(trace!.log)).not.toContain(SENTINEL);
      await app.close();
    });

    it('security: a failed issue fetch is recorded with reason fetch_failed, not the error text', async () => {
      const github = new MockGitHubClient();
      github.getIssue = async () => {
        throw new Error(SENTINEL);
      };
      const { app } = await appWith({ github });
      const pr = await setupPr({ body: 'Closes #5' });
      const res = await recalc(app, pr.id);
      expect(res.statusCode).toBe(200);
      const detail = PrIntentResponse.parse(res.json()).intent!;
      expect(detail.sources).toContainEqual({ kind: 'linked_issue', ref: '#5', status: 'missing', reason: 'fetch_failed' });
      expect(res.body).not.toContain(SENTINEL);
      const rec = await new ReviewRepository(pg.handle.db).getIntentRecord(pr.id);
      expect(JSON.stringify(rec?.sources)).not.toContain(SENTINEL);
      await app.close();
    });
  });
});
