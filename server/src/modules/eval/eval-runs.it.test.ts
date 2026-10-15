import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import {
  EvalAgentOverview,
  EvalCaseCreated,
  EvalCompare,
  EvalDashboard,
  EvalRunRecord,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockGitHubClient, MockLLMProvider } from '../../adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PATCH = '@@ -1,3 +1,4 @@\n a\n+b\n c\n d';

const mkFinding = (file: string) => ({
  id: 'x',
  severity: 'WARNING' as const,
  category: 'bug' as const,
  title: `model finding in ${file}`,
  file,
  start_line: 2,
  end_line: 2,
  rationale: 'r',
  confidence: 0.9,
  kind: 'finding' as const,
});
const review = (findings: ReturnType<typeof mkFinding>[]): Review => ({
  verdict: 'comment',
  summary: 's',
  score: 80,
  findings,
});

/**
 * Answers by system prompt: plain -> no findings; TARGET-A -> a finding in a.ts;
 * FLAG-ALL -> a finding in whatever file the case is about. Records every request.
 */
class StubLLM extends MockLLMProvider {
  requests: StructuredRequest<Review>[] = [];
  gate: Promise<void> | null = null;

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.requests.push(req as unknown as StructuredRequest<Review>);
    if (this.gate) await this.gate;
    const system = req.messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n');
    const user = req.messages.filter((m) => m.role !== 'system').map((m) => String(m.content)).join('\n');
    const fileOfCase = ['a.ts', 'b.ts', 'd.ts'].find((f) => user.includes(`a/${f} b/${f}`))!;
    let out = review([]);
    if (system.includes('FLAG-ALL')) out = review([mkFinding(fileOfCase)]);
    else if (system.includes('TARGET-A') && fileOfCase === 'a.ts') out = review([mkFinding('a.ts')]);
    return {
      data: out as unknown as T,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.01,
      raw: '{}',
      attempts: 1,
    };
  }
}

