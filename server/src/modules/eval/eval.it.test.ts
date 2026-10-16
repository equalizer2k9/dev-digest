import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockGitHubClient, MockLLMProvider } from '../../adapters/mocks.js';
import { EvalRepository } from './repository.js';
import {
  EvalAgentOverview,
  EvalCaseCreated,
  EvalCaseDraft,
  EvalCaseRow,
  EvalCompare,
  EvalDashboard,
} from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('eval tables (Postgres)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const mkAgent = async (name: string) =>
    (
      await pg.handle.db
        .insert(t.agents)
        .values({ workspaceId, name, provider: 'openai', model: 'm', systemPrompt: 'p' })
        .returning()
    )[0]!;
  const mkCase = (agentId: string, name: string, sourceFindingId?: string) =>
    pg.handle.db
      .insert(t.evalCases)
      .values({ workspaceId, ownerKind: 'agent', ownerId: agentId, agentId, name, sourceFindingId })
      .returning();
  const mkRun = (agentId: string, status: 'running' | 'completed' | 'failed') =>
    pg.handle.db
      .insert(t.evalRuns)
      .values({ workspaceId, agentId, agentVersion: 1, provider: 'openai', model: 'm', status })
      .returning();

  async function columns(table: string): Promise<Record<string, string>> {
    const rows = await pg.handle.db.execute<{ column_name: string; is_nullable: string }>(
      sql`select column_name, is_nullable from information_schema.columns where table_name = ${table}`,
    );
    return Object.fromEntries([...rows].map((r) => [r.column_name, r.is_nullable]));
  }

  it('AC-20: the new columns exist and eval_runs.case_id is nullable', async () => {
    const cases = await columns('eval_cases');
    for (const c of ['agent_id', 'source_finding_id', 'created_at']) expect(cases).toHaveProperty(c);
    const runs = await columns('eval_runs');
    for (const c of [
      'workspace_id', 'agent_id', 'agent_version', 'provider', 'model', 'skills', 'status',
      'has_errors', 'error', 'passed', 'total', 'results', 'finished_at',
    ]) {
      expect(runs).toHaveProperty(c);
    }
    expect(runs.case_id).toBe('YES');
  });

  it('AC-4: a second case with the same source_finding_id is rejected', async () => {
    const agent = await mkAgent('eval-uq');
    const fid = '22222222-2222-4222-8222-222222222222';
    await mkCase(agent.id, 'one', fid);
    await expect(mkCase(agent.id, 'two', fid)).rejects.toThrow();
    // cases without a source finding do not collide
    await mkCase(agent.id, 'free-1');
    await mkCase(agent.id, 'free-2');
  });

  it('AC-13: one running run per agent; running and completed coexist', async () => {
    const agent = await mkAgent('eval-running');
    await mkRun(agent.id, 'running');
    await expect(mkRun(agent.id, 'running')).rejects.toThrow();
    await mkRun(agent.id, 'completed');
    await mkRun(agent.id, 'completed');
    const other = await mkAgent('eval-running-2');
    await mkRun(other.id, 'running');
  });

  it('AC-23: deleting the agent removes its cases and runs', async () => {
    const db = pg.handle.db;
    const agent = await mkAgent('eval-cascade');
    await mkCase(agent.id, 'c');
    await mkRun(agent.id, 'completed');
    await db.delete(t.agents).where(eq(t.agents.id, agent.id));
    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
  });
});

// ============================================================ routes (T-S8)

const PATCH = '@@ -1,3 +1,4 @@\n a\n+b\n c\n d';

