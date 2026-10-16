import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../../test/helpers/pg.js';
import { waitForPrRuns } from '../../../../test/helpers/runs.js';
import { buildApp } from '../../../app.js';
import { loadConfig } from '../../../platform/config.js';
import { seed } from '../../../db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../../../adapters/mocks.js';
import * as t from '../../../db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

type Db = PgFixture['handle']['db'];
let seq = 0;
async function setupPr(db: Db, workspaceId: string) {
  const name = `multi-api-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1 + seq,
      title: 'Add rate limiting',
      author: 'marisa',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return pr!;
}

d('multi-agent review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let db: Db;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function newAgent(name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id;
  }
  const launch = (prId: string, body: unknown) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: body as object });
  const counts = async () => {
    const [m] = await db.select({ n: sql<number>`count(*)::int` }).from(t.multiAgentRuns);
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(t.agentRuns);
    return { multi: m!.n, runs: r!.n };
  };

  it('POST {agentIds:[a,b,c]} → 200 with multi_run_id and 3 runs; 3 agent_runs rows carry that multi_agent_run_id (AC-1)', async () => {
    const pr = await setupPr(db, workspaceId);
    const ids = [await newAgent('M1a'), await newAgent('M1b'), await newAgent('M1c')];
    const res = await launch(pr.id, { agentIds: ids });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.multi_run_id).toBe('string');
    expect(body.runs.map((r: { agent_id: string }) => r.agent_id)).toEqual(ids);
    await waitForPrRuns(db, pr.id, { expected: 3 });
    const rows = await db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, body.multi_run_id));
    expect(rows).toHaveLength(3);
  });

  it('POST with 1 id, 6 ids or a duplicate → 422, counts unchanged (AC-2)', async () => {
    const pr = await setupPr(db, workspaceId);
    const ids = [] as string[];
    for (let i = 0; i < 6; i++) ids.push(await newAgent(`M2-${i}`));
    const before = await counts();
    for (const agentIds of [[ids[0]], ids, [ids[0], ids[0]]]) {
      const res = await launch(pr.id, { agentIds });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
    }
    expect(await counts()).toEqual(before);
  });

  it('POST naming a disabled agent or an agent of a second workspace → 422, nothing created (AC-2)', async () => {
    const pr = await setupPr(db, workspaceId);
    const ok = await newAgent('M3-ok');
    const disabled = await newAgent('M3-off');
    await db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, disabled));
    const [ws2] = await db.insert(t.workspaces).values({ name: 'Other', slug: `other-${seq}` } as never).returning();
    const [foreign] = await db
      .insert(t.agents)
      .values({ workspaceId: ws2!.id, name: 'Foreign', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    const before = await counts();
    for (const bad of [disabled, foreign!.id]) {
      const res = await launch(pr.id, { agentIds: [ok, bad] });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toBe('Invalid agent list');
    }
    expect(await counts()).toEqual(before);
  });

  it('POST {agentId} and POST {all:true} → the same keys as before, no multi_run_id, no multi run, link null (AC-3)', async () => {
    const pr = await setupPr(db, workspaceId);
    const agentId = await newAgent('M4');
    const beforeMulti = (await counts()).multi;
    const one = await launch(pr.id, { agentId });
    expect(one.statusCode).toBe(200);
    expect(Object.keys(one.json()).sort()).toEqual(['pr_id', 'reviews', 'runs']);
    const all = await launch(pr.id, { all: true });
    expect(all.statusCode).toBe(200);
    expect(Object.keys(all.json()).sort()).toEqual(['pr_id', 'reviews', 'runs']);
    await waitForPrRuns(db, pr.id);
    expect((await counts()).multi).toBe(beforeMulti);
    const rows = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.multiAgentRunId === null)).toBe(true);
  });

  it('GET /multi-runs/:id after the runs settle → pr, status done, wall_clock_ms, totals, 2 agents, groups with cells (AC-7)', async () => {
    const pr = await setupPr(db, workspaceId);
    const ids = [await newAgent('M5a'), await newAgent('M5b')];
    const { multi_run_id } = (await launch(pr.id, { agentIds: ids })).json();
    await waitForPrRuns(db, pr.id, { expected: 2 });
    const res = await app.inject({ method: 'GET', url: `/multi-runs/${multi_run_id}` });
    expect(res.statusCode).toBe(200);
    const detail = res.json();
    expect(detail.pr).toMatchObject({ id: pr.id, title: 'Add rate limiting' });
    expect(detail.status).toBe('done');
    expect(typeof detail.wall_clock_ms).toBe('number');
    expect(detail.tokens_in).toBeGreaterThan(0);
    expect(detail.agents).toHaveLength(2);
    expect(detail.agents.map((a: { agent_id: string }) => a.agent_id)).toEqual(ids);
    expect(detail.groups).toHaveLength(1);
    expect(detail.groups[0].members).toHaveLength(2);
    expect(detail.groups[0].cells).toHaveLength(2);
    expect(detail.groups[0].conflict).toBe(false);
  });

  it('GET /multi-runs/:id of another workspace → 404 (EC-13)', async () => {
    const [ws2] = await db.insert(t.workspaces).values({ name: 'Other2', slug: `other2-${seq}` } as never).returning();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'x', name: 'y', fullName: `x/y-${seq}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws2!.id,
        repoId: repo!.id,
        number: 1,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 's',
      })
      .returning();
    const [m] = await db
      .insert(t.multiAgentRuns)
      .values({ workspaceId: ws2!.id, prId: pr!.id })
      .returning();
    const res = await app.inject({ method: 'GET', url: `/multi-runs/${m!.id}` });
    expect(res.statusCode).toBe(404);
  });

  it('GET /multi-runs after 21 launches → 20 items, newest first; ?pr_id narrows to that PR (AC-12)', async () => {
    await db.delete(t.multiAgentRuns);
    const pr = await setupPr(db, workspaceId);
    const other = await setupPr(db, workspaceId);
    const ids = [await newAgent('M7a'), await newAgent('M7b')];
    const launched: string[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await launch(pr.id, { agentIds: ids });
      expect(res.statusCode).toBe(200);
      launched.push(res.json().multi_run_id);
      await new Promise((r) => setTimeout(r, 3));
    }
    await launch(other.id, { agentIds: ids });
    await waitForPrRuns(db, pr.id, { expected: 42, timeoutMs: 30_000 });
    await waitForPrRuns(db, other.id, { expected: 2 });

    const all = (await app.inject({ method: 'GET', url: '/multi-runs' })).json();
    expect(all).toHaveLength(20);
    const times = all.map((i: { started_at: string }) => Date.parse(i.started_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const narrowed = (await app.inject({ method: 'GET', url: `/multi-runs?pr_id=${pr.id}` })).json();
    expect(narrowed).toHaveLength(20);
    expect(narrowed.every((i: { pr: { id: string } }) => i.pr.id === pr.id)).toBe(true);
    expect(narrowed[0].id).toBe(launched[20]);
    const justOther = (await app.inject({ method: 'GET', url: `/multi-runs?pr_id=${other.id}` })).json();
    expect(justOther).toHaveLength(1);
    expect(justOther[0]).toMatchObject({ status: 'done' });
    expect(justOther[0].agents).toHaveLength(2);
  }, 60_000);

  it('GET /multi-runs/estimates → one entry per enabled agent, numbers after a finished run, null before (AC-6)', async () => {
    const pr = await setupPr(db, workspaceId);
    const fresh = await newAgent('M8-fresh');
    const other = await newAgent('M8-other');
    const find = async (id: string) => {
      const res = await app.inject({ method: 'GET', url: '/multi-runs/estimates' });
      expect(res.statusCode).toBe(200);
      return res.json().agents.find((a: { agent_id: string }) => a.agent_id === id);
    };
    expect(await find(fresh)).toMatchObject({ duration_ms: null, cost_usd: null, runs: 0 });

    const res = await app.inject({ method: 'GET', url: '/multi-runs/estimates' });
    const enabledRows = await db.select().from(t.agents).where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    expect(res.json().agents).toHaveLength(enabledRows.length);

    await launch(pr.id, { agentIds: [fresh, other] });
    await waitForPrRuns(db, pr.id, { expected: 2 });
    const after = await find(fresh);
    expect(after.runs).toBe(1);
    expect(typeof after.duration_ms).toBe('number');
    expect(typeof after.cost_usd).toBe('number');
  });

  it('deleting a multi run keeps its agent runs and clears their link (NFR-5, EC-14)', async () => {
    const pr = await setupPr(db, workspaceId);
    const ids = [await newAgent('M9a'), await newAgent('M9b')];
    const { multi_run_id } = (await launch(pr.id, { agentIds: ids })).json();
    await waitForPrRuns(db, pr.id, { expected: 2 });
    await db.delete(t.multiAgentRuns).where(eq(t.multiAgentRuns.id, multi_run_id));
    const rows = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.multiAgentRunId === null)).toBe(true);
  });
});