d('eval runs (Postgres)', () => {
  let pg: PgFixture;
  let wsId: string;
  let llm: StubLLM;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let seq = 100;

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const db = () => pg.handle.db;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    wsId = ws!.id;
    llm = new StubLLM();
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient(), llm: { openai: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, ...(payload ? { payload } : {}) });

  /** A fresh agent (version 1) with cases A (must_find, a.ts), B (must_not_flag, b.ts), D (must_find, d.ts). */
  async function fixture(opts: { enabled?: boolean; prompt?: string } = {}) {
    const n = ++seq;
    const created = await call('POST', '/agents', {
      name: `runs-${n}`,
      provider: 'openai',
      model: 'stub-model',
      system_prompt: opts.prompt ?? 'You review code.',
      enabled: opts.enabled ?? true,
    });
    expect(created.statusCode).toBe(201);
    const agentId = created.json().id as string;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name: `rr${n}`, fullName: `acme/rr${n}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId, repoId: repo!.id, number: n, title: 'Original title', author: 'someone',
        branch: 'f', base: 'main', headSha: 'sha1', body: 'Original body',
      })
      .returning();
    await db().insert(t.prFiles).values(['a.ts', 'b.ts', 'd.ts'].map((path) => ({ prId: pr!.id, path, patch: PATCH })));
    const [rev] = await db()
      .insert(t.reviews)
      .values({ workspaceId: wsId, prId: pr!.id, agentId, kind: 'review' })
      .returning();
    const caseIds: Record<string, string> = {};
    for (const [file, decision] of [['a.ts', 'accepted'], ['b.ts', 'dismissed'], ['d.ts', 'accepted']] as const) {
      const [f] = await db()
        .insert(t.findings)
        .values({
          reviewId: rev!.id, file, startLine: 2, endLine: 2, severity: 'WARNING', category: 'bug',
          title: `case ${file}`, rationale: 'r', confidence: 0.9,
          acceptedAt: decision === 'accepted' ? new Date() : null,
          dismissedAt: decision === 'dismissed' ? new Date() : null,
        })
        .returning();
      const res = await call('POST', `/findings/${f!.id}/eval-case`);
      expect(res.statusCode).toBe(201);
      caseIds[file] = EvalCaseCreated.parse(res.json()).case.id;
    }
    return { agentId, repoId: repo!.id, prId: pr!.id, caseIds };
  }

  const overview = async (agentId: string) =>
    EvalAgentOverview.parse((await call('GET', `/agents/${agentId}/evals`)).json());

  async function waitForRun(agentId: string, runId?: string) {
    for (let i = 0; i < 400; i++) {
      const o = await overview(agentId);
      const run = runId ? o.runs.find((r) => r.id === runId) : o.runs[0];
      if (run && run.status !== 'running') return run;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('run did not finish');
  }

  async function runAndWait(agentId: string) {
    const res = await call('POST', `/agents/${agentId}/evals/runs`);
    expect(res.statusCode).toBe(202);
    return waitForRun(agentId, EvalRunRecord.parse(res.json()).id);
  }

  it('AC-9/AC-34: 202 running, then completed; 3 cases make 3 model calls', async () => {
    const f = await fixture();
    llm.requests = [];
    const res = await call('POST', `/agents/${f.agentId}/evals/runs`);
    expect(res.statusCode).toBe(202);
    const started = EvalRunRecord.parse(res.json());
    expect(started).toMatchObject({ status: 'running', agent_version: 1, model: 'stub-model', total: 3 });
    const done = await waitForRun(f.agentId, started.id);
    expect(done.status).toBe('completed');
    expect(done).toMatchObject({ total: 3, passed: 1 });
    expect(llm.requests).toHaveLength(3);
  });

  it('AC-13/EC-17: two concurrent POSTs -> one 202 and one 409, one running row', async () => {
    const f = await fixture();
    let release!: () => void;
    llm.gate = new Promise<void>((r) => (release = r));
    try {
      const [x, y] = await Promise.all([
        call('POST', `/agents/${f.agentId}/evals/runs`),
        call('POST', `/agents/${f.agentId}/evals/runs`),
      ]);
      expect([x.statusCode, y.statusCode].sort()).toEqual([202, 409]);
      const loser = x.statusCode === 409 ? x : y;
      expect(loser.json().error.code).toBe('eval_run_in_progress');
      const running = await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, f.agentId));
      expect(running.filter((r) => r.status === 'running')).toHaveLength(1);
    } finally {
      llm.gate = null;
      release();
    }
    expect((await waitForRun(f.agentId)).status).toBe('completed');
  });

  it('AC-8: an agent without cases is a 422 eval_set_empty', async () => {
    const created = await call('POST', '/agents', {
      name: `runs-empty-${++seq}`, provider: 'openai', model: 'm', system_prompt: 'p',
    });
    const res = await call('POST', `/agents/${created.json().id}/evals/runs`);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('eval_set_empty');
  });

  it('AC-16/EC-25: a disabled agent starts, completes and is on the dashboard', async () => {
    const f = await fixture({ enabled: false });
    const done = await runAndWait(f.agentId);
    expect(done.status).toBe('completed');
    const dash = EvalDashboard.parse((await call('GET', '/evals/dashboard')).json());
    expect(dash.agents.find((a) => a.agent_id === f.agentId)).toMatchObject({ enabled: false, cases_total: 3 });
  });

  it('AC-15/EC-20: a boot reaps a running row as interrupted and a new run starts', async () => {
    const f = await fixture();
    await db().insert(t.evalRuns).values({
      workspaceId: wsId, agentId: f.agentId, agentVersion: 1, provider: 'openai', model: 'm', status: 'running',
    });
    const second = await buildApp({
      config: config(),
      db: db(),
      overrides: { github: new MockGitHubClient(), llm: { openai: llm } },
    });
    try {
      const rows = await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, f.agentId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'failed', error: 'interrupted' });
      const res = await second.inject({ method: 'POST', url: `/agents/${f.agentId}/evals/runs` });
      expect(res.statusCode).toBe(202);
    } finally {
      await second.close().catch(() => undefined);
    }
    await waitForRun(f.agentId);
  });

  it('AC-12: the same messages after changes to the PR, its patch, its intent and project context', async () => {
    const f = await fixture();
    const record = async () => {
      llm.requests = [];
      await runAndWait(f.agentId);
      return llm.requests.map((r) => JSON.stringify(r.messages));
    };
    const first = await record();
    expect(first).toHaveLength(3);

    await db().update(t.pullRequests).set({ title: 'Changed title', body: 'Changed body' }).where(eq(t.pullRequests.id, f.prId));
    await db().update(t.prFiles).set({ patch: '@@ -1,1 +1,1 @@\n-x\n+y' }).where(eq(t.prFiles.prId, f.prId));
    await db().insert(t.prIntent).values({ prId: f.prId, intent: 'A brand new intent', sources: [] });
    await db().insert(t.agentContextDocs).values({ agentId: f.agentId, repoId: f.repoId, position: 0, path: 'docs/a.md' });

    expect(await record()).toEqual(first);
  });

  it('AC-42 twin: v1 -> v2 improves recall, v2 -> v3 drops precision (B passed -> failed)', async () => {
    const f = await fixture({ prompt: 'You review code.' });
    const v1 = await runAndWait(f.agentId);

    const put = (system_prompt: string) => call('PUT', `/agents/${f.agentId}`, { system_prompt });
    expect((await put('You review code.\nTARGET-A')).statusCode).toBe(200);
    const v2 = await runAndWait(f.agentId);
    expect((await put('You review code.\nTARGET-A\nFLAG-ALL')).statusCode).toBe(200);
    const v3 = await runAndWait(f.agentId);
    expect([v1.agent_version, v2.agent_version, v3.agent_version]).toEqual([1, 2, 3]);

    const compare = async (a: string, b: string) => {
      const res = await call('GET', `/evals/compare?a=${a}&b=${b}`);
      expect(res.statusCode).toBe(200);
      return EvalCompare.parse(res.json());
    };

    const c12 = await compare(v1.id, v2.id);
    expect(c12.delta.recall!).toBeGreaterThan(0);
    expect(c12.delta.precision).toBeNull(); // v1 kept nothing: precision n/a (AC-25)
    expect(c12.prompt.status).toBe('changed');
    const ops = new Set(c12.prompt.lines.map((l) => l.op));
    expect(ops.has('add')).toBe(true);
    expect(c12.prompt.lines.some((l) => l.op === 'add' && l.text === 'TARGET-A')).toBe(true);

    // argument order does not matter
    const c23 = await compare(v3.id, v2.id);
    expect(c23.earlier.id).toBe(v2.id);
    expect(c23.delta.precision!).toBeLessThan(0);
    // FLAG-ALL also flags d.ts, so D (must_find) flips the other way; A stays passed.
    expect(c23.changed.find((c) => c.case_id === f.caseIds['b.ts'])).toMatchObject({
      type: 'must_not_flag', earlier: 'passed', later: 'failed',
    });
    expect(c23.changed.find((c) => c.case_id === f.caseIds['d.ts'])).toMatchObject({
      earlier: 'failed', later: 'passed',
    });
    expect(c23.changed.find((c) => c.case_id === f.caseIds['a.ts'])).toBeUndefined();
    expect(c23.agent_id).toBe(f.agentId);
  });

  it('AC-29/AC-30: the dashboard row carries the latest version and metrics; recent runs <= 10, newest first', async () => {
    const f = await fixture();
    await runAndWait(f.agentId);
    await call('PUT', `/agents/${f.agentId}`, { system_prompt: 'You review code.\nTARGET-A' });
    const latest = await runAndWait(f.agentId);
    // older history rows, so the list has to be cut
    await db().insert(t.evalRuns).values(
      Array.from({ length: 12 }, (_, i) => ({
        workspaceId: wsId, agentId: f.agentId, agentVersion: 1, status: 'completed' as const,
        ranAt: new Date(Date.UTC(2020, 0, 1 + i)),
      })),
    );
    const dash = EvalDashboard.parse((await call('GET', '/evals/dashboard')).json());
    const row = dash.agents.find((a) => a.agent_id === f.agentId)!;
    expect(row.cases_total).toBe(3);
    expect(row.latest).toMatchObject({ id: latest.id, agent_version: 2, recall: latest.recall });
    expect(dash.recent_runs.length).toBeLessThanOrEqual(10);
    const times = dash.recent_runs.map((r) => r.started_at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(dash.recent_runs[0]!.started_at >= latest.started_at).toBe(true);
  });
});