d('eval routes (Postgres)', () => {
  let pg: PgFixture;
  let wsId: string;
  let otherWsId: string;
  let llm: MockLLMProvider;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    wsId = ws!.id;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    otherWsId = other!.id;
    llm = new MockLLMProvider();
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { github: new MockGitHubClient(), llm: { openai: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  /** One agent, repo, PR (files a.ts / b.ts / c.ts), review and a set of findings. */
  async function world(workspaceId: string) {
    const n = ++seq;
    const [agent] = await db()
      .insert(t.agents)
      .values({ workspaceId, name: `ag-${n}`, provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `r${n}`, fullName: `acme/r${n}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: n, title: `PR ${n}`, author: 'someone',
        branch: 'f', base: 'main', headSha: 'sha1', body: 'PR body',
      })
      .returning();
    await db().insert(t.prFiles).values([
      { prId: pr!.id, path: 'a.ts', patch: PATCH },
      { prId: pr!.id, path: 'b.ts', patch: PATCH },
      { prId: pr!.id, path: 'c.ts', patch: null },
    ]);
    const mkReview = async (agentId: string | null) =>
      (await db().insert(t.reviews).values({ workspaceId, prId: pr!.id, agentId, kind: 'review' }).returning())[0]!;
    const review = await mkReview(agent!.id);
    const mkFinding = async (
      reviewId: string,
      file: string,
      start: number,
      end: number,
      decision: 'accepted' | 'dismissed' | null,
      title = `finding ${file}:${start}`,
    ) =>
      (
        await db()
          .insert(t.findings)
          .values({
            reviewId, file, startLine: start, endLine: end, severity: 'WARNING', category: 'bug',
            title, rationale: 'r', confidence: 0.9,
            acceptedAt: decision === 'accepted' ? new Date() : null,
            dismissedAt: decision === 'dismissed' ? new Date() : null,
          })
          .returning()
      )[0]!;
    return { agent: agent!, pr: pr!, review, mkReview, mkFinding };
  }

  const post = (url: string, payload?: object) =>
    app.inject({ method: 'POST', url, ...(payload ? { payload } : {}) });
  const patch = (url: string, payload: object) => app.inject({ method: 'PATCH', url, payload });
  const get = (url: string) => app.inject({ method: 'GET', url });
  const del = (url: string) => app.inject({ method: 'DELETE', url });
  const counts = async () => ({
    cases: (await db().select().from(t.evalCases)).length,
    runs: (await db().select().from(t.evalRuns)).length,
  });
  const caseRows = (agentId: string) => db().select().from(t.evalCases).where(eq(t.evalCases.agentId, agentId));

  it('AC-2/AC-4: accepted -> 201 must_find, dismissed -> 201 must_not_flag, a repeat -> 200 with the same id', async () => {
    const w = await world(wsId);
    const acc = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    const dis = await w.mkFinding(w.review.id, 'b.ts', 2, 2, 'dismissed');

    const r1 = await post(`/findings/${acc.id}/eval-case`);
    expect(r1.statusCode).toBe(201);
    const b1 = EvalCaseCreated.parse(r1.json());
    expect(b1).toMatchObject({ created: true, agent_id: w.agent.id, agent_name: w.agent.name });
    expect(b1.case.expectation).toMatchObject({ type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2 });

    const r2 = await post(`/findings/${dis.id}/eval-case`);
    expect(r2.statusCode).toBe(201);
    expect(EvalCaseCreated.parse(r2.json()).case.expectation.type).toBe('must_not_flag');

    const again = await post(`/findings/${acc.id}/eval-case`);
    expect(again.statusCode).toBe(200);
    const b3 = EvalCaseCreated.parse(again.json());
    expect(b3.created).toBe(false);
    expect(b3.case.id).toBe(b1.case.id);
    expect(await caseRows(w.agent.id)).toHaveLength(2);
  });

  it('AC-4: two concurrent POSTs for one finding -> one 201, one 200, one row', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    const [x, y] = await Promise.all([post(`/findings/${f.id}/eval-case`), post(`/findings/${f.id}/eval-case`)]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 201]);
    expect(EvalCaseCreated.parse(x.json()).case.id).toBe(EvalCaseCreated.parse(y.json()).case.id);
    expect(await caseRows(w.agent.id)).toHaveLength(1);
  });

  it('AC-5: refusals give their 422 codes and the table is unchanged', async () => {
    const w = await world(wsId);
    const noAgentReview = await w.mkReview(null);
    const undecided = await w.mkFinding(w.review.id, 'a.ts', 2, 2, null);
    const noAgent = await w.mkFinding(noAgentReview.id, 'a.ts', 2, 2, 'accepted');
    const noPatch = await w.mkFinding(w.review.id, 'c.ts', 2, 2, 'accepted');
    const noHunk = await w.mkFinding(w.review.id, 'a.ts', 50, 50, 'accepted');
    const before = await counts();
    const cases: Array<[string, string]> = [
      [undecided.id, 'eval_case_undecided'],
      [noAgent.id, 'eval_case_no_agent'],
      [noPatch.id, 'eval_case_no_patch'],
      [noHunk.id, 'eval_case_no_hunk'],
    ];
    for (const [id, code] of cases) {
      const res = await post(`/findings/${id}/eval-case`);
      expect(res.statusCode, code).toBe(422);
      expect(res.json().error.code).toBe(code);
    }
    expect(await counts()).toEqual(before);
  });

  it('AC-45/EC-26: an opposite-type case on the same lines is a 409 naming the existing case', async () => {
    const w = await world(wsId);
    const acc = await w.mkFinding(w.review.id, 'a.ts', 2, 3, 'accepted', 'the accepted one');
    const dis = await w.mkFinding(w.review.id, 'a.ts', 3, 4, 'dismissed');
    const same = await w.mkFinding(w.review.id, 'a.ts', 3, 4, 'accepted');
    const first = EvalCaseCreated.parse((await post(`/findings/${acc.id}/eval-case`)).json());
    const res = await post(`/findings/${dis.id}/eval-case`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('eval_case_conflict');
    expect(res.json().error.details).toEqual({ case_id: first.case.id, case_name: 'the accepted one' });
    expect((await post(`/findings/${same.id}/eval-case`)).statusCode).toBe(201);
    expect(await caseRows(w.agent.id)).toHaveLength(2);
  });

  it('AC-3/EC-9: the stored case is byte-equal after re-sync, a new head, review delete and a flipped decision', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    const created = EvalCaseCreated.parse((await post(`/findings/${f.id}/eval-case`)).json());
    const snapshot = async () => JSON.stringify((await caseRows(w.agent.id))[0]);
    const expected = await snapshot();
    const overviewExpectation = async () =>
      EvalAgentOverview.parse((await get(`/agents/${w.agent.id}/evals`)).json()).cases[0]!.expectation;
    const expectation = await overviewExpectation();

    // re-sync: new patch rows
    await db().delete(t.prFiles).where(eq(t.prFiles.prId, w.pr.id));
    await db().insert(t.prFiles).values({ prId: w.pr.id, path: 'a.ts', patch: '@@ -1,1 +1,1 @@\n-x\n+y' });
    expect(await snapshot()).toBe(expected);
    // new head
    await db().update(t.pullRequests).set({ headSha: 'sha2', title: 'renamed' }).where(eq(t.pullRequests.id, w.pr.id));
    expect(await snapshot()).toBe(expected);
    // flipped decision
    expect((await post(`/findings/${f.id}/dismiss`)).statusCode).toBeLessThan(300);
    const repeat = await post(`/findings/${f.id}/eval-case`);
    expect(repeat.statusCode).toBe(200);
    expect(EvalCaseCreated.parse(repeat.json()).case.id).toBe(created.case.id);
    expect(await snapshot()).toBe(expected);
    expect(await overviewExpectation()).toEqual(expectation);
    expect(expectation.type).toBe('must_find');
    // review delete
    expect((await del(`/reviews/${w.review.id}`)).statusCode).toBe(200);
    expect(await snapshot()).toBe(expected);
    expect(await overviewExpectation()).toEqual(expectation);
  });

  it('AC-7: deleting a case removes it from the overview and leaves an earlier run byte-equal', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    const created = EvalCaseCreated.parse((await post(`/findings/${f.id}/eval-case`)).json());
    const [run] = await db()
      .insert(t.evalRuns)
      .values({
        workspaceId: wsId, agentId: w.agent.id, agentVersion: 1, provider: 'openai', model: 'm',
        status: 'completed', passed: 1, total: 1, recall: 1,
        results: [{
          case_id: created.case.id, name: 'x', type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2,
          status: 'passed', kept: 1, dropped: 0, kept_findings: [], cost_usd: null, error: null,
        }],
      })
      .returning();
    const runBefore = JSON.stringify(run);
    const res = await del(`/agents/${w.agent.id}/evals/cases/${created.case.id}`);
    expect(res.statusCode).toBe(204);
    const overview = EvalAgentOverview.parse((await get(`/agents/${w.agent.id}/evals`)).json());
    expect(overview.cases).toHaveLength(0);
    expect(overview.runs).toHaveLength(1);
    const [after] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, run!.id));
    expect(JSON.stringify(after)).toBe(runBefore);
    expect((await del(`/agents/${w.agent.id}/evals/cases/${created.case.id}`)).statusCode).toBe(404);
  });

  it('AC-32: every eval route with another workspace\'s ids is a 404 and nothing changes', async () => {
    const mine = await world(wsId);
    const other = await world(otherWsId);
    const otherFinding = await other.mkFinding(other.review.id, 'a.ts', 2, 2, 'accepted');
    const otherCaseRes = await db()
      .insert(t.evalCases)
      .values({
        workspaceId: otherWsId, ownerKind: 'agent', ownerId: other.agent.id, agentId: other.agent.id, name: 'theirs',
      })
      .returning();
    const [otherRun] = await db()
      .insert(t.evalRuns)
      .values({ workspaceId: otherWsId, agentId: other.agent.id, agentVersion: 1, status: 'completed' })
      .returning();
    const [myRun] = await db()
      .insert(t.evalRuns)
      .values({ workspaceId: wsId, agentId: mine.agent.id, agentVersion: 1, status: 'completed' })
      .returning();
    const before = await counts();
    const calls: Array<[string, string, object?]> = [
      ['POST', `/findings/${otherFinding.id}/eval-case`],
      ['GET', `/findings/${otherFinding.id}/eval-case/draft`],
      ['POST', `/findings/${otherFinding.id}/eval-case/run`, { name: 'x', start_line: 2, end_line: 2 }],
      ['PATCH', `/agents/${other.agent.id}/evals/cases/${otherCaseRes[0]!.id}`, { name: 'x', start_line: 2, end_line: 2 }],
      ['PATCH', `/agents/${mine.agent.id}/evals/cases/${otherCaseRes[0]!.id}`, { name: 'x', start_line: 2, end_line: 2 }],
      ['POST', `/agents/${other.agent.id}/evals/cases/${otherCaseRes[0]!.id}/run`],
      ['POST', `/agents/${mine.agent.id}/evals/cases/${otherCaseRes[0]!.id}/run`],
      ['GET', `/agents/${other.agent.id}/evals`],
      ['DELETE', `/agents/${other.agent.id}/evals/cases/${otherCaseRes[0]!.id}`],
      ['DELETE', `/agents/${mine.agent.id}/evals/cases/${otherCaseRes[0]!.id}`],
      ['POST', `/agents/${other.agent.id}/evals/runs`],
      ['GET', `/evals/compare?a=${otherRun!.id}&b=${myRun!.id}`],
      ['GET', `/evals/compare?a=${myRun!.id}&b=${otherRun!.id}`],
    ];
    for (const [method, url, payload] of calls) {
      const res = await app.inject({ method: method as 'GET', url, ...(payload ? { payload } : {}) });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
    expect(await counts()).toEqual(before);
    expect(llm.calls).toHaveLength(0);
    expect(await db().select().from(t.evalCases).where(eq(t.evalCases.id, otherCaseRes[0]!.id))).toHaveLength(1);
    // the dashboard shows only this workspace
    const dash = EvalDashboard.parse((await get('/evals/dashboard')).json());
    expect(dash.agents.map((a) => a.agent_id)).not.toContain(other.agent.id);
    expect(dash.recent_runs.map((r) => r.id)).not.toContain(otherRun!.id);
  });

  // ---- after the mentor review: modal draft, edited save, PATCH (AC-46, AC-47, AC-51) ----

  it('AC-46: the draft carries the frozen one-file diff and stores nothing; an existing case is reported', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted', 'Draft title');
    const before = await counts();
    const res = await get(`/findings/${f.id}/eval-case/draft`);
    expect(res.statusCode).toBe(200);
    const body = EvalCaseDraft.parse(res.json());
    expect(body.existing).toBeNull();
    expect(body.draft).toMatchObject({
      agent_id: w.agent.id,
      agent_name: w.agent.name,
      name: 'Draft title',
      pr_number: w.pr.number,
      pr_title: w.pr.title,
      expectation: { type: 'must_find', file: 'a.ts', start_line: 2, end_line: 2, title: 'Draft title' },
    });
    expect(body.draft!.input_diff).toContain('+b');
    expect(JSON.stringify(body)).not.toContain('someone'); // the PR author
    expect(await counts()).toEqual(before);
    expect(llm.calls).toHaveLength(0);

    await post(`/findings/${f.id}/eval-case`);
    const again = EvalCaseDraft.parse((await get(`/findings/${f.id}/eval-case/draft`)).json());
    expect(again.draft).toBeNull();
    expect(again.existing?.case.name).toBe('Draft title');
  });

  it('AC-46: the draft refuses an undecided finding with its 422 reason', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, null);
    const res = await get(`/findings/${f.id}/eval-case/draft`);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('eval_case_undecided');
  });

  it('AC-47: Save with an edit stores the name and zone; refusals store nothing', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    const before = await counts();
    const cases: Array<[object, number, string]> = [
      [{ name: '  ', start_line: 2, end_line: 3 }, 422, 'eval_case_bad_name'],
      [{ name: 'x'.repeat(201), start_line: 2, end_line: 3 }, 422, 'eval_case_bad_name'],
      [{ name: 'n', start_line: 3, end_line: 2 }, 422, 'eval_case_bad_zone'],
      [{ name: 'n', start_line: 40, end_line: 41 }, 422, 'eval_case_no_hunk'],
      [{ name: 'n', start_line: 0, end_line: 2 }, 422, 'validation_error'],
    ];
    for (const [payload, status, code] of cases) {
      const res = await post(`/findings/${f.id}/eval-case`, payload);
      expect(res.statusCode, code).toBe(status);
      expect(res.json().error.code).toBe(code);
    }
    expect(await counts()).toEqual(before);

    const ok = await post(`/findings/${f.id}/eval-case`, { name: ' Mine ', start_line: 2, end_line: 3 });
    expect(ok.statusCode).toBe(201);
    const made = EvalCaseCreated.parse(ok.json());
    expect(made.case.name).toBe('Mine');
    expect(made.case.expectation).toMatchObject({ start_line: 2, end_line: 3 });

    // AC-4: a repeat returns the stored case and ignores the edit
    const again = await post(`/findings/${f.id}/eval-case`, { name: 'Other', start_line: 3, end_line: 3 });
    expect(again.statusCode).toBe(200);
    expect(EvalCaseCreated.parse(again.json()).case).toMatchObject({ id: made.case.id, name: 'Mine' });
    expect(llm.calls).toHaveLength(0);
  });

  it('AC-51: PATCH changes the name and zone only; checks, conflict (not with itself) and 404', async () => {
    const w = await world(wsId);
    const acc = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    const dis = await w.mkFinding(w.review.id, 'a.ts', 4, 4, 'dismissed');
    const a = EvalCaseCreated.parse((await post(`/findings/${acc.id}/eval-case`)).json()).case;
    const b = EvalCaseCreated.parse((await post(`/findings/${dis.id}/eval-case`)).json()).case;
    const [rowBefore] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, a.id));
    const url = `/agents/${w.agent.id}/evals/cases/${a.id}`;

    // widening onto its own old zone and a free range is fine (it does not conflict with itself)
    const ok = await patch(url, { name: ' Renamed ', start_line: 1, end_line: 3 });
    expect(ok.statusCode).toBe(200);
    const row = EvalCaseRow.parse(ok.json());
    expect(row).toMatchObject({ id: a.id, name: 'Renamed', latest_status: 'never_run' });
    expect(row.expectation).toMatchObject({ type: 'must_find', file: 'a.ts', start_line: 1, end_line: 3 });
    const [rowAfter] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, a.id));
    expect(rowAfter!.inputDiff).toBe(rowBefore!.inputDiff);
    expect(rowAfter!.inputMeta).toEqual(rowBefore!.inputMeta);
    expect(rowAfter!.sourceFindingId).toBe(rowBefore!.sourceFindingId);

    // reaching the dismissed case's lines (4) conflicts with it
    const clash = await patch(url, { name: 'Renamed', start_line: 1, end_line: 4 });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().error.code).toBe('eval_case_conflict');
    expect(clash.json().error.details).toEqual({ case_id: b.id, case_name: b.name });

    for (const [payload, code] of [
      [{ name: '', start_line: 1, end_line: 3 }, 'eval_case_bad_name'],
      [{ name: 'n', start_line: 3, end_line: 1 }, 'eval_case_bad_zone'],
      [{ name: 'n', start_line: 40, end_line: 41 }, 'eval_case_no_hunk'],
    ] as const) {
      const res = await patch(url, payload);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe(code);
    }
    const [final] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, a.id));
    expect(final!.name).toBe('Renamed');

    const missing = await patch(`/agents/${w.agent.id}/evals/cases/${w.agent.id}`, { name: 'n', start_line: 1, end_line: 2 });
    expect(missing.statusCode).toBe(404);
  });

  it('AC-32: the concurrent-insert fallback never returns another workspace\'s case', async () => {
    const mine = await world(wsId);
    const other = await world(otherWsId);
    const otherFinding = await other.mkFinding(other.review.id, 'a.ts', 2, 2, 'accepted');
    const [theirs] = await db()
      .insert(t.evalCases)
      .values({
        workspaceId: otherWsId, ownerKind: 'agent', ownerId: other.agent.id, agentId: other.agent.id,
        name: 'theirs', sourceFindingId: otherFinding.id,
      })
      .returning();
    const result = await new EvalRepository(db()).createCaseExclusive(
      {
        workspaceId: wsId, ownerKind: 'agent', ownerId: mine.agent.id, agentId: mine.agent.id,
        name: 'mine', sourceFindingId: otherFinding.id,
      },
      () => null,
    );
    expect(result).toEqual({ kind: 'unavailable' });
    const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, otherFinding.id));
    expect(rows.map((r) => r.id)).toEqual([theirs!.id]);
  });

  it('AC-23: DELETE /agents/:id removes its cases and runs', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    expect((await post(`/findings/${f.id}/eval-case`)).statusCode).toBe(201);
    await db().insert(t.evalRuns).values({ workspaceId: wsId, agentId: w.agent.id, agentVersion: 1, status: 'completed' });
    expect((await del(`/agents/${w.agent.id}`)).statusCode).toBe(200);
    expect(await caseRows(w.agent.id)).toHaveLength(0);
    expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, w.agent.id))).toHaveLength(0);
  });

  it('AC-36/AC-31: reads, case POST and DELETE make no model call and no run; bodies parse', async () => {
    const w = await world(wsId);
    const f = await w.mkFinding(w.review.id, 'a.ts', 2, 2, 'accepted');
    const runsBefore = (await counts()).runs;
    const [r1] = await db()
      .insert(t.evalRuns)
      .values({ workspaceId: wsId, agentId: w.agent.id, agentVersion: 1, status: 'completed', recall: 1, precision: null, results: [] })
      .returning();
    const [r2] = await db()
      .insert(t.evalRuns)
      .values({ workspaceId: wsId, agentId: w.agent.id, agentVersion: 1, status: 'completed', recall: 0.5, precision: null, results: [] })
      .returning();

    const created = await post(`/findings/${f.id}/eval-case`);
    EvalCaseCreated.parse(created.json());
    EvalAgentOverview.parse((await get(`/agents/${w.agent.id}/evals`)).json());
    const cmp = await get(`/evals/compare?a=${r1!.id}&b=${r2!.id}`);
    expect(cmp.statusCode).toBe(200);
    EvalCompare.parse(cmp.json());
    EvalDashboard.parse((await get('/evals/dashboard')).json());
    expect((await get(`/pulls/${w.pr.id}/reviews`)).statusCode).toBe(200);
    const caseId = created.json().case.id as string;
    expect((await del(`/agents/${w.agent.id}/evals/cases/${caseId}`)).statusCode).toBe(204);

    expect(llm.calls).toHaveLength(0);
    expect((await counts()).runs).toBe(runsBefore + 2);
  });

  it('compare rejects the same id twice and a non-completed run with 422', async () => {
    const w = await world(wsId);
    const [done] = await db().insert(t.evalRuns).values({ workspaceId: wsId, agentId: w.agent.id, agentVersion: 1, status: 'completed' }).returning();
    const [running] = await db().insert(t.evalRuns).values({ workspaceId: wsId, agentId: w.agent.id, agentVersion: 1, status: 'running' }).returning();
    for (const url of [
      `/evals/compare?a=${done!.id}&b=${done!.id}`,
      `/evals/compare?a=${done!.id}&b=${running!.id}`,
    ]) {
      const res = await get(url);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('eval_compare_invalid');
    }
    // the running row would be reaped by the next buildApp; remove it
    await db().delete(t.evalRuns).where(eq(t.evalRuns.id, running!.id));
  });
});
